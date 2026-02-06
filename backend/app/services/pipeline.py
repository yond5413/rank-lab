from typing import List, Dict, Any, Optional
from datetime import datetime
from uuid import UUID
import asyncio
import numpy as np
import json
from app.core.config import get_settings
from app.core.logging import logger
from app.schemas.schemas import PostCandidate, RecommendationResponse
from app.db.supabase import get_supabase
from app.services.two_tower import get_two_tower_model
from app.services.minilm_ranker import get_minilm_ranker
from app.services.filters import FilterPipeline
from app.services.scoring import ScorerPipeline

settings = get_settings()


class RecommendationPipeline:
    """Main pipeline for generating recommendations."""

    def __init__(self):
        self.two_tower = get_two_tower_model()
        self.minilm = get_minilm_ranker()
        self.supabase = get_supabase()

    async def get_user_embedding(self, user_id: UUID) -> np.ndarray:
        """Fetch user embedding from database or compute from history."""
        try:
            response = (
                self.supabase.table("user_embeddings")
                .select("*")
                .eq("user_id", str(user_id))
                .execute()
            )
            if response.data:
                emb_json = response.data[0]["embedding_128"]
                return np.array(json.loads(emb_json))
        except Exception as e:
            logger.warning(f"Failed to fetch user embedding: {e}")

        # Return zero embedding if not found
        return np.zeros(settings.USER_EMBEDDING_DIM)

    async def get_user_engagement_history(self, user_id: UUID) -> List[Dict]:
        """Fetch user's recent engagement history."""
        try:
            response = (
                self.supabase.table("engagement_events")
                .select("*")
                .eq("user_id", str(user_id))
                .order("created_at", desc=True)
                .limit(settings.MAX_HISTORY_LENGTH)
                .execute()
            )
            return response.data or []
        except Exception as e:
            logger.warning(f"Failed to fetch engagement history: {e}")
            return []

    async def get_following_list(self, user_id: UUID) -> List[UUID]:
        """Fetch user's following list."""
        try:
            response = (
                self.supabase.table("follows")
                .select("following_id")
                .eq("follower_id", str(user_id))
                .execute()
            )
            return (
                [UUID(f["following_id"]) for f in response.data]
                if response.data
                else []
            )
        except Exception as e:
            logger.warning(f"Failed to fetch following list: {e}")
            return []

    async def get_blocked_muted_authors(
        self, user_id: UUID
    ) -> tuple[List[UUID], List[UUID]]:
        """Fetch blocked and muted authors."""
        blocked = []
        muted = []

        try:
            # Query blocked users
            response = (
                self.supabase.table("blocks")
                .select("blocked_id")
                .eq("blocker_id", str(user_id))
                .execute()
            )
            blocked = (
                [UUID(b["blocked_id"]) for b in response.data] if response.data else []
            )

            # Query muted users
            response = (
                self.supabase.table("mutes")
                .select("muted_id")
                .eq("muter_id", str(user_id))
                .execute()
            )
            muted = (
                [UUID(m["muted_id"]) for m in response.data] if response.data else []
            )
        except Exception as e:
            logger.warning(f"Failed to fetch blocked/muted: {e}")

        return blocked, muted

    async def fetch_in_network_candidates(
        self, following: List[UUID], limit: int = 300
    ) -> List[PostCandidate]:
        """Fetch recent posts from followed users."""
        if not following:
            return []

        try:
            following_str = [str(f) for f in following]
            response = (
                self.supabase.table("posts")
                .select("*")
                .in_("author_id", following_str)
                .is_("parent_id", "null")  # Only top-level posts, not replies
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )

            candidates = []
            for post in response.data:
                candidates.append(
                    PostCandidate(
                        id=UUID(post["id"]),
                        text=post.get("content", "") or post.get("text", ""),
                        author_id=UUID(post["author_id"]),
                        created_at=datetime.fromisoformat(
                            post["created_at"].replace("Z", "+00:00")
                        ),
                        is_in_network=True,
                    )
                )
            return candidates
        except Exception as e:
            logger.error(f"Failed to fetch in-network candidates: {e}")
            return []

    async def fetch_out_of_network_candidates(
        self, user_embedding: np.ndarray, limit: int = 300
    ) -> List[PostCandidate]:
        """Fetch posts using two-tower similarity."""
        try:
            # Get all post embeddings
            response = (
                self.supabase.table("post_embeddings").select("*").limit(1000).execute()
            )

            if not response.data:
                return []

            # Compute similarities
            similarities = []
            for post_emb in response.data:
                emb = np.array(json.loads(post_emb["embedding_128"]))
                similarity = np.dot(user_embedding, emb)
                similarities.append((post_emb["post_id"], similarity))

            # Sort by similarity
            similarities.sort(key=lambda x: x[1], reverse=True)
            top_post_ids = [s[0] for s in similarities[:limit]]

            if not top_post_ids:
                return []

            # Fetch post details (only top-level posts, not replies)
            response = (
                self.supabase.table("posts")
                .select("*")
                .in_("id", top_post_ids)
                .is_("parent_id", "null")
                .execute()
            )

            candidates = []
            for post in response.data:
                candidates.append(
                    PostCandidate(
                        id=UUID(post["id"]),
                        text=post.get("content", "") or post.get("text", ""),
                        author_id=UUID(post["author_id"]),
                        created_at=datetime.fromisoformat(
                            post["created_at"].replace("Z", "+00:00")
                        ),
                        is_in_network=False,
                    )
                )
            return candidates
        except Exception as e:
            logger.error(f"Failed to fetch OON candidates: {e}")
            return []

    async def _load_scoring_weights(self) -> Dict[str, float]:
        """Load active scoring weights from the database."""
        try:
            response = (
                self.supabase.table("scoring_weights")
                .select("action_type, weight, is_active")
                .execute()
            )
            if response.data:
                weights = {
                    row["action_type"]: row["weight"]
                    for row in response.data
                    if row.get("is_active", True)
                }
                if weights:
                    logger.debug(f"Loaded {len(weights)} scoring weights from DB")
                    return weights
        except Exception as e:
            logger.warning(f"Failed to load scoring weights from DB: {e}")

        return settings.DEFAULT_WEIGHTS

    async def generate_recommendations(
        self, user_id: UUID, limit: int = 30
    ) -> RecommendationResponse:
        """Generate recommendations for a user."""
        start_time = datetime.utcnow()

        # Step 1: Query Hydration
        logger.info(f"Generating recommendations for user {user_id}")
        user_embedding = await self.get_user_embedding(user_id)
        following = await self.get_following_list(user_id)
        blocked, muted = await self.get_blocked_muted_authors(user_id)

        # Step 2: Candidate Sourcing (parallel)
        in_network, oon_candidates = await asyncio.gather(
            self.fetch_in_network_candidates(following, settings.THUNDER_MAX_RESULTS),
            self.fetch_out_of_network_candidates(
                user_embedding, settings.PHOENIX_MAX_RESULTS
            ),
        )

        all_candidates = in_network + oon_candidates
        total_candidates = len(all_candidates)
        logger.info(
            f"Sourced {total_candidates} candidates ({len(in_network)} in-network, {len(oon_candidates)} OON)"
        )

        if not all_candidates:
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            return RecommendationResponse(
                user_id=user_id,
                posts=[],
                scores=[],
                total_candidates=0,
                processing_time_ms=processing_time,
            )

        # Step 3: Pre-Scoring Filters
        filter_pipeline = FilterPipeline(user_id, blocked, muted)
        filtered_candidates, filter_stats = filter_pipeline.apply(all_candidates)
        logger.info(f"Filters applied: {filter_stats}")

        if not filtered_candidates:
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            return RecommendationResponse(
                user_id=user_id,
                posts=[],
                scores=[],
                total_candidates=total_candidates,
                processing_time_ms=processing_time,
            )

        # Step 4: MiniLM Ranking
        user_context = f"User {user_id}"  # Simplified - could use engagement history
        candidate_dicts = [{"text": c.text} for c in filtered_candidates]
        predictions = self.minilm.rank_candidates(user_context, candidate_dicts)

        # Step 5: Scoring (load weights from DB)
        db_weights = await self._load_scoring_weights()
        scorer = ScorerPipeline(weights=db_weights)
        scored_candidates = scorer.score(filtered_candidates, predictions)

        # Step 6: Selection (Top-K)
        top_k = scored_candidates[:limit]

        # Format response
        posts = []
        scores = []
        for candidate, score in top_k:
            posts.append(
                {
                    "id": str(candidate.id),
                    "text": candidate.text,
                    "author_id": str(candidate.author_id),
                    "is_in_network": candidate.is_in_network,
                }
            )
            scores.append(score)

        processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        return RecommendationResponse(
            user_id=user_id,
            posts=posts,
            scores=scores,
            total_candidates=total_candidates,
            processing_time_ms=processing_time,
        )


# Singleton
_pipeline = None


def get_pipeline() -> RecommendationPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = RecommendationPipeline()
    return _pipeline
