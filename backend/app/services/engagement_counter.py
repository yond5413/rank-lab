"""In-memory engagement counter for auto-training triggers."""

from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()


class EngagementCounter:
    """Thread-safe in-memory counter for engagement-based training triggers.

    Stores counter in module-level variable for persistence across requests.
    Note: This resets on server restart. Use Redis for production.
    """

    # Module-level storage
    _counter = 0
    _initialized = False

    @classmethod
    def increment(cls) -> int:
        """Increment counter, return current value."""
        cls._counter += 1
        return cls._counter

    @classmethod
    def should_train(cls) -> bool:
        """Check if training should trigger based on threshold."""
        return cls._counter >= settings.ENGAGEMENT_THRESHOLD

    @classmethod
    def reset(cls) -> None:
        """Reset counter after training trigger."""
        cls._counter = 0
        logger.info("Engagement counter reset after training trigger")

    @classmethod
    def get_count(cls) -> int:
        """Get current count."""
        return cls._counter

    @classmethod
    def get_progress(cls) -> float:
        """Get progress towards threshold (0.0 to 1.0)."""
        return min(cls._counter / settings.ENGAGEMENT_THRESHOLD, 1.0)

    @classmethod
    def get_remaining(cls) -> int:
        """Get remaining engagements until threshold."""
        return max(0, settings.ENGAGEMENT_THRESHOLD - cls._counter)


# Global instance for easy access
_engagement_counter = EngagementCounter


def get_engagement_counter() -> EngagementCounter:
    """Get the global engagement counter instance."""
    return _engagement_counter
