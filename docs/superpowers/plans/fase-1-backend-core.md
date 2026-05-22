# Plan de Implementación — Fase 1: Backend Core + PostgreSQL + Docker

> Derivado del design spec: `2026-05-22-fastapi-backend-migration-design.md`
> Fecha: 2026-05-22
> Estado: Listo para ejecución

---

## Objetivo de la Fase

Tener un backend FastAPI funcional con CRUD completo de comisionistas, órdenes de compra y liquidaciones, conectado a PostgreSQL, levantable via Docker Compose, con datos de demo precargados y API testeable.

**Out of scope:** Autenticación JWT (Fase 2), integración frontend (Fase 3), PDF extraction backend (Fase 4), OCR (Fase 5).

---

## Tareas

### Tarea 1: Preparar estructura de monorepo

**Archivos a modificar/crear:**
- Mover todo el contenido actual de `src/`, `package.json`, `next.config.ts`, etc. a `frontend/`
- Actualizar `package.json` del frontend si es necesario (rutas no deberían cambiar si movemos todo)
- Crear `backend/` vacío
- Crear `docker-compose.yml` en raíz

**Nota:** Al mover el frontend, verificar que `tsconfig.json` siga funcionando. El alias `@/` debería seguir apuntando a `./frontend/src/*` o mantenerse como está si no movemos archivos de config.

**Decisión:** Dado que mover todo el frontend puede romper `.next/`, `node_modules/` y configuraciones, en su lugar vamos a:
- Dejar el frontend donde está
- Crear `backend/` como nueva carpeta en raíz
- Esto simplifica la migración inmediata y podemos reorganizar más adelante si es necesario

**Archivos a crear:**
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── dependencies.py
│   ├── security.py
│   ├── models/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   ├── user.py
│   │   ├── comisionista.py
│   │   ├── orden.py
│   │   └── liquidacion.py
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── comisionista.py
│   │   ├── orden.py
│   │   ├── liquidacion.py
│   │   └── common.py
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── comisionistas.py
│   │   ├── ordenes.py
│   │   ├── liquidaciones.py
│   │   └── reportes.py
│   └── services/
│       ├── __init__.py
│       └── liquidacion.py
├── alembic/
│   ├── versions/
│   └── alembic.ini (en realidad en raíz de backend)
├── Dockerfile
├── requirements.txt
├── alembic.ini
└── .env.example
```

---

### Tarea 2: Configuración base y dependencias

**Archivo: `backend/requirements.txt`**
```
fastapi==0.115.0
uvicorn[standard]==0.32.0
sqlalchemy==2.0.36
alembic==1.14.0
psycopg2-binary==2.9.10
pydantic==2.9.0
pydantic-settings==2.6.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.17
```

**Archivo: `backend/.env.example`**
```
DATABASE_URL=postgresql://dinacuamar:dinacuamar@localhost:5432/dinacuamar
JWT_SECRET_KEY=cambiar-en-produccion
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

**Archivo: `backend/app/config.py`**
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://dinacuamar:dinacuamar@localhost:5432/dinacuamar"
    JWT_SECRET_KEY: str = "dev-secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    CORS_ORIGINS: str = "http://localhost:3000"

    class Config:
        env_file = ".env"

settings = Settings()
```

---

### Tarea 3: Database layer

**Archivo: `backend/app/database.py`**
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

---

### Tarea 4: Models SQLAlchemy

**Archivo: `backend/app/models/base.py`**
```python
import uuid
from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database import Base

class BaseModel(Base):
    __abstract__ = True
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

**Archivo: `backend/app/models/user.py`**
```python
from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.models.base import BaseModel

class User(BaseModel):
    __tablename__ = "users"
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
```

**Archivo: `backend/app/models/comisionista.py`**
```python
from sqlalchemy import Column, String, ForeignKey, Numeric, Enum
from sqlalchemy.orm import relationship
import enum
from app.models.base import BaseModel

class TipoTarifa(str, enum.Enum):
    PORCENTAJE = "porcentaje"
    FIJO_KG = "fijo_kg"

class Comisionista(BaseModel):
    __tablename__ = "comisionistas"
    nombre = Column(String, nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    tarifas = relationship("Tarifa", back_populates="comisionista", cascade="all, delete-orphan")

class Tarifa(BaseModel):
    __tablename__ = "tarifas"
    comisionista_id = Column(UUID(as_uuid=True), ForeignKey("comisionistas.id"), nullable=False)
    tipo = Column(Enum(TipoTarifa), nullable=False)
    valor = Column(Numeric(10, 4), nullable=False)
    comisionista = relationship("Comisionista", back_populates="tarifas")
```

