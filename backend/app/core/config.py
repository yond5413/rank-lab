from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Rank Lab API"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    # Model Config
    USER_EMBEDDING_DIM: int = 128
    POST_EMBEDDING_DIM: int = 128
    MAX_HISTORY_LENGTH: int = 50

    # Retrieval Config
    THUNDER_MAX_RESULTS: int = 300
    PHOENIX_MAX_RESULTS: int = 300
    RESULT_SIZE: int = 30

    # Filter Config
    MAX_POST_AGE_DAYS: int = 7

    # MiniLM Config
    MINILM_MODEL_NAME: str = "sentence-transformers/all-MiniLM-L6-v2"
    ACTION_PREDICTIONS: list = [
        "like",
        "reply",
        "repost",
        "not_interested",
        "block_author",
        "mute_author",
    ]

    # Scoring Weights (defaults)
    DEFAULT_WEIGHTS: dict = {
        "like": 1.0,
        "reply": 1.2,
        "repost": 1.0,
        "not_interested": -2.0,
        "block_author": -10.0,
        "mute_author": -5.0,
    }

    # Batch Training Config
    BATCH_SIZE: int = 1000
    TRAINING_TRIGGER_THRESHOLD: int = 1000  # Trigger training every N engagements
    NEGATIVE_SAMPLES_PER_POSITIVE: int = 5
    LEARNING_RATE: float = 0.001
    MLP_HIDDEN_DIM: int = 256
    NUM_EPOCHS: int = 10

    # Engagement Threshold for Auto-Training
    ENGAGEMENT_THRESHOLD: int = 75
    ENABLE_AUTO_TRAINING: bool = True

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings():
    return Settings()
