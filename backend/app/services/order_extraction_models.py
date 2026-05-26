from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class EntradaExtraccion(BaseModel):
    nombre_archivo: str
    content_type: str
    texto: str = ""
    imagenes_base64: list[str] = Field(default_factory=list)


class OrdenItemExtraidoIA(BaseModel):
    producto: str
    cantidad: Decimal
    unidad: str
    precioUnitario: Decimal
    total: Decimal
    finca: Optional[str] = None
    confidence: Optional[float] = None


class OrdenExtraidaIA(BaseModel):
    fecha: str
    numeroOrden: str
    proveedor: str = ""
    cliente: str = ""
    finca: str = ""
    semana: str = ""
    items: list[OrdenItemExtraidoIA]
    confidence: Optional[float] = None


class OrdenItemValidado(BaseModel):
    fecha: date
    numeroOrden: str
    finca: str
    producto: str
    cantidad: Decimal
    unidad: str
    precioUnitario: Decimal
    total: Decimal
    comisionistas: list = Field(default_factory=list)
    clienteTexto: str = ""
    fincaId: Optional[str] = None
    clienteId: Optional[str] = None
    productoId: Optional[str] = None


class OrdenValidada(BaseModel):
    fecha: date
    numeroOrden: str
    proveedor: str
    cliente: str = ""
    finca: str = ""
    semana: str
    items: list[OrdenItemValidado]
