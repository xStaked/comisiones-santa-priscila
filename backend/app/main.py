import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.config import settings

logger = logging.getLogger(__name__)

# Import models so routers know about them
from app.models import user, refresh_token, comisionista, orden, liquidacion, cliente, producto, tarifa_cliente_producto  # noqa: F401

from app.routers import admin, auth, comisionistas, liquidaciones, ordenes, reportes, upload, clientes, productos, tarifas_cliente_producto, proveedores, diagnostico

app = FastAPI(
    title="Dinacuamar — Sistema de Liquidación de Comisiones",
)


@app.on_event("startup")
async def startup_event():
    if settings.ENV == "production":
        origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
        if any("*" in o for o in origins):
            raise RuntimeError("Orígenes wildcard no están permitidos en producción")


# Security headers middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# CORS middleware
origins = {
    origin.strip()
    for origin in settings.CORS_ORIGINS.split(",")
    if origin.strip()
}
if settings.ENV == "development":
    origins.update([
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:5173",
    ])

origins = list(origins)
logger.info("CORS allow_origins: %s", origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
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
app.include_router(
    clientes.router,
    prefix="/api/v1/clientes",
    tags=["clientes"],
)
app.include_router(
    productos.router,
    prefix="/api/v1/productos",
    tags=["productos"],
)
app.include_router(
    tarifas_cliente_producto.router,
    prefix="/api/v1/tarifas-cliente-producto",
    tags=["tarifas-cliente-producto"],
)
app.include_router(
    proveedores.router,
    prefix="/api/v1/proveedores",
    tags=["proveedores"],
)
app.include_router(
    diagnostico.router,
    prefix="/api/v1",
    tags=["diagnóstico"],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}
