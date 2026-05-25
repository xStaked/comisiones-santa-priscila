from __future__ import annotations

from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


class ProductoBase(BaseModel):
    nombre: str
    unidad_comision: str = Field(default="kg", alias="unidadComision")
    tacho_kilos: Optional[Decimal] = Field(default=None, alias="tachoKilos")

    model_config = ConfigDict(populate_by_name=True)


class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(ProductoBase):
    pass


class ProductoResponse(BaseModel):
    id: UUID
    nombre: str
    unidad_comision: str = Field(alias="unidadComision")
    tacho_kilos: Optional[Decimal] = Field(alias="tachoKilos")
    activo: bool

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
