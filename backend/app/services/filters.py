from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, timezone
from uuid import UUID
import json
from app.core.config import get_settings
from app.core.logging import logger
from app.schemas.schemas import PostCandidate

settings = get_settings()


class FilterResult:
    def __init__(self, candidates: List[PostCandidate], removed_count: int = 0):
        self.candidates = candidates
        self.removed_count = removed_count


class DropDuplicatesFilter:
    """Remove duplicate post IDs."""

    def filter(self, candidates: List[PostCandidate]) -> FilterResult:
        seen_ids = set()
        unique = []
        removed = 0

        for candidate in candidates:
            if candidate.id in seen_ids:
                removed += 1
            else:
                seen_ids.add(candidate.id)
                unique.append(candidate)

        return FilterResult(unique, removed)


class CoreDataHydrationFilter:
    """Remove posts missing core metadata."""

    def filter(self, candidates: List[PostCandidate]) -> FilterResult:
        valid = []
        removed = 0

        for candidate in candidates:
            if candidate.text and candidate.author_id and candidate.created_at:
                valid.append(candidate)
            else:
                removed += 1

        return FilterResult(valid, removed)


class AgeFilter:
    """Remove posts older than threshold."""

    def __init__(self, max_age_days: int = None):
        self.max_age_days = max_age_days or settings.MAX_POST_AGE_DAYS

    def filter(self, candidates: List[PostCandidate]) -> FilterResult:
        cutoff = datetime.now(timezone.utc) - timedelta(days=self.max_age_days)
        valid = []
        removed = 0

        for candidate in candidates:
            # Make comparison timezone-aware
            created = candidate.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if created > cutoff:
                valid.append(candidate)
            else:
                removed += 1

        return FilterResult(valid, removed)


class SelfTweetFilter:
    """Remove user's own posts."""

    def __init__(self, user_id: UUID):
        self.user_id = user_id

    def filter(self, candidates: List[PostCandidate]) -> FilterResult:
        valid = []
        removed = 0

        for candidate in candidates:
            if candidate.author_id != self.user_id:
                valid.append(candidate)
            else:
                removed += 1

        return FilterResult(valid, removed)


class AuthorSocialgraphFilter:
    """Remove posts from blocked/muted authors."""

    def __init__(
        self, blocked_author_ids: List[UUID] = None, muted_author_ids: List[UUID] = None
    ):
        self.blocked = set(blocked_author_ids or [])
        self.muted = set(muted_author_ids or [])

    def filter(self, candidates: List[PostCandidate]) -> FilterResult:
        valid = []
        removed = 0

        for candidate in candidates:
            if (
                candidate.author_id not in self.blocked
                and candidate.author_id not in self.muted
            ):
                valid.append(candidate)
            else:
                removed += 1

        return FilterResult(valid, removed)


class FilterPipeline:
    """Pipeline for running all filters in order."""

    def __init__(
        self,
        user_id: UUID,
        blocked_authors: List[UUID] = None,
        muted_authors: List[UUID] = None,
    ):
        self.filters = [
            DropDuplicatesFilter(),
            CoreDataHydrationFilter(),
            AgeFilter(),
            SelfTweetFilter(user_id),
            AuthorSocialgraphFilter(blocked_authors, muted_authors),
        ]
        self.filter_names = [
            "DropDuplicates",
            "CoreDataHydration",
            "Age",
            "SelfTweet",
            "AuthorSocialgraph",
        ]

    def apply(
        self, candidates: List[PostCandidate]
    ) -> tuple[List[PostCandidate], Dict[str, int]]:
        """Apply all filters and return filtered candidates + stats."""
        current = candidates
        stats = {}

        for filter_obj, name in zip(self.filters, self.filter_names):
            result = filter_obj.filter(current)
            removed = len(current) - len(result.candidates)
            stats[name] = removed
            current = result.candidates
            logger.debug(f"Filter {name}: {removed} removed, {len(current)} remaining")

        return current, stats
