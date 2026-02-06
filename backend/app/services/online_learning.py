"""Online learning: real-time embedding updates on engagement events."""

import json
import numpy as np
from typing import Optional
from uuid import UUID

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
        """
        signal = SIGNAL_MAP.get(event_type, 0.0)
        if signal == 0.0:
            return  # Nothing to update for views

        user_emb = self._get_user_embedding(user_id)
        post_emb = self._get_post_embedding(post_id)

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


# Singleton
_online_learning: Optional[OnlineLearningService] = None


def get_online_learning_service() -> OnlineLearningService:
    global _online_learning
    if _online_learning is None:
        _online_learning = OnlineLearningService()
    return _online_learning
