"""
Lightweight in-process rate limiter — no external dependencies.
Uses a sliding window (token bucket per IP) backed by a plain dict.
Thread-safe enough for single-worker uvicorn deployments.
"""
import time
from collections import defaultdict, deque
from fastapi import Request
from fastapi.responses import JSONResponse


class _SlidingWindowLimiter:
    def __init__(self):
        # {ip: deque of timestamps}
        self._windows: dict[str, deque] = defaultdict(deque)

    def _get_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client:
            return request.client.host
        return "unknown"

    def is_allowed(self, request: Request, limit: int, window_seconds: int) -> bool:
        ip = self._get_ip(request)
        now = time.monotonic()
        cutoff = now - window_seconds
        dq = self._windows[ip]
        # Drop old entries
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= limit:
            return False
        dq.append(now)
        return True


_limiter = _SlidingWindowLimiter()


def rate_limit(limit: int, window_seconds: int = 60):
    """FastAPI dependency that enforces a sliding-window rate limit per IP."""
    async def _dep(request: Request):
        if not _limiter.is_allowed(request, limit, window_seconds):
            raise _RateLimitExceeded()
    return _dep


class _RateLimitExceeded(Exception):
    pass


async def rate_limit_exception_handler(request: Request, exc: _RateLimitExceeded):
    return JSONResponse(status_code=429, content={"detail": "Too many requests"})
