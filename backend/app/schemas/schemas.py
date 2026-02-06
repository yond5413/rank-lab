from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from uuid import UUID


# Request/Response Models
class RecommendationRequest(BaseModel):
    user_id: UUID
    limit: int = Field(default=30, ge=1, le=100)


class RecommendationResponse(BaseModel):
    user_id: UUID
    posts: List[Dict[str, Any]]
    scores: List[float]
    total_candidates: int
    processing_time_ms: float


class EmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embedding: List[float]
    dimension: int


class EngagementEvent(BaseModel):
    user_id: UUID
    post_id: UUID
    event_type: str  # like, reply, repost, not_interested, etc.
    timestamp: Optional[datetime] = None


# Post Models
class Post(BaseModel):
    id: UUID
    text: str
    author_id: UUID
    created_at: datetime
    retweeted_user_id: Optional[UUID] = None
    retweeted_tweet_id: Optional[UUID] = None
    in_reply_to_tweet_id: Optional[UUID] = None


class PostCandidate(Post):
    author_screen_name: Optional[str] = None
    author_follower_count: Optional[int] = None
    is_in_network: bool = False
    video_duration_ms: Optional[int] = None
    subscription_author_ids: Optional[List[UUID]] = None
    score: Optional[float] = None


# User Models
class User(BaseModel):
    id: UUID
    username: Optional[str] = None


class UserEmbedding(BaseModel):
    user_id: UUID
    embedding_128: List[float]
    engagement_count: int = 0
    updated_at: datetime


class PostEmbedding(BaseModel):
    post_id: UUID
    embedding_128: List[float]
    base_embedding_384: Optional[List[float]] = None
    is_pretrained: bool = True
    computed_at: datetime


class ScoringWeight(BaseModel):
    action_type: str
    weight: float
    description: Optional[str] = None
    is_active: bool = True
    updated_at: datetime
