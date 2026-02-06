from sqlalchemy import (
    Column,
    String,
    Float,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
import uuid

Base = declarative_base()


class UserEmbeddingModel(Base):
    __tablename__ = "user_embeddings"

    user_id = Column(UUID(as_uuid=True), primary_key=True)
    embedding_128 = Column(Text, nullable=False)  # JSON array
    engagement_count = Column(Integer, default=0)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PostEmbeddingModel(Base):
    __tablename__ = "post_embeddings"

    post_id = Column(UUID(as_uuid=True), primary_key=True)
    embedding_128 = Column(Text, nullable=False)  # JSON array
    base_embedding_384 = Column(Text, nullable=True)  # JSON array
    is_pretrained = Column(Boolean, default=True)
    computed_at = Column(DateTime(timezone=True), server_default=func.now())


class ScoringWeightModel(Base):
    __tablename__ = "scoring_weights"

    action_type = Column(String(50), primary_key=True)
    weight = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class EngagementEventModel(Base):
    __tablename__ = "engagement_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    post_id = Column(UUID(as_uuid=True), nullable=False)
    event_type = Column(String(50), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TrainingPairModel(Base):
    __tablename__ = "training_pairs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    post_id = Column(UUID(as_uuid=True), nullable=False)
    user_emb = Column(Text, nullable=False)  # JSON array
    post_emb = Column(Text, nullable=False)  # JSON array
    label = Column(Boolean, nullable=False)  # True = positive
    created_at = Column(DateTime(timezone=True), server_default=func.now())
