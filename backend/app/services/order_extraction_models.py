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
    # El número transcrito tal cual del documento ("22.500,00"). La conversión a
    # Decimal la hace el validador, no la IA: ver _numero_desde_texto().
    cantidadTexto: str = ""
    precioUnitarioTexto: str = ""
    totalTexto: str = ""
    finca: Optional[str] = None
    confidence: Optional[float] = None


class OrdenExtraidaIA(BaseModel):
    fecha: str
    numeroOrden: str
    proveedor: str = ""
    # Texto descriptivo de los items tal cual esta impreso. Es la unica forma de
    # que la ruta de imagen alcance el parser de sectores: no hay texto que
    # extraer del archivo, asi que lo transcribe la IA.
    glosa: str = ""
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
    # Motivos por los que el ítem no se puede cargar, en castellano y listos
    # para mostrar. Solo viven en la vista previa: no se persisten.
    problemas: list[str] = Field(default_factory=list)


class OrdenValidada(BaseModel):
    fecha: date
    numeroOrden: str
    proveedor: str
    cliente: str = ""
    finca: str = ""
    semana: str
    items: list[OrdenItemValidado]
