from supabase import create_client, Client
from app.core.config import get_settings
from app.core.logging import logger

_settings = get_settings()


class SupabaseClient:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SupabaseClient, cls).__new__(cls)
            cls._instance._init_client()
        return cls._instance

    def _init_client(self):
        try:
            self.client: Client = create_client(
                _settings.SUPABASE_URL, _settings.SUPABASE_KEY
            )
            logger.info("Supabase client initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")
            raise

    def get_client(self) -> Client:
        return self.client


def get_supabase() -> Client:
    return SupabaseClient().get_client()
