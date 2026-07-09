from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


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
    orden_item_id: Optional[UUID] = None
    orden_id: Optional[UUID] = None
    fecha_snapshot: date
    numero_orden_snapshot: str
    finca_snapshot: str
    producto_snapshot: str
    cantidad_snapshot: Decimal
    unidad_snapshot: str
    precio_unitario_snapshot: Decimal
    total_snapshot: Decimal
    sector_snapshot: Optional[str] = None
    estado_snapshot: str
    cliente_snapshot: Optional[str] = None
    retencion_porcentaje_snapshot: Optional[Decimal] = None
    tarifas: List[LiquidacionItemTarifaResponse]

    class Config:
        from_attributes = True


class LiquidacionBase(BaseModel):
    nombre: str
    mes: str


class LiquidacionCreate(BaseModel):
    nombre: str
    orden_item_ids: List[UUID]
    # Vacío o ausente = liquidar todas las asignaciones pendientes de esos ítems.
    comisionista_ids: Optional[List[UUID]] = None


class LiquidacionResponse(LiquidacionBase):
    id: UUID
    fecha_creacion: datetime
    items: List[LiquidacionItemResponse]

    class Config:
        from_attributes = True
