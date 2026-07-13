"""
utils/http_client.py
---------------------
A single shared httpx.AsyncClient (connection pooling) plus a small
retry-with-backoff wrapper used by every outbound call to the weather,
geocoding, and air-quality providers.
"""
import asyncio
from typing import Any, Dict, Optional

import httpx

from backend.config import get_settings
from backend.utils.logger import get_logger

logger = get_logger(__name__)

_client: Optional[httpx.AsyncClient] = None


async def get_http_client() -> httpx.AsyncClient:
    """Lazily creates (once) and returns the shared AsyncClient."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT_SECONDS)
    return _client


async def close_http_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


class UpstreamError(Exception):
    """Raised when an upstream provider fails after all retries."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


async def get_json(
    url: str,
    params: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    GET a URL and return parsed JSON, retrying transient failures
    (timeouts, 5xx, connection errors) with exponential backoff.

    Raises UpstreamError if every attempt fails, or if the upstream
    responds with a 4xx (which we don't retry, since retrying a bad
    request/auth error won't help).
    """
    settings = get_settings()
    client = await get_http_client()

    last_exc: Optional[Exception] = None

    for attempt in range(settings.MAX_RETRIES + 1):
        try:
            response = await client.get(url, params=params, headers=headers)

            if response.status_code == 401:
                raise UpstreamError(
                    "Weather provider rejected the request (401 Unauthorized).",
                    status_code=502,
                )
            if response.status_code == 404:
                raise UpstreamError("Location not found.", status_code=404)
            if response.status_code == 429:
                raise UpstreamError(
                    "Weather provider rate limit exceeded. Try again shortly.",
                    status_code=429,
                )
            if 400 <= response.status_code < 500:
                raise UpstreamError(
                    f"Weather provider rejected the request ({response.status_code}).",
                    status_code=400,
                )
            if response.status_code >= 500:
                # Retryable — treat like a transient failure.
                raise httpx.HTTPStatusError(
                    "Upstream server error", request=response.request, response=response
                )

            response.raise_for_status()
            return response.json()

        except UpstreamError:
            # Non-retryable, deliberate failure — bubble up immediately.
            raise

        except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPStatusError) as exc:
            last_exc = exc
            if attempt < settings.MAX_RETRIES:
                backoff = settings.RETRY_BACKOFF_SECONDS * (2 ** attempt)
                logger.warning(
                    "Request to %s failed (attempt %s/%s): %s — retrying in %.1fs",
                    url, attempt + 1, settings.MAX_RETRIES + 1, exc, backoff,
                )
                await asyncio.sleep(backoff)
            else:
                logger.error("Request to %s failed after %s attempts: %s", url, attempt + 1, exc)

    raise UpstreamError(
        f"Weather provider is unreachable right now: {last_exc}", status_code=503
    )
