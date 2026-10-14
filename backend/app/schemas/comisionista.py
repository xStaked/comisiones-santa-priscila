from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel


class TarifaBase(BaseModel):
    tipo: str
    valor: Decimal
    proveedores_excluidos: List[str] = []
    umbral_kg: Optional[Decimal] = None
    valor_sobre_umbral: Optional[Decimal] = None
    vigente_desde: Optional[date] = None
    vigente_hasta: Optional[date] = None


class TarifaCreate(TarifaBase):
    pass


class TarifaResponse(TarifaBase):
    id: UUID

    class Config:
        from_attributes = True


class ComisionistaBase(BaseModel):
    nombre: str
    tipo: Literal["interno", "externo"] = "externo"


class ComisionistaCreate(ComisionistaBase):
    tarifas: List[TarifaCreate]


class ComisionistaUpdate(ComisionistaBase):
    tarifas: Optional[List[TarifaCreate]] = None


class ComisionistaResponse(ComisionistaBase):
    id: UUID
    tarifas: List[TarifaResponse]

    class Config:
        from_attributes = True
