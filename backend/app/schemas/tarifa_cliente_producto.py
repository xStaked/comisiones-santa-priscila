from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


class TarifaClienteProductoBase(BaseModel):
    comisionista_id: UUID = Field(alias="comisionistaId")
    cliente_id: UUID = Field(alias="clienteId")
    producto_id: UUID = Field(alias="productoId")
    finca_id: Optional[UUID] = Field(default=None, alias="fincaId")
    proveedor: str = Field(default="", alias="proveedor")
    proveedores_excluidos: List[str] = Field(default=[], alias="proveedoresExcluidos")
    tipo: str
    valor: Decimal
    umbral_kg: Optional[Decimal] = Field(default=None, alias="umbralKg")
    valor_sobre_umbral: Optional[Decimal] = Field(default=None, alias="valorSobreUmbral")
    vigente_hasta: Optional[date] = Field(default=None, alias="vigenteHasta")

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
    proveedor: str = Field(default="", alias="proveedor")
    proveedores_excluidos: List[str] = Field(default=[], alias="proveedoresExcluidos")
    tipo: str
    valor: Decimal
    activo: bool
    umbral_kg: Optional[Decimal] = Field(default=None, alias="umbralKg")
    valor_sobre_umbral: Optional[Decimal] = Field(default=None, alias="valorSobreUmbral")
    vigente_hasta: Optional[date] = Field(default=None, alias="vigenteHasta")
    comisionista: Optional[str] = None
    cliente: Optional[str] = None
    producto: Optional[str] = None
    finca: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class TarifaCambiosMasivos(BaseModel):
    tipo: Optional[str] = None
    valor: Optional[Decimal] = None
    activo: Optional[bool] = None


class TarifaUpdateMasivo(BaseModel):
    ids: List[UUID]
    cambios: TarifaCambiosMasivos
