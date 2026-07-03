from __future__ import annotations

from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

from app.schemas.grupo import GrupoResponse


class FincaBase(BaseModel):
    nombre: str
    cliente_id: UUID = Field(alias="clienteId")

    model_config = ConfigDict(populate_by_name=True)


class FincaCreate(FincaBase):
    pass


class FincaUpdate(FincaBase):
    cliente_id: UUID | None = Field(default=None, alias="clienteId")


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
    grupo_id: Optional[UUID] = Field(default=None, alias="grupoId")

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
    grupo_id: Optional[UUID] = Field(default=None, alias="grupoId")
    grupo: Optional[GrupoResponse] = None
    fincas: List[FincaResponse] = []

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
