"""
Lightweight in-process rate limiter — no external dependencies.
Uses a sliding window per IP backed by collections.deque.
Raises HTTPException(429) so FastAPI handles it natively.
"""
import time
from collections import defaultdict, deque
from fastapi import HTTPException, Request


class _SlidingWindowLimiter:
    def __init__(self):
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
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= limit:
            return False
        dq.append(now)
        return True


_limiter = _SlidingWindowLimiter()


def rate_limit(limit: int, window_seconds: int = 60):
    """FastAPI dependency: raises 429 if IP exceeds `limit` requests per `window_seconds`."""
    async def _dep(request: Request):
        if not _limiter.is_allowed(request, limit, window_seconds):
            raise HTTPException(status_code=429, detail="Too many requests")
    return _dep
