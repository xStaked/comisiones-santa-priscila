from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.database import Base, engine
from app.config import settings

# Import models so Base.metadata.create_all knows about them
from app.models import user, refresh_token, comisionista, orden, liquidacion, cliente, producto, tarifa_cliente_producto

from app.routers import admin, auth, comisionistas, liquidaciones, ordenes, reportes, upload, clientes, productos, tarifas_cliente_producto

app = FastAPI(
    title="Dinacuamar — Sistema de Liquidación de Comisiones",
)


@app.on_event("startup")
async def startup_event():
    if settings.ENV == "production":
        origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
        if any("*" in o for o in origins):
            raise RuntimeError("Orígenes wildcard no están permitidos en producción")
    Base.metadata.create_all(bind=engine)


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
origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


@app.get("/health")
def health_check():
    return {"status": "ok"}
