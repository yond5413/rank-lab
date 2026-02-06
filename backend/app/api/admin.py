from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
import json
import numpy as np
from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()
router = APIRouter()


class BatchConfig(BaseModel):
    """Configuration for attention masking verification batch."""
    post_id: str
    candidate_positions: List[int]


class AttentionVerificationRequest(BaseModel):
    """Request for attention masking verification."""
    post_id: str
    batch_configs: List[BatchConfig]


@router.get("/weights")
async def get_scoring_weights():
    """Get current scoring weights."""
    try:
        from app.db.supabase import get_supabase

        supabase = get_supabase()

        response = supabase.table("scoring_weights").select("*").execute()

        if not response.data:
            # Return defaults if no weights in DB
            return {"weights": settings.DEFAULT_WEIGHTS, "source": "defaults"}

        weights = {
            w["action_type"]: w["weight"] for w in response.data if w["is_active"]
        }
        return {"weights": weights, "source": "database"}
    except Exception as e:
        return {
            "weights": settings.DEFAULT_WEIGHTS,
            "source": "fallback",
            "error": str(e),
        }


@router.post("/weights")
async def update_scoring_weights(weights: dict):
    """Update scoring weights."""
    try:
        from app.db.supabase import get_supabase
        from datetime import datetime

        supabase = get_supabase()

        for action_type, weight in weights.items():
            data = {
                "action_type": action_type,
                "weight": weight,
                "updated_at": datetime.utcnow().isoformat(),
            }
            supabase.table("scoring_weights").upsert(data).execute()

        return {"status": "success", "updated_weights": weights}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_system_stats():
    """Get system statistics."""
    try:
        from app.db.supabase import get_supabase

        supabase = get_supabase()

        stats = {}

        # Count embeddings
        try:
            response = (
                supabase.table("user_embeddings")
                .select("count", count="exact")
                .execute()
            )
            stats["user_embeddings"] = response.count
        except:
            stats["user_embeddings"] = 0

        try:
            response = (
                supabase.table("post_embeddings")
                .select("count", count="exact")
                .execute()
            )
            stats["post_embeddings"] = response.count
        except:
            stats["post_embeddings"] = 0

        try:
            response = (
                supabase.table("engagement_events")
                .select("count", count="exact")
                .execute()
            )
            stats["engagement_events"] = response.count
        except:
            stats["engagement_events"] = 0

        return stats
    except Exception as e:
        return {"error": str(e)}


