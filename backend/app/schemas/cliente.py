from __future__ import annotations

from decimal import Decimal
from typing import List
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


class FincaBase(BaseModel):
    nombre: str
    cliente_id: UUID = Field(alias="clienteId")

    model_config = ConfigDict(populate_by_name=True)


class FincaCreate(FincaBase):
    pass


class FincaUpdate(FincaBase):
    pass


class FincaResponse(BaseModel):
    id: UUID
    nombre: str
    cliente_id: UUID = Field(alias="clienteId")
    activo: bool

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class ClienteBase(BaseModel):
    nombre: str
    tipo: str = "individual"
    retencion_porcentaje: Decimal = Field(
        default=Decimal("1.75"), alias="retencionPorcentaje"
    )

    model_config = ConfigDict(populate_by_name=True)


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(ClienteBase):
    pass


class ClienteResponse(BaseModel):
    id: UUID
    nombre: str
    tipo: str
    retencion_porcentaje: Decimal = Field(alias="retencionPorcentaje")
    activo: bool
    fincas: List[FincaResponse] = []

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
