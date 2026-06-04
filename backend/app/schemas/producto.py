from __future__ import annotations

from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict, field_validator


class ProductoAliasBase(BaseModel):
    alias: str


class ProductoAliasCreate(ProductoAliasBase):
    pass


class ProductoAliasResponse(ProductoAliasBase):
    id: UUID
    producto_id: UUID = Field(alias="productoId")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class ProductoBase(BaseModel):
    nombre: str
    unidad_comision: str = Field(default="kg", alias="unidadComision")
    tacho_kilos: Optional[Decimal] = Field(default=None, alias="tachoKilos")
    saco_kilos: Optional[Decimal] = Field(default=None, alias="sacoKilos")
    peso_por_unidad: Optional[Decimal] = Field(default=None, alias="pesoPorUnidad")
    alias: list[str] = Field(default_factory=list)

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
    saco_kilos: Optional[Decimal] = Field(alias="sacoKilos")
    peso_por_unidad: Optional[Decimal] = Field(alias="pesoPorUnidad")
    activo: bool
    alias: list[str] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    @field_validator("alias", mode="before")
    @classmethod
    def _convertir_alias(cls, v: Any) -> list[str]:
        if v is None:
            return []
        # Si viene de una relación ORM (lista de ProductoAlias), extraer el texto
        if hasattr(v, "__iter__") and not isinstance(v, str):
            return [getattr(item, "alias", str(item)) for item in v]
        return v
