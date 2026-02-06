"""Service for computing and storing post embeddings."""

import json
import numpy as np
from typing import List, Optional
from uuid import UUID

from app.core.config import get_settings
from app.core.logging import logger
from app.db.supabase import get_supabase
from app.services.minilm_ranker import get_minilm_ranker
from app.services.two_tower import get_two_tower_model

settings = get_settings()


class EmbeddingService:
    """Manages computation and persistence of post embeddings."""

    def __init__(self):
        self.supabase = get_supabase()
        self.minilm = get_minilm_ranker()
        self.two_tower = get_two_tower_model()

    def compute_and_store_post_embedding(self, post_id: str, content: str) -> np.ndarray:
        """Compute a 128-dim embedding for a post and persist it.

        Steps:
        1. Encode content with MiniLM → 384-dim base embedding
        2. Project through CandidateTower MLP → 128-dim embedding
        3. Upsert into post_embeddings table
        """
        # Step 1: MiniLM base embedding (384-dim)
        base_embedding_384 = self.minilm.compute_base_embedding(content)

        # Step 2: Project to 128-dim via Candidate Tower
        embedding_128 = self.two_tower.compute_post_embedding(base_embedding_384)

        # Step 3: Store in database
        data = {
            "post_id": str(post_id),
            "embedding_128": json.dumps(embedding_128.tolist()),
            "base_embedding_384": json.dumps(base_embedding_384),
            "is_pretrained": True,
        }

        try:
            self.supabase.table("post_embeddings").upsert(data).execute()
            logger.info(f"Stored embedding for post {post_id}")
        except Exception as e:
            logger.error(f"Failed to store embedding for post {post_id}: {e}")

        return embedding_128

    def backfill_missing_embeddings(self, batch_size: int = 50) -> int:
        """Compute embeddings for all posts that don't have one yet.

        Returns the number of posts processed.
        """
        try:
            # Fetch posts without embeddings
            # Get all post ids that already have embeddings
            existing = (
                self.supabase.table("post_embeddings")
                .select("post_id")
                .execute()
            )
            existing_ids = {row["post_id"] for row in (existing.data or [])}

            # Get all posts
            posts_response = (
                self.supabase.table("posts")
                .select("id, content")
                .limit(batch_size)
                .execute()
            )

            if not posts_response.data:
                return 0

            count = 0
            for post in posts_response.data:
                if post["id"] not in existing_ids and post.get("content"):
                    self.compute_and_store_post_embedding(post["id"], post["content"])
                    count += 1

            logger.info(f"Backfilled {count} post embeddings")
            return count

        except Exception as e:
            logger.error(f"Error backfilling embeddings: {e}")
            return 0


# Singleton
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