@router.post("/attention-verification")
async def test_attention_masking(request: AttentionVerificationRequest):
    """Test candidate isolation consistency by scoring same post in different batches."""
    try:
        from app.db.supabase import get_supabase
        from app.services.minilm_ranker import get_minilm_ranker
        
        supabase = get_supabase()
        ranker = get_minilm_ranker()
        
        # Get post content
        post_response = supabase.table("posts").select("*").eq("id", request.post_id).execute()
        if not post_response.data:
            raise HTTPException(status_code=404, detail="Post not found")
        
        post = post_response.data[0]
        user_context = f"Test user context"  # Simplified for testing
        
        results = []
        for i, batch_config in enumerate(request.batch_configs):
            # Create test candidates with the target post at different positions
            test_candidates = []
            for j, pos in enumerate(batch_config.candidate_positions):
                if j == pos:
                    test_candidates.append({"text": post["content"] or post.get("text", "")})
                else:
                    test_candidates.append({"text": f"Dummy candidate {j}"})
            
            # Score the batch
            predictions = ranker.rank_candidates(user_context, test_candidates)
            target_score = predictions[pos] if pos < len(predictions) else None
            
            results.append({
                "batch_id": i,
                "target_position": pos,
                "target_score": target_score,
                "all_scores": predictions
            })
        
        # Calculate consistency metrics
        target_scores = [r["target_score"] for r in results if r["target_score"] is not None]
        if len(target_scores) > 1:
            score_variance = np.var(target_scores)
            max_diff = max(target_scores) - min(target_scores)
            is_consistent = max_diff < 0.01  # Epsilon threshold
        else:
            score_variance = 0.0
            max_diff = 0.0
            is_consistent = True
        
        # Log the verification result
        log_data = {
            "post_id": request.post_id,
            "batch_1_score": target_scores[0] if len(target_scores) > 0 else None,
            "batch_2_score": target_scores[1] if len(target_scores) > 1 else None,
            "score_diff": max_diff,
            "test_timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            supabase.table("attention_verification_logs").insert(log_data).execute()
        except Exception as log_error:
            logger.warning(f"Failed to log attention verification: {log_error}")
        
        return {
            "post_id": request.post_id,
            "results": results,
            "consistency_metrics": {
                "is_consistent": is_consistent,
                "max_score_diff": max_diff,
                "score_variance": score_variance,
                "threshold": 0.01
            }
        }
        
    except Exception as e:
        logger.error(f"Attention verification failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/embedding-analytics")
async def get_embedding_analytics(timeframe: str = Query("24h", description="Time window: 1h, 24h, 7d, 30d")):
    """Get embedding distribution and drift metrics."""
    try:
        from app.db.supabase import get_supabase
        
        supabase = get_supabase()
        
        # Parse timeframe
        timeframe_map = {
            "1h": timedelta(hours=1),
            "24h": timedelta(days=1),
            "7d": timedelta(days=7),
            "30d": timedelta(days=30)
        }
        
        if timeframe not in timeframe_map:
            raise HTTPException(status_code=400, detail="Invalid timeframe")
        
        cutoff_time = datetime.utcnow() - timeframe_map[timeframe]
        
        analytics = {}
        
        # User embedding analytics
        try:
            user_response = supabase.table("user_embeddings").select("*").execute()
            if user_response.data:
                embeddings = []
                for row in user_response.data:
                    try:
                        emb = json.loads(row["embedding_128"])
                        embeddings.append(emb)
                    except:
                        continue
                
                if embeddings:
                    embeddings_array = np.array(embeddings)
                    analytics["user_embeddings"] = {
                        "count": len(embeddings),
                        "mean_norm": float(np.mean(np.linalg.norm(embeddings_array, axis=1))),
                        "std_norm": float(np.std(np.linalg.norm(embeddings_array, axis=1))),
                        "dimension": embeddings_array.shape[1] if len(embeddings_array) > 0 else 0
                    }
                else:
                    analytics["user_embeddings"] = {"count": 0, "mean_norm": 0, "std_norm": 0, "dimension": 0}
            else:
                analytics["user_embeddings"] = {"count": 0, "mean_norm": 0, "std_norm": 0, "dimension": 0}
        except Exception as e:
            analytics["user_embeddings"] = {"error": str(e)}
        
        # Post embedding analytics
        try:
            post_response = supabase.table("post_embeddings").select("*").execute()
            if post_response.data:
                embeddings = []
                pretrained_count = 0
                for row in post_response.data:
                    try:
                        emb = json.loads(row["embedding_128"])
                        embeddings.append(emb)
                        if row.get("is_pretrained", True):
                            pretrained_count += 1
                    except:
                        continue
                
                if embeddings:
                    embeddings_array = np.array(embeddings)
                    analytics["post_embeddings"] = {
                        "count": len(embeddings),
                        "pretrained_count": pretrained_count,
                        "personalized_count": len(embeddings) - pretrained_count,
                        "mean_norm": float(np.mean(np.linalg.norm(embeddings_array, axis=1))),
                        "std_norm": float(np.std(np.linalg.norm(embeddings_array, axis=1))),
                        "dimension": embeddings_array.shape[1] if len(embeddings_array) > 0 else 0
                    }
                else:
                    analytics["post_embeddings"] = {"count": 0, "pretrained_count": 0, "personalized_count": 0, "mean_norm": 0, "std_norm": 0, "dimension": 0}
            else:
                analytics["post_embeddings"] = {"count": 0, "pretrained_count": 0, "personalized_count": 0, "mean_norm": 0, "std_norm": 0, "dimension": 0}
        except Exception as e:
            analytics["post_embeddings"] = {"error": str(e)}
        
        # Cold start metrics
        try:
            recent_posts = supabase.table("posts").select("id").gte("created_at", cutoff_time.isoformat()).execute()
            recent_post_count = len(recent_posts.data) if recent_posts.data else 0
            
            if recent_post_count > 0:
                recent_post_ids = [p["id"] for p in recent_posts.data]
                embedded_posts = supabase.table("post_embeddings").select("post_id").in_("post_id", recent_post_ids).execute()
                embedded_count = len(embedded_posts.data) if embedded_posts.data else 0
                coverage = embedded_count / recent_post_count if recent_post_count > 0 else 0
            else:
                coverage = 1.0  # No new posts, so coverage is complete
            
            analytics["cold_start"] = {
                "recent_posts": recent_post_count,
                "embedded_posts": embedded_count if recent_post_count > 0 else 0,
                "coverage_ratio": coverage,
                "timeframe": timeframe
            }
        except Exception as e:
            analytics["cold_start"] = {"error": str(e)}
        
        return analytics
        
    except Exception as e:
        logger.error(f"Embedding analytics failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pipeline-performance")
async def get_pipeline_metrics(timeframe: str = Query("1h", description="Time window: 1h, 24h, 7d")):
    """Get real-time pipeline performance metrics."""
    try:
        from app.db.supabase import get_supabase
        
        supabase = get_supabase()
        
        # Parse timeframe
        timeframe_map = {
            "1h": timedelta(hours=1),
            "24h": timedelta(days=1),
            "7d": timedelta(days=7)
        }
        
        if timeframe not in timeframe_map:
            raise HTTPException(status_code=400, detail="Invalid timeframe")
        
        cutoff_time = datetime.utcnow() - timeframe_map[timeframe]
        
        metrics = {}
        
        # Engagement event throughput (proxy for recommendation requests)
        try:
            events_response = supabase.table("engagement_events").select("created_at").gte("created_at", cutoff_time.isoformat()).execute()
            
            if events_response.data:
                event_count = len(events_response.data)
                hours = timeframe_map[timeframe].total_seconds() / 3600
                throughput = event_count / hours if hours > 0 else 0
                
                # Calculate hourly distribution
                hourly_counts = {}
                for event in events_response.data:
                    try:
                        event_time = datetime.fromisoformat(event["created_at"].replace("Z", "+00:00"))
                        hour_key = event_time.strftime("%Y-%m-%d %H:00")
                        hourly_counts[hour_key] = hourly_counts.get(hour_key, 0) + 1
                    except:
                        continue
                
                metrics["throughput"] = {
                    "total_events": event_count,
                    "events_per_hour": throughput,
                    "timeframe": timeframe,
                    "hourly_distribution": hourly_counts
                }
            else:
                metrics["throughput"] = {
                    "total_events": 0,
                    "events_per_hour": 0,
                    "timeframe": timeframe,
                    "hourly_distribution": {}
                }
        except Exception as e:
            metrics["throughput"] = {"error": str(e)}
        
        # System health indicators
        try:
            # Check recent embedding updates
            recent_user_embeddings = supabase.table("user_embeddings").select("updated_at").gte("updated_at", cutoff_time.isoformat()).execute()
            recent_post_embeddings = supabase.table("post_embeddings").select("computed_at").gte("computed_at", cutoff_time.isoformat()).execute()
            
            metrics["system_health"] = {
                "recent_user_embedding_updates": len(recent_user_embeddings.data) if recent_user_embeddings.data else 0,
                "recent_post_embedding_updates": len(recent_post_embeddings.data) if recent_post_embeddings.data else 0,
                "embedding_update_rate": (len(recent_user_embeddings.data or []) + len(recent_post_embeddings.data or [])) / (timeframe_map[timeframe].total_seconds() / 3600),
                "status": "healthy" if (recent_user_embeddings.data or recent_post_embeddings.data) else "warning"
            }
        except Exception as e:
            metrics["system_health"] = {"error": str(e)}
        
        return metrics
        
    except Exception as e:
        logger.error(f"Pipeline performance metrics failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/model-diagnostics")
async def get_model_diagnostics(user_id: Optional[str] = Query(None, description="Specific user ID for analysis")):
    """Get model prediction analysis and score distributions."""
    try:
        from app.db.supabase import get_supabase
        from app.services.pipeline import get_pipeline
        
        supabase = get_supabase()
        pipeline = get_pipeline()
        
        diagnostics = {}
        
        # Get recent scoring weights usage
        try:
            weights_response = supabase.table("scoring_weights").select("*").execute()
            if weights_response.data:
                active_weights = {w["action_type"]: w["weight"] for w in weights_response.data if w.get("is_active", True)}
                
                # Calculate weight distribution
                positive_weights = {k: v for k, v in active_weights.items() if v > 0}
                negative_weights = {k: v for k, v in active_weights.items() if v < 0}
                
                diagnostics["scoring_weights"] = {
                    "active_weights": active_weights,
                    "positive_actions": len(positive_weights),
                    "negative_actions": len(negative_weights),
                    "weight_range": {
                        "min": min(active_weights.values()) if active_weights else 0,
                        "max": max(active_weights.values()) if active_weights else 0,
                        "mean": sum(active_weights.values()) / len(active_weights) if active_weights else 0
                    }
                }
            else:
                diagnostics["scoring_weights"] = {"error": "No weights found"}
        except Exception as e:
            diagnostics["scoring_weights"] = {"error": str(e)}
        
        # Engagement pattern analysis
        try:
            # Get recent engagement events
            recent_events = supabase.table("engagement_events").select("*").order("created_at", desc=True).limit(1000).execute()
            
            if recent_events.data:
                event_types = {}
                user_activity = {}
                
                for event in recent_events.data:
                    event_type = event.get("event_type", "unknown")
                    user_id_event = event.get("user_id")
                    
                    event_types[event_type] = event_types.get(event_type, 0) + 1
                    if user_id_event:
                        user_activity[user_id_event] = user_activity.get(user_id_event, 0) + 1
                
                # Calculate engagement distribution
                total_events = len(recent_events.data)
                engagement_distribution = {k: v / total_events for k, v in event_types.items()}
                
                diagnostics["engagement_patterns"] = {
                    "total_recent_events": total_events,
                    "event_type_distribution": engagement_distribution,
                    "unique_active_users": len(user_activity),
                    "avg_events_per_user": sum(user_activity.values()) / len(user_activity) if user_activity else 0,
                    "most_common_events": sorted(event_types.items(), key=lambda x: x[1], reverse=True)[:5]
                }
            else:
                diagnostics["engagement_patterns"] = {"total_recent_events": 0}
        except Exception as e:
            diagnostics["engagement_patterns"] = {"error": str(e)}
        
        # Model configuration
        diagnostics["model_config"] = {
            "embedding_dimension": settings.USER_EMBEDDING_DIM if hasattr(settings, 'USER_EMBEDDING_DIM') else 128,
            "max_in_network_candidates": settings.THUNDER_MAX_RESULTS if hasattr(settings, 'THUNDER_MAX_RESULTS') else 300,
            "max_oon_candidates": settings.PHOENIX_MAX_RESULTS if hasattr(settings, 'PHOENIX_MAX_RESULTS') else 300,
            "result_size": settings.RESULT_SIZE if hasattr(settings, 'RESULT_SIZE') else 30,
            "model_name": "sentence-transformers/all-MiniLM-L6-v2"
        }
        
        return diagnostics
        
    except Exception as e:
        logger.error(f"Model diagnostics failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/weight-history")
async def get_weight_history(action_type: Optional[str] = Query(None, description="Filter by specific action type")):
    """Get weight change history and trends."""
    try:
        from app.db.supabase import get_supabase
        
        supabase = get_supabase()
        
        # Build query
        query = supabase.table("weight_change_history").select("*").order("changed_at", desc=True)
        
        if action_type:
            query = query.eq("action_type", action_type)
        
        # Limit to recent changes
        query = query.limit(100)
        
        response = query.execute()
        
        if not response.data:
            return {"history": [], "summary": {"total_changes": 0}}
        
        history = response.data
        
        # Calculate summary statistics
        action_types = set(h["action_type"] for h in history)
        changes_by_action = {}
        
        for action in action_types:
            action_changes = [h for h in history if h["action_type"] == action]
            if action_changes:
                latest = action_changes[0]  # Most recent first
                oldest = action_changes[-1]
                changes_by_action[action] = {
                    "current_weight": latest["new_weight"],
                    "previous_weight": oldest["old_weight"] if len(action_changes) > 1 else latest["old_weight"],
                    "total_changes": len(action_changes),
                    "last_changed": latest["changed_at"]
                }
        
        return {
            "history": history,
            "summary": {
                "total_changes": len(history),
                "unique_actions": len(action_types),
                "changes_by_action": changes_by_action
            }
        }
        
    except Exception as e:
        logger.error(f"Weight history failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
