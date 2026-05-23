from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.database import Base, engine
from app.config import settings

# Import models so Base.metadata.create_all knows about them
from app.models import user, refresh_token, comisionista, orden, liquidacion

from app.routers import admin, auth, comisionistas, liquidaciones, ordenes, reportes, upload

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(
    title="Dinacuamar — Sistema de Liquidación de Comisiones",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)


# Security headers middleware
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response


# CORS middleware
origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",")]
if settings.ENV == "production":
    for origin in origins:
        if origin == "*":
            raise ValueError("CORS_ORIGINS no puede contener '*' en producción")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Routers
app.include_router(
    comisionistas.router,
    prefix="/api/v1/comisionistas",
    tags=["comisionistas"],
)
app.include_router(
    ordenes.router,
    prefix="/api/v1/ordenes",
    tags=["ordenes"],
)
app.include_router(
    liquidaciones.router,
    prefix="/api/v1/liquidaciones",
    tags=["liquidaciones"],
)
app.include_router(
    reportes.router,
    prefix="/api/v1/reportes",
    tags=["reportes"],
)
app.include_router(
    auth.router,
    prefix="/api/v1/auth",
    tags=["auth"],
)
app.include_router(
    admin.router,
    prefix="/api/v1/admin",
    tags=["admin"],
)
app.include_router(
    upload.router,
    prefix="/api/v1/upload",
    tags=["upload"],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}
