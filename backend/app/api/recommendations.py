from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any
from uuid import UUID

from app.schemas.schemas import (
    RecommendationRequest,
    RecommendationResponse,
    EmbedRequest,
    EmbedResponse,
    EngagementEvent,
)
from app.services.pipeline import get_pipeline
from app.services.minilm_ranker import get_minilm_ranker
from app.services.embedding_service import get_embedding_service
from app.services.online_learning import get_online_learning_service
from app.core.logging import logger

router = APIRouter()


@router.post("/recommend", response_model=RecommendationResponse)
async def get_recommendations(request: RecommendationRequest):
    """
    Generate personalized recommendations for a user.

    Pipeline:
    1. Query Hydration (user embedding + following list)
    2. Candidate Sourcing (in-network + out-of-network)
    3. Pre-Scoring Filters
    4. MiniLM Ranking
    5. Weighted Scoring
    6. Top-K Selection
    """
    try:
        pipeline = get_pipeline()
        response = await pipeline.generate_recommendations(
            user_id=request.user_id, limit=request.limit
        )
        return response
    except Exception as e:
        logger.error(f"Error generating recommendations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/embed", response_model=EmbedResponse)
async def embed_text(request: EmbedRequest):
    """
    Generate embedding for a text using MiniLM.
    """
    try:
        ranker = get_minilm_ranker()
        embedding = ranker.compute_base_embedding(request.text)
        return EmbedResponse(embedding=embedding, dimension=len(embedding))
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class EmbedPostRequest(BaseModel):
    post_id: str
    content: str


@router.post("/embed-post")
async def embed_post(request: EmbedPostRequest):
    """Compute and store a 128-dim embedding for a post.

    Should be called whenever a new post is created so that it can
    appear in out-of-network candidate retrieval.
    """
    try:
        service = get_embedding_service()
        embedding = service.compute_and_store_post_embedding(
            request.post_id, request.content
        )
        return {
            "status": "success",
            "post_id": request.post_id,
            "dimension": len(embedding),
        }
    except Exception as e:
        logger.error(f"Error embedding post {request.post_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backfill-embeddings")
async def backfill_embeddings(batch_size: int = 50):
    """Compute embeddings for all posts that don't have one yet."""
    try:
        service = get_embedding_service()
        count = service.backfill_missing_embeddings(batch_size)
        return {"status": "success", "processed": count}
    except Exception as e:
        logger.error(f"Error backfilling embeddings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/engage")
async def log_engagement(event: EngagementEvent):
    """
    Log a user engagement event and trigger online learning.

    Events: like, reply, repost, not_interested, block_author, mute_author, view
    """
    try:
        from app.db.supabase import get_supabase

        supabase = get_supabase()

        data = {
            "user_id": str(event.user_id),
            "post_id": str(event.post_id),
            "event_type": event.event_type,
            "created_at": event.timestamp.isoformat() if event.timestamp else "now()",
        }

        result = supabase.table("engagement_events").insert(data).execute()

        # Trigger online learning (embedding updates)
        try:
            learner = get_online_learning_service()
            learner.process_engagement(
                user_id=str(event.user_id),
                post_id=str(event.post_id),
                event_type=event.event_type,
            )
        except Exception as learn_err:
            # Don't fail the request if learning update fails
            logger.warning(f"Online learning update failed: {learn_err}")

        logger.info(
            f"Logged engagement: {event.event_type} by user {event.user_id} on post {event.post_id}"
        )
        return {
            "status": "success",
            "event_id": result.data[0]["id"] if result.data else None,
        }
    except Exception as e:
        logger.error(f"Error logging engagement: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "services": {"pipeline": "ok", "minilm": "ok"}}
