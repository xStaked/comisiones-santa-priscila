from __future__ import annotations

from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


class TarifaClienteProductoBase(BaseModel):
    comisionista_id: UUID = Field(alias="comisionistaId")
    cliente_id: UUID = Field(alias="clienteId")
    producto_id: UUID = Field(alias="productoId")
    finca_id: Optional[UUID] = Field(default=None, alias="fincaId")
    tipo: str
    valor: Decimal

    model_config = ConfigDict(populate_by_name=True)


class TarifaClienteProductoCreate(TarifaClienteProductoBase):
    pass


class TarifaClienteProductoUpdate(TarifaClienteProductoBase):
    pass


class TarifaClienteProductoResponse(BaseModel):
    id: UUID
    comisionista_id: UUID = Field(alias="comisionistaId")
    cliente_id: UUID = Field(alias="clienteId")
    producto_id: UUID = Field(alias="productoId")
    finca_id: Optional[UUID] = Field(default=None, alias="fincaId")
    tipo: str
    valor: Decimal
    activo: bool
    comisionista: Optional[str] = None
    cliente: Optional[str] = None
    producto: Optional[str] = None
    finca: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
