"""Online learning: real-time embedding updates + batch training."""

import json
import numpy as np
from typing import Optional, List, Dict, Any
from datetime import datetime
import torch
from app.core.config import get_settings
from app.core.logging import logger
from app.db.supabase import get_supabase

settings = get_settings()

# Signal strengths for different engagement types
SIGNAL_MAP = {
    "like": 1.0,
    "reply": 1.5,
    "repost": 1.0,
    "not_interested": -1.0,
    "block_author": -2.0,
    "mute_author": -1.5,
    "view": 0.0,  # Views alone don't update embeddings
}

POST_LEARNING_RATE = 0.01
USER_BASE_ALPHA = 0.1
MIN_ENGAGEMENTS_FOR_AUTO_INIT = 5  # Auto-generate embedding after N engagements


def _to_np(embedding_json: str) -> np.ndarray:
    return np.array(json.loads(embedding_json), dtype=np.float64)


def _normalize(vec: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vec)
    if norm < 1e-8:
        return vec
    return vec / norm


class OnlineLearningService:
    """Handles real-time embedding updates based on user engagement."""

    def __init__(self):
        self.supabase = get_supabase()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_engagement(
        self,
        user_id: str,
        post_id: str,
        event_type: str,
    ) -> None:
        """Process an engagement event and update embeddings.

        Called immediately after the event is written to engagement_events.

        If user has no embedding but has sufficient engagement history,
        automatically initializes their embedding from history.
        """
        signal = SIGNAL_MAP.get(event_type, 0.0)
        if signal == 0.0:
            return  # Nothing to update for views

        user_emb = self._get_user_embedding(user_id)
        post_emb = self._get_post_embedding(post_id)

        # Auto-initialize user embedding if missing but has enough history
        if user_emb is None:
            logger.info(
                f"User {user_id} has no embedding, checking for auto-initialization"
            )
            user_emb = self._try_auto_initialize_user_embedding(user_id)

        if user_emb is None or post_emb is None:
            logger.debug(
                f"Skipping online update – missing embedding "
                f"(user={user_emb is not None}, post={post_emb is not None})"
            )
            return

        # Update both embeddings
        self._update_user_embedding(user_id, post_emb, signal)
        self._update_post_embedding(post_id, user_emb, signal)

    # ------------------------------------------------------------------
    # User embedding update
    # ------------------------------------------------------------------

    def _update_user_embedding(
        self,
        user_id: str,
        post_emb: np.ndarray,
        signal: float,
    ) -> None:
        """Moving-average update: push user embedding toward/away from post."""
        try:
            response = (
                self.supabase.table("user_embeddings")
                .select("embedding_128, engagement_count")
                .eq("user_id", user_id)
                .execute()
            )

            if response.data:
                row = response.data[0]
                current = _to_np(row["embedding_128"])
                count = row.get("engagement_count", 0) or 0
            else:
                current = np.zeros(settings.USER_EMBEDDING_DIM)
                count = 0

            alpha = min(USER_BASE_ALPHA, 1.0 / (count + 1))
            new_emb = (1.0 - alpha) * current + alpha * signal * post_emb
            new_emb = _normalize(new_emb)

            data = {
                "user_id": user_id,
                "embedding_128": json.dumps(new_emb.tolist()),
                "engagement_count": count + 1,
            }
            self.supabase.table("user_embeddings").upsert(data).execute()
            logger.debug(f"Updated user embedding for {user_id} (count={count + 1})")

        except Exception as e:
            logger.error(f"Failed to update user embedding: {e}")

    # ------------------------------------------------------------------
    # Post embedding update
    # ------------------------------------------------------------------

    def _update_post_embedding(
        self,
        post_id: str,
        user_emb: np.ndarray,
        signal: float,
    ) -> None:
        """Nudge post embedding toward/away from user embedding."""
        try:
            response = (
                self.supabase.table("post_embeddings")
                .select("embedding_128")
                .eq("post_id", post_id)
                .execute()
            )

            if not response.data:
                return

            current = _to_np(response.data[0]["embedding_128"])
            new_emb = current + POST_LEARNING_RATE * signal * user_emb
            new_emb = _normalize(new_emb)

            self.supabase.table("post_embeddings").update(
                {"embedding_128": json.dumps(new_emb.tolist()), "is_pretrained": False}
            ).eq("post_id", post_id).execute()

            logger.debug(f"Updated post embedding for {post_id}")

        except Exception as e:
            logger.error(f"Failed to update post embedding: {e}")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_user_embedding(self, user_id: str) -> Optional[np.ndarray]:
        try:
            response = (
                self.supabase.table("user_embeddings")
                .select("embedding_128")
                .eq("user_id", user_id)
                .execute()
            )
            if response.data:
                return _to_np(response.data[0]["embedding_128"])
        except Exception as e:
            logger.warning(f"Could not fetch user embedding: {e}")
        return None

    def _get_post_embedding(self, post_id: str) -> Optional[np.ndarray]:
        try:
            response = (
                self.supabase.table("post_embeddings")
                .select("embedding_128")
                .eq("post_id", post_id)
                .execute()
            )
            if response.data:
                return _to_np(response.data[0]["embedding_128"])
        except Exception as e:
            logger.warning(f"Could not fetch post embedding: {e}")
        return None

    def _try_auto_initialize_user_embedding(self, user_id: str) -> Optional[np.ndarray]:
        """Attempt to auto-initialize user embedding from engagement history.

        This is called when a user has no embedding but is engaging with content.
        If they have enough engagement history (MIN_ENGAGEMENTS_FOR_AUTO_INIT),
        we generate their embedding using the User Tower transformer.

        Returns:
            User embedding if successfully initialized, None otherwise
        """
        try:
            # Check engagement count
            engagement_response = (
                self.supabase.table("engagement_events")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .execute()
            )

            engagement_count = engagement_response.count or 0

            if engagement_count < MIN_ENGAGEMENTS_FOR_AUTO_INIT:
                logger.debug(
                    f"User {user_id} has {engagement_count} engagements, "
                    f"need {MIN_ENGAGEMENTS_FOR_AUTO_INIT} for auto-init"
                )
                return None

            # User has enough history, generate embedding
            logger.info(
                f"Auto-initializing embedding for user {user_id} "
                f"({engagement_count} engagements)"
            )

            # Import here to avoid circular dependency
            from app.services.embedding_service import get_embedding_service

            service = get_embedding_service()
            embedding = service.compute_and_store_user_embedding(
                user_id, min_engagements=0
            )

            if embedding is not None:
                logger.info(
                    f"Successfully auto-initialized embedding for user {user_id}"
                )
                return embedding
            else:
                logger.warning(
                    f"Failed to auto-initialize embedding for user {user_id}"
                )
                return None

        except Exception as e:
            logger.error(f"Error during auto-initialization for user {user_id}: {e}")
            return None