**Archivo: `backend/app/models/orden.py`**
```python
from sqlalchemy import Column, String, Numeric, Date, ForeignKey, Enum
from sqlalchemy.orm import relationship
import enum
from app.models.base import BaseModel

class EstadoOrden(str, enum.Enum):
    ACTIVO = "activo"
    LIQUIDADO = "liquidado"
    ANULADO = "anulado"

class OrdenItem(BaseModel):
    __tablename__ = "orden_items"
    fecha = Column(Date, nullable=False)
    numero_orden = Column(String, nullable=False)
    finca = Column(String, nullable=False)
    producto = Column(String, nullable=False)
    cantidad = Column(Numeric(12, 2), nullable=False)
    unidad = Column(String, nullable=False)
    precio_unitario = Column(Numeric(12, 2), nullable=False)
    total = Column(Numeric(12, 2), nullable=False)
    sector = Column(String)
    estado = Column(Enum(EstadoOrden), default=EstadoOrden.ACTIVO)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    comisionistas = relationship("Asignacion", back_populates="orden_item", cascade="all, delete-orphan")

class Asignacion(BaseModel):
    __tablename__ = "asignaciones"
    orden_item_id = Column(UUID(as_uuid=True), ForeignKey("orden_items.id"), nullable=False)
    comisionista_id = Column(UUID(as_uuid=True), ForeignKey("comisionistas.id"), nullable=False)
    orden_item = relationship("OrdenItem", back_populates="comisionistas")
    comisionista = relationship("Comisionista")
    
    # Unique constraint se define en tabla o aquí
```

**Archivo: `backend/app/models/liquidacion.py`**
```python
from sqlalchemy import Column, String, Date, DateTime, ForeignKey, Numeric, Enum
from sqlalchemy.orm import relationship
import enum
from app.models.base import BaseModel

class Liquidacion(BaseModel):
    __tablename__ = "liquidaciones"
    nombre = Column(String, nullable=False)
    mes = Column(String, nullable=False)  # YYYY-MM
    fecha_creacion = Column(DateTime(timezone=True), nullable=False)
    items = relationship("LiquidacionItem", back_populates="liquidacion", cascade="all, delete-orphan")

class LiquidacionItem(BaseModel):
    __tablename__ = "liquidacion_items"
    liquidacion_id = Column(UUID(as_uuid=True), ForeignKey("liquidaciones.id"), nullable=False)
    orden_item_id = Column(UUID(as_uuid=True), ForeignKey("orden_items.id"), nullable=True)
    fecha_snapshot = Column(Date, nullable=False)
    numero_orden_snapshot = Column(String, nullable=False)
    finca_snapshot = Column(String, nullable=False)
    producto_snapshot = Column(String, nullable=False)
    cantidad_snapshot = Column(Numeric(12, 2), nullable=False)
    unidad_snapshot = Column(String, nullable=False)
    precio_unitario_snapshot = Column(Numeric(12, 2), nullable=False)
    total_snapshot = Column(Numeric(12, 2), nullable=False)
    sector_snapshot = Column(String)
    estado_snapshot = Column(String)
    liquidacion = relationship("Liquidacion", back_populates="items")
    tarifas = relationship("LiquidacionItemTarifa", back_populates="liquidacion_item", cascade="all, delete-orphan")

class LiquidacionItemTarifa(BaseModel):
    __tablename__ = "liquidacion_item_tarifas"
    liquidacion_item_id = Column(UUID(as_uuid=True), ForeignKey("liquidacion_items.id"), nullable=False)
    comisionista_id = Column(UUID(as_uuid=True), ForeignKey("comisionistas.id"), nullable=False)
    comisionista_nombre_snapshot = Column(String, nullable=False)
    tipo_snapshot = Column(String, nullable=False)
    valor_snapshot = Column(Numeric(10, 4), nullable=False)
    comision_calculada = Column(Numeric(12, 2), nullable=False)
    liquidacion_item = relationship("LiquidacionItem", back_populates="tarifas")
```

**Nota:** Agregar `__table_args__` con UniqueConstraint donde corresponda (ej: `asignaciones` para orden_item_id + comisionista_id).

---

### Tarea 5: Pydantic Schemas

**Archivo: `backend/app/schemas/common.py`**
```python
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

class ResponseBase(BaseModel):
    message: str = "OK"

class ItemResponse(ResponseBase):
    data: dict
```

**Archivo: `backend/app/schemas/comisionista.py`**
```python
from pydantic import BaseModel
from uuid import UUID
from typing import List
from decimal import Decimal

class TarifaBase(BaseModel):
    tipo: str  # "porcentaje" | "fijo_kg"
    valor: Decimal

class TarifaCreate(TarifaBase):
    pass

class TarifaResponse(TarifaBase):
    id: UUID
    class Config:
        from_attributes = True

class ComisionistaBase(BaseModel):
    nombre: str

class ComisionistaCreate(ComisionistaBase):
    tarifas: List[TarifaCreate]

class ComisionistaUpdate(ComisionistaBase):
    tarifas: List[TarifaCreate]

class ComisionistaResponse(ComisionistaBase):
    id: UUID
    tarifas: List[TarifaResponse]
    class Config:
        from_attributes = True
```

