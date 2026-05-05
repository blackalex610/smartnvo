"""
Per-IP sliding-window rate limiter for AI-heavy endpoints.

Strategy:
- In-memory dict: ip -> deque of UTC timestamps
- Sliding window: 60 requests / 60 seconds per IP
- Applied only to routes that cost money (AI, NVO, uploads)
- Trusted proxies: reads X-Forwarded-For if set
- No Redis required — resets on server restart (acceptable for MVP)
"""
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# Endpoints the rate limiter protects (prefix match)
_GUARDED_PREFIXES = (
    "/api/ai/",
    "/api/nvo/",
    "/api/mobile/",
    "/api/curriculum/exercises",
)

# Limits
WINDOW_SECONDS = 60
MAX_REQUESTS_PER_WINDOW = 60  # 1 req/s burst — plenty for legitimate users

# Global in-memory store  {ip: deque[timestamp_float]}
_buckets: Dict[str, Deque[float]] = defaultdict(deque)


def _get_client_ip(request: Request) -> str:
    """Return the real IP, respecting X-Forwarded-For from a reverse proxy."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first (leftmost) IP — the original client
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _is_guarded(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in _GUARDED_PREFIXES)


class IPRateLimiterMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if not _is_guarded(request.url.path):
            return await call_next(request)

        ip = _get_client_ip(request)
        now = time.monotonic()
        window_start = now - WINDOW_SECONDS

        bucket = _buckets[ip]

        # Evict timestamps outside the current window
        while bucket and bucket[0] < window_start:
            bucket.popleft()

        if len(bucket) >= MAX_REQUESTS_PER_WINDOW:
            oldest = bucket[0]
            retry_after = int(WINDOW_SECONDS - (now - oldest)) + 1
            return JSONResponse(
                status_code=429,
                content={
                    "detail": {
                        "code": "RATE_LIMITED",
                        "message": "Прекалено много заявки. Моля, изчакайте малко.",
                        "retry_after": retry_after,
                    }
                },
                headers={"Retry-After": str(retry_after)},
            )

        bucket.append(now)
        return await call_next(request)
