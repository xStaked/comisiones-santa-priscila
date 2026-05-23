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
        self.requests[key] = [t for t in self.requests[key] if now - t < window]
        if len(self.requests[key]) >= self.requests_per_minute:
            return False
        self.requests[key].append(now)
        return True


limiter = InMemoryRateLimiter(settings.RATE_LIMIT_PER_MINUTE)


def rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    if not limiter.is_allowed(client_ip):
        raise HTTPException(status_code=429, detail="Demasiadas solicitudes")