**Archivo: `backend/app/schemas/orden.py`**
```python
from pydantic import BaseModel
from uuid import UUID
from typing import List, Optional
from decimal import Decimal
from datetime import date

class AsignacionBase(BaseModel):
    comisionista_id: UUID

class AsignacionResponse(AsignacionBase):
    id: UUID
    class Config:
        from_attributes = True

class OrdenItemBase(BaseModel):
    fecha: date
    numero_orden: str
    finca: str
    producto: str
    cantidad: Decimal
    unidad: str
    precio_unitario: Decimal
    total: Decimal
    sector: Optional[str] = None
    estado: Optional[str] = "activo"

class OrdenItemCreate(OrdenItemBase):
    comisionista_ids: List[UUID] = []

class OrdenItemUpdate(BaseModel):
    fecha: Optional[date] = None
    numero_orden: Optional[str] = None
    finca: Optional[str] = None
    producto: Optional[str] = None
    cantidad: Optional[Decimal] = None
    unidad: Optional[str] = None
    precio_unitario: Optional[Decimal] = None
    total: Optional[Decimal] = None
    sector: Optional[str] = None
    estado: Optional[str] = None

class OrdenItemResponse(OrdenItemBase):
    id: UUID
    comisionistas: List[AsignacionResponse]
    class Config:
        from_attributes = True
```

**Archivo: `backend/app/schemas/liquidacion.py`**
```python
from pydantic import BaseModel
from uuid import UUID
from typing import List, Optional
from decimal import Decimal
from datetime import datetime, date

class LiquidacionItemTarifaResponse(BaseModel):
    id: UUID
    comisionista_id: UUID
    comisionista_nombre_snapshot: str
    tipo_snapshot: str
    valor_snapshot: Decimal
    comision_calculada: Decimal
    class Config:
        from_attributes = True

class LiquidacionItemResponse(BaseModel):
    id: UUID
    orden_item_id: Optional[UUID]
    fecha_snapshot: date
    numero_orden_snapshot: str
    finca_snapshot: str
    producto_snapshot: str
    cantidad_snapshot: Decimal
    unidad_snapshot: str
    precio_unitario_snapshot: Decimal
    total_snapshot: Decimal
    sector_snapshot: Optional[str]
    estado_snapshot: str
    tarifas: List[LiquidacionItemTarifaResponse]
    class Config:
        from_attributes = True

class LiquidacionBase(BaseModel):
    nombre: str
    mes: str

class LiquidacionCreate(BaseModel):
    nombre: str
    orden_item_ids: List[UUID]

class LiquidacionResponse(LiquidacionBase):
    id: UUID
    fecha_creacion: datetime
    items: List[LiquidacionItemResponse]
    class Config:
        from_attributes = True
```

---

### Tarea 6: Routers CRUD

**Archivo: `backend/app/routers/comisionistas.py`**
Endpoints:
- `GET /api/v1/comisionistas` → listar todos con tarifas
- `POST /api/v1/comisionistas` → crear comisionista + tarifas
- `PUT /api/v1/comisionistas/{id}` → actualizar nombre + reemplazar tarifas
- `DELETE /api/v1/comisionistas/{id}` → eliminar (verificar que no esté en asignaciones activas)

**Archivo: `backend/app/routers/ordenes.py`**
Endpoints:
- `GET /api/v1/ordenes` → listar activas, filtros opcionales
- `POST /api/v1/ordenes` → batch insert (acepta array)
- `PUT /api/v1/ordenes/{id}` → actualizar campos
- `DELETE /api/v1/ordenes/{id}` → soft delete (estado = anulado)
- `POST /api/v1/ordenes/{id}/comisionistas` → asignar
- `DELETE /api/v1/ordenes/{id}/comisionistas/{comisionista_id}` → desasignar
- `POST /api/v1/ordenes/asignar-global` → asignar a múltiples órdenes

**Archivo: `backend/app/routers/liquidaciones.py`**
Endpoints:
- `GET /api/v1/liquidaciones` → listar
- `POST /api/v1/liquidaciones` → crear con snapshots
- `GET /api/v1/liquidaciones/{id}` → detalle con items
- `DELETE /api/v1/liquidaciones/{id}` → eliminar + restaurar órdenes a activo
- `POST /api/v1/liquidaciones/{id}/restaurar` → crear nuevos items activos desde snapshot

