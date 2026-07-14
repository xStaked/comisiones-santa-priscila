from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

from app.schemas.cliente import ClienteResponse, FincaResponse
from app.schemas.producto import ProductoResponse


class AsignacionBase(BaseModel):
    comisionista_id: UUID


class AsignacionResponse(AsignacionBase):
    id: UUID
    liquidacion_id: Optional[UUID] = None

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
    estado: Optional[str] = "pendiente"


class OrdenItemCreate(OrdenItemBase):
    comisionista_ids: List[UUID] = []
    cliente_id: Optional[UUID] = None
    producto_id: Optional[UUID] = None
    finca_id: Optional[UUID] = None
    proveedor: Optional[str] = None


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
    cliente_id: Optional[UUID] = None
    producto_id: Optional[UUID] = None
    finca_id: Optional[UUID] = None
    comisionista_ids: Optional[List[UUID]] = None


class OrdenItemResponse(OrdenItemBase):
    id: UUID
    orden_id: Optional[UUID] = None
    comisionistas: List[AsignacionResponse]
    cliente_id: Optional[UUID] = None
    producto_id: Optional[UUID] = None
    finca_id: Optional[UUID] = None
    proveedor: Optional[str] = None
    fecha_pago: Optional[date] = None
    cliente: Optional[ClienteResponse] = None
    producto_obj: Optional[ProductoResponse] = Field(default=None, alias="productoRel")
    finca_obj: Optional[FincaResponse] = Field(default=None, alias="fincaRel")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class OrdenLineaCreate(BaseModel):
    finca: str
    producto: str
    cantidad: Decimal
    unidad: str
    precio_unitario: Decimal
    total: Decimal
    sector: Optional[str] = None
    estado: Optional[str] = "pendiente"
    comisionista_ids: List[UUID] = []
    cliente_id: Optional[UUID] = None
    producto_id: Optional[UUID] = None
    finca_id: Optional[UUID] = None


class OrdenCreate(BaseModel):
    fecha: date
    numero_orden: str
    cliente_id: Optional[UUID] = None
    proveedor: Optional[str] = None
    semana: Optional[str] = None
    archivo_nombre: Optional[str] = None
    origen: str = "manual"
    items: List[OrdenLineaCreate]


class OrdenResponse(BaseModel):
    id: UUID
    fecha: date
    numero_orden: str
    cliente_id: Optional[UUID] = None
    proveedor: Optional[str] = None
    semana: Optional[str] = None
    archivo_nombre: Optional[str] = None
    origen: str
    estado: str
    fecha_pago: Optional[date] = None
    total: Decimal
    cantidad_productos: int
    items: List[OrdenItemResponse]

    model_config = ConfigDict(from_attributes=True)
