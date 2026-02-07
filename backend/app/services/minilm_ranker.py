import torch
import torch.nn as nn
import numpy as np
from typing import List, Dict, Tuple, Union
from transformers import AutoModel, AutoTokenizer
from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()


class ActionPredictionHead(nn.Module):
    """Classification head for action predictions.

    Accepts the concatenation of user embedding (384-dim) and post embedding
    (384-dim) for a total input size of 768.
    """

    def __init__(
        self, input_dim: int = 768, hidden_dim: int = 384, num_actions: int = 6
    ):
        super().__init__()
        self.classifier = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim // 2, num_actions),
            nn.Sigmoid(),  # Output probabilities
        )

    def forward(self, hidden_states: torch.Tensor) -> torch.Tensor:
        """
        Args:
            hidden_states: [batch_size, input_dim]  (768 = 384 user + 384 post)
        Returns:
            action_probs: [batch_size, num_actions]
        """
        return self.classifier(hidden_states)


class MiniLMRanker:
    """MiniLM-based ranker with action predictions and candidate isolation."""

    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # Load pre-trained MiniLM
        logger.info(f"Loading MiniLM model: {settings.MINILM_MODEL_NAME}")
        self.tokenizer = AutoTokenizer.from_pretrained(settings.MINILM_MODEL_NAME)
        self.model = AutoModel.from_pretrained(settings.MINILM_MODEL_NAME)
        self.model.eval()
        self.model.to(self.device)

        # Freeze base model
        for param in self.model.parameters():
            param.requires_grad = False

        # Action prediction head (input = concat of user 384 + post 384 = 768)
        self.action_head = ActionPredictionHead(
            input_dim=384 * 2,
            hidden_dim=384,
            num_actions=len(settings.ACTION_PREDICTIONS),
        )
        self.action_head.to(self.device)

        self.action_types = settings.ACTION_PREDICTIONS
        logger.info(
            f"MiniLMRanker initialized with {len(self.action_types)} action types"
        )

    def encode_text(self, text: Union[str, List[str]]) -> np.ndarray:
        """Encode text(s) using MiniLM. Supports batch encoding."""
        is_single = isinstance(text, str)
        texts = [text] if is_single else text

        if not texts:
            return np.array([])

        inputs = self.tokenizer(
            texts,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True,  # Key: batch padding
        )
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model(**inputs)
            # Mean pooling
            attention_mask = inputs["attention_mask"]
            token_embeddings = outputs.last_hidden_state
            input_mask_expanded = attention_mask.unsqueeze(-1).float()
            sum_embeddings = (token_embeddings * input_mask_expanded).sum(dim=1)
            embeddings = sum_embeddings / input_mask_expanded.sum(dim=1).clamp(min=1)

        embeddings = embeddings.cpu().numpy()
        return embeddings[0] if is_single else embeddings

    def create_candidate_isolation_mask(
        self, seq_len: int, user_history_len: int, num_candidates: int
    ) -> torch.Tensor:
        """
        Create attention mask for candidate isolation.

        Candidates can:
        - Attend to user history
        - Attend to themselves

        Candidates CANNOT:
        - Attend to other candidates
        """
        mask = torch.ones(seq_len, seq_len)

        candidate_start = user_history_len
        candidate_end = candidate_start + num_candidates

        # For candidate positions, zero out attention to other candidates
        for i in range(candidate_start, candidate_end):
            for j in range(candidate_start, candidate_end):
                if i != j:  # Not self
                    mask[i, j] = 0

        return mask

    def rank_candidates(
        self, user_context: str, candidate_posts: List[Dict[str, str]]
    ) -> List[Dict[str, float]]:
        """
        Rank candidates with action predictions using batch encoding.

        Args:
            user_context: User's recent engagement context
            candidate_posts: List of post dicts with 'text' key

        Returns:
            List of action prediction dicts for each candidate
        """
        if not candidate_posts:
            return []

        # Encode user context once
        user_emb = self.encode_text(user_context)  # shape: [384]

        # Batch encode all candidates at once
        candidate_texts = [post["text"] for post in candidate_posts]
        candidate_embs = self.encode_text(candidate_texts)  # shape: [N, 384]

        # Prepare batch input for action head
        num_candidates = len(candidate_posts)
        user_emb_tiled = np.tile(user_emb, (num_candidates, 1))  # shape: [N, 384]
        combined = np.concatenate(
            [user_emb_tiled, candidate_embs], axis=1
        )  # shape: [N, 768]

        # Convert to tensor and get predictions in one forward pass
        combined_tensor = torch.tensor(combined, dtype=torch.float32).to(self.device)

        with torch.no_grad():
            action_probs = self.action_head(combined_tensor)  # shape: [N, num_actions]

        # Convert to list of dicts
        predictions = []
        for i in range(num_candidates):
            pred_dict = {
                action: float(action_probs[i][j])
                for j, action in enumerate(self.action_types)
            }
            predictions.append(pred_dict)

        return predictions

    def compute_base_embedding(self, text: str) -> List[float]:
        """Compute 384-dim MiniLM base embedding for a post."""
        return self.encode_text(text).tolist()


# Singleton instance
_minilm_ranker = None


def get_minilm_ranker() -> MiniLMRanker:
    global _minilm_ranker
    if _minilm_ranker is None:
        _minilm_ranker = MiniLMRanker()
    return _minilm_ranker