**Archivo: `backend/app/routers/reportes.py`**
Endpoints:
- `GET /api/v1/reportes/resumen` → totales por período
- `GET /api/v1/reportes/por-finca` → agrupación
- `GET /api/v1/reportes/por-producto` → agrupación
- `GET /api/v1/reportes/por-comisionista` → agrupación

**Archivo: `backend/app/services/liquidacion.py`**
Función `crear_liquidacion(db, nombre, orden_item_ids)`:
1. Validar que todos los IDs existan y estén en estado `activo`
2. Calcular comisiones por cada item y comisionista asignado
3. Crear `Liquidacion`
4. Crear `LiquidacionItem` por cada orden (snapshot)
5. Crear `LiquidacionItemTarifa` por cada comisionista asignado
6. Cambiar estado de orden_items a `liquidado`
7. Commit

---

### Tarea 7: Main app

**Archivo: `backend/app/main.py`**
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base
from app.routers import comisionistas, ordenes, liquidaciones, reportes

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Dinacuamar API", version="1.0.0")

origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(comisionistas.router, prefix="/api/v1/comisionistas", tags=["comisionistas"])
app.include_router(ordenes.router, prefix="/api/v1/ordenes", tags=["ordenes"])
app.include_router(liquidaciones.router, prefix="/api/v1/liquidaciones", tags=["liquidaciones"])
app.include_router(reportes.router, prefix="/api/v1/reportes", tags=["reportes"])

@app.get("/health")
def health_check():
    return {"status": "ok"}
```

---

### Tarea 8: Docker

**Archivo: `backend/Dockerfile`**
```dockerfile
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Archivo: `docker-compose.yml` (raíz)**
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: dinacuamar
      POSTGRES_USER: dinacuamar
      POSTGRES_PASSWORD: dinacuamar
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://dinacuamar:dinacuamar@postgres:5432/dinacuamar
      JWT_SECRET_KEY: dev-secret-cambiar-en-produccion
      JWT_ALGORITHM: HS256
      ACCESS_TOKEN_EXPIRE_MINUTES: 15
      REFRESH_TOKEN_EXPIRE_DAYS: 7
      CORS_ORIGINS: http://localhost:3000
    volumes:
      - ./backend:/app
    depends_on:
      - postgres
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

volumes:
  postgres_data:
```

---

### Tarea 9: Alembic

```bash
cd backend
alembic init alembic
# Configurar alembic.ini con sqlalchemy.url
# Configurar alembic/env.py para importar Base y models
# Crear primera migración: alembic revision --autogenerate -m "init"
```

---

### Tarea 10: Seed de demo data

**Archivo: `backend/app/commands/seed_demo.py`** (ejecutable como script)
Crear comisionistas con tarifas (mismos datos que `frontend/src/lib/demo-data.ts`) y órdenes de demo.

**Archivo: `backend/app/commands/create_superuser.py`**
Crear usuario admin inicial.

---

### Tarea 11: Verificación

**Checklist de aceptación:**
- [ ] `docker-compose up -d` levanta postgres + backend sin errores
- [ ] `GET http://localhost:8000/health` responde `{"status": "ok"}`
- [ ] `GET /api/v1/comisionistas` devuelve `[]` inicialmente
- [ ] `POST /api/v1/comisionistas` crea comisionista con tarifas
- [ ] `POST /api/v1/ordenes` crea ordenes en batch con asignaciones
- [ ] `GET /api/v1/ordenes` lista solo activas
- [ ] `POST /api/v1/liquidaciones` crea liquidación con snapshots
- [ ] `GET /api/v1/liquidaciones/{id}` devuelve items snapshot + tarifas
- [ ] `DELETE /api/v1/liquidaciones/{id}` restaura órdenes a activo
- [ ] Seed script popula datos de demo correctamente
- [ ] Reportes endpoints devuelven datos agregados

---

## Criterios de éxito de la fase

1. Backend levanta en Docker y responde a requests HTTP
2. CRUD completo funciona para comisionistas, órdenes y liquidaciones
3. Liquidaciones guardan snapshot inmutable correctamente
4. Base de datos PostgreSQL persiste datos entre reinicios de contenedor
5. Seed de demo data permite probar sin crear datos manualmente
6. Sin errores en logs de backend

---

## Notas para el implementador

- **No implementar auth en esta fase.** Los endpoints son públicos temporalmente. La auth se agrega en Fase 2 sin tocar la lógica de negocio.
- **No implementar PDF upload en esta fase.** Se agrega en Fase 4.
- **Usar `Numeric` de SQLAlchemy para dinero/cantidades**, nunca `Float`, para evitar errores de precisión decimal.
- **El endpoint `POST /api/v1/ordenes` debe aceptar un array** para facilitar el batch insert desde PDF (fase futura).
- **Las funciones de servicio deben ser puras y testeables**, sin depender de FastAPI request/response.