# Singleton
_online_learning: Optional[OnlineLearningService] = None


def get_online_learning_service() -> OnlineLearningService:
    global _online_learning
    if _online_learning is None:
        _online_learning = OnlineLearningService()
    return _online_learning


# ============================================================================
# BATCH TRAINING - MLP Weight Updates
# ============================================================================


class BatchTrainingService:
    """Safe batch training for Two-Tower model weights.

    This runs independently of real-time serving and updates MLP weights
    using contrastive loss from engagement data.
    """

    def __init__(self):
        self.supabase = get_supabase()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.learning_rate = settings.LEARNING_RATE
        self.batch_size = settings.BATCH_SIZE
        self.negative_samples = settings.NEGATIVE_SAMPLES_PER_POSITIVE

    async def collect_training_pairs(self) -> List[Dict[str, Any]]:
        """Generate positive and negative training pairs from engagement events.

        Returns:
            List of training pairs with user_emb, post_emb, and label
        """
        try:
            from datetime import datetime, timedelta

            # Calculate timestamp for 24 hours ago
            cutoff_time = (datetime.utcnow() - timedelta(hours=24)).isoformat()

            # Get recent positive engagements (last 24 hours)
            response = (
                self.supabase.table("engagement_events")
                .select("user_id, post_id, event_type, created_at")
                .filter("event_type", "in", '("like","reply","repost")')
                .gte("created_at", cutoff_time)
                .order("created_at", desc=True)
                .limit(self.batch_size)
                .execute()
            )

            if not response.data:
                logger.info("No recent engagement events found for training")
                return []

            pairs = []

            # Process each positive engagement
            positive_count = 0
            negative_count = 0

            for event in response.data:
                user_id = event["user_id"]
                post_id = event["post_id"]

                # Get user and post embeddings
                user_emb = await self._get_user_embedding(user_id)
                post_emb = await self._get_post_embedding(post_id)

                logger.debug(
                    f"Processing engagement: user={user_id[:8]}..., post={post_id[:8]}..."
                )
                logger.debug(f"  User emb exists: {user_emb is not None}")
                logger.debug(f"  Post emb exists: {post_emb is not None}")

                if user_emb is not None and post_emb is not None:
                    # Positive pair (user engaged with post)
                    pairs.append(
                        {
                            "user_id": user_id,
                            "post_id": post_id,
                            "user_emb": user_emb.tolist(),
                            "post_emb": post_emb.tolist(),
                            "label": True,
                        }
                    )
                    positive_count += 1

                    # Generate negative samples
                    negatives = await self._generate_negative_samples(
                        user_id, event["created_at"]
                    )
                    pairs.extend(negatives)
                    negative_count += len(negatives)
                else:
                    logger.debug("  Skipping: missing embeddings")

            logger.info(
                f"Collected {len(pairs)} training pairs ({positive_count} positive, {negative_count} negative)"
            )
            return pairs

        except Exception as e:
            logger.error(f"Failed to collect training pairs: {e}")
            return []

            pairs = []

            # Process each positive engagement
            for event in response.data:
                user_id = event["user_id"]
                post_id = event["post_id"]

                # Get user and post embeddings
                user_emb = await self._get_user_embedding(user_id)
                post_emb = await self._get_post_embedding(post_id)

                if user_emb is not None and post_emb is not None:
                    # Positive pair (user engaged with post)
                    pairs.append(
                        {
                            "user_id": user_id,
                            "post_id": post_id,
                            "user_emb": user_emb.tolist(),
                            "post_emb": post_emb.tolist(),
                            "label": True,
                        }
                    )

                    # Generate negative samples
                    negatives = await self._generate_negative_samples(
                        user_id, event["created_at"]
                    )
                    pairs.extend(negatives)

            logger.info(
                f"Collected {len(pairs)} training pairs ({len(pairs) // (self.negative_samples + 1)} positive)"
            )
            return pairs

        except Exception as e:
            logger.error(f"Failed to collect training pairs: {e}")
            return []

    async def _get_user_embedding(self, user_id: str) -> Optional[np.ndarray]:
        """Fetch user embedding from database."""
        try:
            response = (
                self.supabase.table("user_embeddings")
                .select("embedding_128")
                .eq("user_id", user_id)
                .execute()
            )
            if response.data:
                return _to_np(response.data[0]["embedding_128"])
        except Exception as e:
            logger.warning(f"Could not fetch user embedding for {user_id}: {e}")
        return None

    async def _get_post_embedding(self, post_id: str) -> Optional[np.ndarray]:
        """Fetch post embedding from database."""
        try:
            response = (
                self.supabase.table("post_embeddings")
                .select("embedding_128")
                .eq("post_id", post_id)
                .execute()
            )
            if response.data:
                return _to_np(response.data[0]["embedding_128"])
        except Exception as e:
            logger.warning(f"Could not fetch post embedding for {post_id}: {e}")
        return None

    async def _generate_negative_samples(
        self, user_id: str, positive_timestamp: str
    ) -> List[Dict[str, Any]]:
        """Generate negative samples: posts user saw but didn't engage with."""
        try:
            from datetime import datetime, timedelta

            # Parse the positive timestamp
            try:
                ts = datetime.fromisoformat(positive_timestamp.replace("Z", "+00:00"))
            except Exception:
                ts = datetime.utcnow()

            start_time = (ts - timedelta(hours=1)).isoformat()
            end_time = ts.isoformat()

            # Get posts from same time period that user engaged with
            engaged_response = (
                self.supabase.table("engagement_events")
                .select("post_id")
                .eq("user_id", user_id)
                .gte("created_at", start_time)
                .lte("created_at", end_time)
                .execute()
            )

            if not engaged_response.data:
                return []

            # Get unique post IDs user engaged with
            engaged_posts = {e["post_id"] for e in engaged_response.data}

            # Get posts user viewed (could be expanded)
            viewed_response = (
                self.supabase.table("engagement_events")
                .select("post_id")
                .eq("user_id", user_id)
                .eq("event_type", "view")
                .gte(
                    "created_at",
                    f"'{positive_timestamp}'::timestamp - interval '1 hour'",
                )
                .lte("created_at", positive_timestamp)
                .execute()
            )

            if not viewed_response.data:
                return []

            negatives = []
            for view_event in viewed_response.data[: self.negative_samples]:
                post_id = view_event["post_id"]
                if post_id not in engaged_posts:
                    post_emb = await self._get_post_embedding(post_id)
                    if post_emb is not None:
                        negatives.append(
                            {
                                "user_id": user_id,
                                "post_id": post_id,
                                "user_emb": None,  # Will fill from positive
                                "post_emb": post_emb.tolist(),
                                "label": False,
                            }
                        )

            return negatives

        except Exception as e:
            logger.warning(f"Failed to generate negative samples: {e}")
            return []

    async def train_candidate_mlp(
        self, pairs: List[Dict[str, Any]]
    ) -> Dict[str, float]:
        """Train Candidate Tower MLP using contrastive loss.

        Args:
            pairs: List of training pairs

        Returns:
            Training metrics: loss, accuracy
        """
        if len(pairs) < 10:
            logger.warning("Insufficient training pairs for batch training")
            return {"loss": 0.0, "accuracy": 0.0}

        try:
            # Import here to avoid circular dependency
            from app.services.two_tower import TwoTowerModel

            model = TwoTowerModel()
            model.candidate_train()
            optimizer = torch.optim.Adam(
                model.candidate_tower.parameters(), lr=self.learning_rate
            )

            # Prepare data
            user_embs = []
            post_embs = []
            labels = []

            for pair in pairs:
                if pair["user_emb"] is not None:
                    user_embs.append(pair["user_emb"])
                    post_embs.append(pair["post_emb"])
                    labels.append(1.0 if pair["label"] else 0.0)

            if len(user_embs) < 10:
                return {"loss": 0.0, "accuracy": 0.0}

            user_tensor = torch.tensor(np.array(user_embs), dtype=torch.float32).to(
                self.device
            )
            post_tensor = torch.tensor(np.array(post_embs), dtype=torch.float32).to(
                self.device
            )
            labels_tensor = torch.tensor(labels, dtype=torch.float32).to(self.device)

            # Training loop
            model.candidate_tower.train()
            total_loss = 0.0
            correct = 0

            for epoch in range(settings.NUM_EPOCHS):
                optimizer.zero_grad()

                # Forward pass
                predicted_post_emb = model.candidate_tower(user_tensor)

                # Contrastive loss: maximize similarity for positive, minimize for negative
                similarities = torch.nn.functional.cosine_similarity(
                    predicted_post_emb, post_tensor, dim=1
                )

                # Binary cross-entropy loss
                loss = torch.nn.functional.binary_cross_entropy_with_logits(
                    similarities, labels_tensor
                )

                # Backward pass
                loss.backward()
                optimizer.step()

                total_loss += loss.item()
                predictions = (similarities > 0.5).float()
                correct += (predictions == labels_tensor).sum().item()

            avg_loss = total_loss / settings.NUM_EPOCHS
            accuracy = correct / len(labels)

            # Save updated weights
            await self._save_model_weights(model)

            logger.info(
                f"Batch training completed: loss={avg_loss:.4f}, accuracy={accuracy:.4f}"
            )

            return {"loss": avg_loss, "accuracy": accuracy}

        except Exception as e:
            logger.error(f"Batch training failed: {e}")
            return {"loss": 0.0, "accuracy": 0.0}

    async def _save_model_weights(self, model):
        """Save model weights to database for persistence."""
        try:
            weights = {
                "version": datetime.utcnow().isoformat(),
                "trained_at": datetime.utcnow().isoformat(),
                "candidate_mlp_state_dict": json.dumps(
                    {
                        k: v.cpu().numpy().tolist()
                        for k, v in model.candidate_tower.state_dict().items()
                    }
                ),
                "training_stats": {
                    "batch_size": self.batch_size,
                    "learning_rate": self.learning_rate,
                },
            }

            self.supabase.table("model_weights").upsert(weights).execute()
            logger.info("Model weights saved to database")

        except Exception as e:
            logger.error(f"Failed to save model weights: {e}")

    async def _log_training_metrics(self, training_result: Dict[str, Any]) -> None:
        """Save training metrics to database."""
        try:
            import uuid

            metrics = {
                "id": str(uuid.uuid4()),
                "trained_at": datetime.utcnow().isoformat(),
                "loss": training_result.get("loss", 0.0),
                "accuracy": training_result.get("accuracy", 0.0),
                "pairs_count": training_result.get("pairs_collected", 0),
                "version": datetime.utcnow().isoformat(),
                "training_stats": {
                    "batch_size": settings.BATCH_SIZE,
                    "learning_rate": settings.LEARNING_RATE,
                },
            }

            self.supabase.table("training_metrics").insert(metrics).execute()
            logger.info(
                f"Training metrics logged: loss={metrics['loss']:.4f}, "
                f"accuracy={metrics['accuracy']:.4f}, pairs={metrics['pairs_count']}"
            )
        except Exception as e:
            logger.error(f"Failed to log training metrics: {e}")

    async def run_batch_training(self) -> Dict[str, Any]:
        """Run complete batch training pipeline.

        Returns:
            Training results: pairs_collected, loss, accuracy
        """
        logger.info("Starting batch training pipeline")

        # Step 1: Collect training pairs
        pairs = await self.collect_training_pairs()

        if len(pairs) < 10:
            logger.warning("Insufficient training data")
            return {"status": "skipped", "reason": "insufficient_data"}

        # Step 2: Train candidate MLP
        metrics = await self.train_candidate_mlp(pairs)

        # Step 3: Log metrics to database
        training_result = {
            "status": "completed",
            "pairs_collected": len(pairs),
            "loss": metrics["loss"],
            "accuracy": metrics["accuracy"],
            "trained_at": datetime.utcnow().isoformat(),
        }

        await self._log_training_metrics(training_result)

        return training_result


# Singleton
_batch_training: Optional[BatchTrainingService] = None


def get_batch_training_service() -> BatchTrainingService:
    global _batch_training
    if _batch_training is None:
        _batch_training = BatchTrainingService()
    return _batch_training
