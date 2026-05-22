from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


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
