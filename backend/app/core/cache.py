"""Simple in-memory caching layer with TTL support."""

import time
import asyncio
from typing import Any, Optional


class InMemoryCache:
    """Async-compatible in-memory cache with TTL support."""

    def __init__(self):
        self._cache = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache if it exists and hasn't expired."""
        async with self._lock:
            if key not in self._cache:
                return None
            value, expiry = self._cache[key]
            if expiry and time.time() > expiry:
                del self._cache[key]
                return None
            return value

    async def set(self, key: str, value: Any, ttl: int = 300) -> None:
        """Set value with TTL in seconds."""
        async with self._lock:
            expiry = time.time() + ttl if ttl else None
            self._cache[key] = (value, expiry)

    async def delete(self, key: str) -> None:
        """Delete a key from cache."""
        async with self._lock:
            self._cache.pop(key, None)


# Global cache instance
cache = InMemoryCache()
