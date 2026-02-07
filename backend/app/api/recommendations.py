from fastapi import APIRouter, HTTPException, Depends, Request
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
async def log_engagement(event: EngagementEvent, request: Request):
    """
    Log a user engagement event and trigger online learning.

    Events: like, reply, repost, bookmark, not_interested, block_author, mute_author, view, delete
    """
    try:
        from app.db.supabase import get_supabase_user

        auth_header = request.headers.get("authorization")
        if not auth_header:
            raise HTTPException(status_code=401, detail="Missing Authorization header")
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()
        else:
            token = auth_header.strip()
        if not token:
            raise HTTPException(status_code=401, detail="Invalid Authorization header")

        supabase = get_supabase_user(token)

        data = {
            "user_id": str(event.user_id),
            "post_id": str(event.post_id),
            "event_type": event.event_type,
        }
        if event.timestamp:
            data["created_at"] = event.timestamp.isoformat()

        try:
            result = supabase.table("engagement_events").insert(data).execute()
        except Exception as insert_err:
            # Handle duplicate key violation (PostgreSQL error 23505)
            # This happens if a user likes/bookmarks a post they've already engaged with
            err_str = str(insert_err)
            if "23505" in err_str or (
                hasattr(insert_err, "code") and insert_err.code == "23505"
            ):
                logger.info(
                    f"Engagement already logged: {event.event_type} by user {event.user_id} on post {event.post_id}"
                )
                return {
                    "status": "success",
                    "message": "already_logged",
                    "event_id": None,
                }
            raise insert_err

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


class BookmarkRequest(BaseModel):
    user_id: str
    post_id: str


class DeletePostRequest(BaseModel):
    user_id: str
    post_id: str


@router.post("/bookmark")
async def manage_bookmark(request: BookmarkRequest):
    """
    Toggle bookmark status for a post.
    Returns the new bookmark status (True if bookmarked, False if unbookmarked).
    """
    try:
        from app.db.supabase import get_supabase

        supabase = get_supabase()

        # Check if bookmark already exists
        existing = (
            supabase.table("bookmarks")
            .select("id")
            .eq("user_id", request.user_id)
            .eq("post_id", request.post_id)
            .execute()
        )

        if existing.data:
            # Remove bookmark
            result = (
                supabase.table("bookmarks")
                .delete()
                .eq("user_id", request.user_id)
                .eq("post_id", request.post_id)
                .execute()
            )

            if result.error:
                raise Exception(f"Failed to remove bookmark: {result.error}")

            # Log unbookmark engagement
            try:
                learner = get_online_learning_service()
                learner.process_engagement(
                    user_id=request.user_id,
                    post_id=request.post_id,
                    event_type="unbookmark",
                )
            except Exception as learn_err:
                logger.warning(
                    f"Online learning update failed for unbookmark: {learn_err}"
                )

            return {"status": "success", "bookmarked": False, "action": "removed"}
        else:
            # Add bookmark
            result = (
                supabase.table("bookmarks")
                .insert({"user_id": request.user_id, "post_id": request.post_id})
                .execute()
            )

            if result.error:
                raise Exception(f"Failed to add bookmark: {result.error}")

            # Log bookmark engagement
            try:
                learner = get_online_learning_service()
                learner.process_engagement(
                    user_id=request.user_id,
                    post_id=request.post_id,
                    event_type="bookmark",
                )
            except Exception as learn_err:
                logger.warning(
                    f"Online learning update failed for bookmark: {learn_err}"
                )

            return {
                "status": "success",
                "bookmarked": True,
                "action": "added",
                "bookmark_id": result.data[0]["id"] if result.data else None,
            }

    except Exception as e:
        logger.error(f"Error managing bookmark: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, request: DeletePostRequest):
    """
    Delete a post. Only the post author can delete their own posts.
    This will cascade delete all replies and related data.
    """
    try:
        from app.db.supabase import get_supabase

        supabase = get_supabase()

        # Verify the user is the author of the post
        post_check = (
            supabase.table("posts")
            .select("author_id, reply_count")
            .eq("id", post_id)
            .single()
            .execute()
        )

        if not post_check.data:
            raise HTTPException(status_code=404, detail="Post not found")

        if post_check.data["author_id"] != request.user_id:
            raise HTTPException(
                status_code=403, detail="Only the post author can delete this post"
            )

        # Delete the post (cascading delete will handle replies, likes, bookmarks, etc.)
        result = (
            supabase.table("posts")
            .delete()
            .eq("id", post_id)
            .eq("author_id", request.user_id)
            .execute()
        )

        if result.error:
            raise Exception(f"Failed to delete post: {result.error}")

        # Log delete engagement for analytics
        try:
            learner = get_online_learning_service()
            learner.process_engagement(
                user_id=request.user_id,
                post_id=post_id,
                event_type="delete",
            )
        except Exception as learn_err:
            logger.warning(f"Online learning update failed for delete: {learn_err}")

        logger.info(f"Post {post_id} deleted by user {request.user_id}")
        reply_count = post_check.data.get("reply_count", 0)

        return {
            "status": "success",
            "post_id": post_id,
            "deleted_replies": reply_count,
            "message": f"Post and {reply_count} replies deleted successfully"
            if reply_count > 0
            else "Post deleted successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting post {post_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/bookmarks/{user_id}")
async def get_user_bookmarks(user_id: str, limit: int = 50, offset: int = 0):
    """
    Get bookmarked posts for a user.
    """
    try:
        from app.db.supabase import get_supabase

        supabase = get_supabase()

        # Use the user_bookmarks view we created
        result = (
            supabase.table("user_bookmarks")
            .select("*")
            .eq("user_id", user_id)
            .order("bookmarked_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        if result.error:
            raise Exception(f"Failed to fetch bookmarks: {result.error}")

        bookmarks = result.data or []

        return {
            "status": "success",
            "bookmarks": bookmarks,
            "count": len(bookmarks),
            "has_more": len(bookmarks) == limit,
        }

    except Exception as e:
        logger.error(f"Error fetching bookmarks for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "services": {"pipeline": "ok", "minilm": "ok"}}
