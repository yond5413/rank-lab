"""Service for computing and storing post and user embeddings."""

import json
import numpy as np
from typing import List, Optional, Dict, Tuple
from uuid import UUID

from app.core.config import get_settings
from app.core.logging import logger
from app.db.supabase import get_supabase
from app.services.minilm_ranker import get_minilm_ranker
from app.services.two_tower import get_two_tower_model

settings = get_settings()


class EmbeddingService:
    """Manages computation and persistence of post and user embeddings."""

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

    def compute_and_store_user_embedding(
        self, user_id: str, min_engagements: int = 0
    ) -> Optional[np.ndarray]:
        """Compute a 128-dim embedding for a user from their engagement history.

        Steps:
        1. Fetch user's engagement events (last 50)
        2. Get post embeddings for those posts
        3. Build engagement history matrix
        4. Pass through User Tower transformer → 128-dim embedding
        5. Upsert into user_embeddings table

        Args:
            user_id: The user ID to generate embedding for
            min_engagements: Minimum number of engagements required (default: 0)

        Returns:
            User embedding array, or None if insufficient engagements
        """
        try:
            # Step 1: Fetch engagement events
            engagement_response = (
                self.supabase.table("engagement_events")
                .select("post_id, event_type, created_at")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(settings.MAX_HISTORY_LENGTH)
                .execute()
            )

            engagements = engagement_response.data or []
            
            if len(engagements) < min_engagements:
                logger.info(
                    f"User {user_id} has only {len(engagements)} engagements, "
                    f"minimum required is {min_engagements}"
                )
                return None

            if not engagements:
                logger.info(f"No engagement history for user {user_id}")
                return None

            # Step 2: Get unique post IDs
            post_ids = list({e["post_id"] for e in engagements})

            # Step 3: Fetch post embeddings
            post_emb_response = (
                self.supabase.table("post_embeddings")
                .select("post_id, embedding_128")
                .in_("post_id", post_ids)
                .execute()
            )

            post_embeddings_map = {}
            for row in (post_emb_response.data or []):
                post_embeddings_map[row["post_id"]] = np.array(
                    json.loads(row["embedding_128"])
                )

            # Step 4: Build engagement history matrix
            engagement_history = []
            for engagement in engagements:
                post_id = engagement["post_id"]
                if post_id in post_embeddings_map:
                    engagement_history.append(post_embeddings_map[post_id])

            if not engagement_history:
                logger.warning(
                    f"No post embeddings found for user {user_id}'s engagement history"
                )
                return None

            # Step 5: Compute user embedding via User Tower
            user_embedding = self.two_tower.compute_user_embedding(engagement_history)

            # Step 6: Store in database
            data = {
                "user_id": str(user_id),
                "embedding_128": json.dumps(user_embedding.tolist()),
                "engagement_count": len(engagements),
            }

            self.supabase.table("user_embeddings").upsert(data).execute()
            logger.info(
                f"Stored user embedding for {user_id} "
                f"(based on {len(engagement_history)} post embeddings)"
            )

            return user_embedding

        except Exception as e:
            logger.error(f"Failed to compute user embedding for {user_id}: {e}")
            return None

    def backfill_user_embeddings(
        self, min_engagements: int = 0, batch_size: int = 100
    ) -> Dict[str, int]:
        """Generate embeddings for all users with engagement history.

        Args:
            min_engagements: Minimum engagements required to generate embedding
            batch_size: Maximum number of users to process

        Returns:
            Dict with 'processed', 'successful', 'failed' counts
        """
        try:
            # Get all unique user IDs from engagement_events
            users_response = (
                self.supabase.table("engagement_events")
                .select("user_id")
                .execute()
            )
            
            if not users_response.data:
                logger.info("No engagement events found")
                return {"processed": 0, "successful": 0, "failed": 0}

            # Count engagements per user
            user_engagement_counts = {}
            for row in users_response.data:
                user_id = row["user_id"]
                user_engagement_counts[user_id] = (
                    user_engagement_counts.get(user_id, 0) + 1
                )

            # Filter by min_engagements
            users_to_process = [
                user_id
                for user_id, count in user_engagement_counts.items()
                if count >= min_engagements
            ][:batch_size]

            if not users_to_process:
                logger.info(
                    f"No users found with at least {min_engagements} engagements"
                )
                return {"processed": 0, "successful": 0, "failed": 0}

            logger.info(
                f"Processing {len(users_to_process)} users for embedding generation"
            )

            successful = 0
            failed = 0

            for user_id in users_to_process:
                result = self.compute_and_store_user_embedding(
                    user_id, min_engagements
                )
                if result is not None:
                    successful += 1
                else:
                    failed += 1

            logger.info(
                f"Backfill complete: {successful} successful, {failed} failed"
            )
            return {
                "processed": len(users_to_process),
                "successful": successful,
                "failed": failed,
            }

        except Exception as e:
            logger.error(f"Error backfilling user embeddings: {e}")
            return {"processed": 0, "successful": 0, "failed": 0, "error": str(e)}


# Singleton
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
