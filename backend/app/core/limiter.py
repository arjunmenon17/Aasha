from slowapi import Limiter
from starlette.requests import Request


def _get_client_ip(request: Request) -> str:
    """Proxy-aware IP extraction. Reads X-Forwarded-For first (Railway/cloud),
    then falls back to the raw connection IP, then to 'unknown'."""
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


limiter = Limiter(key_func=_get_client_ip)
