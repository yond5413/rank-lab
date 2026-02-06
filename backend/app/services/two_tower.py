import torch
import torch.nn as nn
import numpy as np
from typing import List, Tuple
from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()


class UserTower(nn.Module):
    """Transformer-based user tower that processes engagement history."""

    def __init__(
        self, embedding_dim: int = 128, num_heads: int = 4, num_layers: int = 2
    ):
        super().__init__()
        self.embedding_dim = embedding_dim

        # Transformer encoder
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=embedding_dim,
            nhead=num_heads,
            dim_feedforward=embedding_dim * 2,
            batch_first=True,
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)

        # Projection to output embedding
        self.output_projection = nn.Linear(embedding_dim, embedding_dim)

    def forward(
        self, engagement_history: torch.Tensor, mask: torch.Tensor = None
    ) -> torch.Tensor:
        """
        Args:
            engagement_history: [batch_size, seq_len, embedding_dim]
            mask: [batch_size, seq_len] - True for valid positions
        Returns:
            user_embedding: [batch_size, embedding_dim]
        """
        # Pass through transformer
        if mask is not None:
            # Convert padding mask to attention mask format
            attention_mask = ~mask  # True means ignore
            output = self.transformer(
                engagement_history, src_key_padding_mask=attention_mask
            )
        else:
            output = self.transformer(engagement_history)

        # Mean pooling over sequence
        if mask is not None:
            # Masked mean
            mask_expanded = mask.unsqueeze(-1).float()
            sum_embeddings = (output * mask_expanded).sum(dim=1)
            mean_embeddings = sum_embeddings / mask_expanded.sum(dim=1).clamp(min=1)
        else:
            mean_embeddings = output.mean(dim=1)

        # Project to final embedding
        user_embedding = self.output_projection(mean_embeddings)

        # L2 normalize
        user_embedding = torch.nn.functional.normalize(user_embedding, p=2, dim=1)

        return user_embedding


class CandidateTower(nn.Module):
    """MLP-based candidate tower for post embeddings."""

    def __init__(
        self, input_dim: int = 384, hidden_dim: int = 256, output_dim: int = 128
    ):
        super().__init__()

        self.mlp = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.SiLU(),
            nn.Linear(hidden_dim, output_dim),
            nn.SiLU(),
            nn.Linear(output_dim, output_dim),
        )

    def forward(self, post_embedding: torch.Tensor) -> torch.Tensor:
        """
        Args:
            post_embedding: [batch_size, input_dim]
        Returns:
            candidate_embedding: [batch_size, output_dim]
        """
        embedding = self.mlp(post_embedding)
        # L2 normalize
        embedding = torch.nn.functional.normalize(embedding, p=2, dim=1)
        return embedding


class TwoTowerModel:
    """Two-tower retrieval model manager."""

    def __init__(self):
        self.user_tower = UserTower(
            embedding_dim=settings.USER_EMBEDDING_DIM, num_heads=4, num_layers=2
        )
        self.candidate_tower = CandidateTower(
            input_dim=384, hidden_dim=256, output_dim=settings.POST_EMBEDDING_DIM
        )
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.user_tower.to(self.device)
        self.candidate_tower.to(self.device)
        logger.info(f"TwoTowerModel initialized on {self.device}")

    def compute_user_embedding(
        self, engagement_history: List[List[float]]
    ) -> np.ndarray:
        """Compute user embedding from engagement history."""
        if not engagement_history:
            return np.zeros(settings.USER_EMBEDDING_DIM)

        # Convert to tensor
        history_tensor = torch.tensor(
            engagement_history, dtype=torch.float32
        ).unsqueeze(0)
        history_tensor = history_tensor.to(self.device)

        # Create mask (all valid)
        mask = torch.ones(
            history_tensor.size(0), history_tensor.size(1), dtype=torch.bool
        )
        mask = mask.to(self.device)

        with torch.no_grad():
            user_emb = self.user_tower(history_tensor, mask)

        return user_emb.cpu().numpy()[0]

    def compute_post_embedding(self, base_embedding: List[float]) -> np.ndarray:
        """Compute post embedding from MiniLM base embedding."""
        base_tensor = torch.tensor([base_embedding], dtype=torch.float32).to(
            self.device
        )

        with torch.no_grad():
            post_emb = self.candidate_tower(base_tensor)

        return post_emb.cpu().numpy()[0]

    def compute_similarity(
        self, user_emb: np.ndarray, post_embs: np.ndarray
    ) -> np.ndarray:
        """Compute dot product similarity."""
        return np.dot(post_embs, user_emb)


# Singleton instance
_two_tower_model = None


def get_two_tower_model() -> TwoTowerModel:
    global _two_tower_model
    if _two_tower_model is None:
        _two_tower_model = TwoTowerModel()
    return _two_tower_model
