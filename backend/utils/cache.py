"""
utils/cache.py
---------------
A small in-memory, async-safe TTL cache. This avoids hammering the
OpenWeather API on every frontend refresh/poll without needing an external
cache service (Redis, etc.) for this project's scope.

Not shared across multiple processes/workers — if you deploy with several
uvicorn workers behind a load balancer, swap this out for Redis and keep
the same get/set interface.
"""
import asyncio
import time
from typing import Any, Optional, Tuple


class TTLCache:
    def __init__(self) -> None:
        self._store: dict[str, Tuple[float, Any]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[Any]:
        async with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if time.monotonic() >= expires_at:
                self._store.pop(key, None)
                return None
            return value

    async def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        async with self._lock:
            self._store[key] = (time.monotonic() + ttl_seconds, value)

    async def clear(self) -> None:
        async with self._lock:
            self._store.clear()


# One shared cache instance for the whole app.
cache = TTLCache()


def make_cache_key(*parts: Any) -> str:
    return "|".join(str(p) for p in parts)
