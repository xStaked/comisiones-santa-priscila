import time
from collections import defaultdict

from fastapi import HTTPException, Request

from app.config import settings


class InMemoryRateLimiter:
    def __init__(self, requests_per_minute: int):
        self.requests_per_minute = requests_per_minute
        self.requests: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        window = 60
        for stored_key in list(self.requests):
            self.requests[stored_key] = [
                timestamp for timestamp in self.requests[stored_key]
                if now - timestamp < window
            ]
            if not self.requests[stored_key]:
                del self.requests[stored_key]
        if len(self.requests[key]) >= self.requests_per_minute:
            return False
        self.requests[key].append(now)
        return True


limiter = InMemoryRateLimiter(settings.RATE_LIMIT_PER_MINUTE)


def rate_limit(request: Request) -> None:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    client_ip = forwarded_for.split(",", 1)[0].strip()
    if not client_ip:
        client_ip = request.client.host if request.client else "unknown"
    key = f"{client_ip}:{request.url.path}"
    if not limiter.is_allowed(key):
        raise HTTPException(status_code=429, detail="Demasiadas solicitudes")
