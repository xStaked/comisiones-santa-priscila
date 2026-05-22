from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.config import settings

# Import models so Base.metadata.create_all knows about them
from app.models import user, comisionista, orden, liquidacion

from app.routers import comisionistas, liquidaciones, ordenes, reportes

app = FastAPI(
    title="Dinacuamar — Sistema de Liquidación de Comisiones",
)


@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)


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


@app.get("/health")
def health_check():
    return {"status": "ok"}
