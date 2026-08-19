from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.services.order_extraction_models import (
    OrdenExtraidaIA,
    OrdenItemValidado,
    OrdenValidada,
)

UNIDADES_NORMALIZADAS = {
    "kg": "kg",
    "kilo": "kg",
    "kilos": "kg",
    "kilogramo": "kg",
    "kilogramos": "kg",
    "l": "litros",
    "lt": "litros",
    "lts": "litros",
    "litro": "litros",
    "litros": "litros",
    "unidad": "unidades",
    "unidades": "unidades",
    "caja": "cajas",
    "cajas": "cajas",
    "tacho": "tachos",
    "tachos": "tachos",
    "saco": "sacos",
    "sacos": "sacos",
    "caneca": "canecas",
    "canecas": "canecas",
    "galon": "galones",
    "galón": "galones",
    "galones": "galones",
}


def _parsear_fecha(valor: str) -> date:
    limpio = valor.strip()
    for formato in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(limpio, formato).date()
        except ValueError:
            continue
    raise ValueError("La fecha extraida no tiene un formato valido")


def _decimal_positivo(valor: Decimal, campo: str) -> Decimal:
    try:
        numero = Decimal(str(valor))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{campo} no es un numero valido") from exc
    if numero <= 0:
        raise ValueError(f"{campo} debe ser mayor a cero")
    return numero


def _numero_desde_texto(texto: str) -> Decimal | None:
    """Convierte el numero tal cual lo imprime el documento ("22.500,00").

    La IA lo leia como 22,5 —tomaba el punto de miles por decimal— y la comision
    salia 1000 veces menor sin que nada lo notara: cantidad x precio seguia
    cuadrando con el total, porque el error era parejo en los tres numeros.
    Transcrito, el numero si es interpretable sin ambiguedad: el ULTIMO separador
    es el decimal y los anteriores son de miles. La unica duda real es un
    separador solitario; si parte exactamente tres digitos es de miles
    ("22.500"), que es como escriben las cantidades estas facturas.
    """
    limpio = re.sub(r"[^\d.,]", "", texto or "")
    if not re.search(r"\d", limpio):
        return None

    separadores = [c for c in limpio if c in ".,"]
    if separadores:
        ultimo = limpio.rindex(separadores[-1])
        decimales = len(limpio) - ultimo - 1
        es_miles = len(set(separadores)) == 1 and (
            len(separadores) > 1 or decimales == 3
        )
        entero = re.sub(r"[.,]", "", limpio if es_miles else limpio[:ultimo])
        limpio = entero if es_miles else f"{entero}.{limpio[ultimo + 1:]}"

    try:
        return Decimal(limpio)
    except InvalidOperation:
        return None


def _decimal_de_item(texto: str, valor: Decimal, campo: str) -> Decimal:
    """El numero transcrito manda; el campo numerico es el respaldo."""
    desde_texto = _numero_desde_texto(texto)
    return _decimal_positivo(valor if desde_texto is None else desde_texto, campo)


def _normalizar_unidad(valor: str) -> str:
    unidad = valor.strip().lower()
    return UNIDADES_NORMALIZADAS.get(unidad, unidad or "unidades")


def validar_orden_extraida(orden: OrdenExtraidaIA) -> OrdenValidada:
    fecha = _parsear_fecha(orden.fecha)
    numero_orden = orden.numeroOrden.strip()
    if not numero_orden:
        raise ValueError("El numero de orden es obligatorio")
    if not orden.items:
        raise ValueError("No se encontraron productos en la orden")

    items: list[OrdenItemValidado] = []
    for item in orden.items:
        producto = item.producto.strip()
        if not producto:
            raise ValueError("Cada item debe tener producto")

        cantidad = _decimal_de_item(item.cantidadTexto, item.cantidad, "cantidad")
        precio_unitario = _decimal_de_item(
            item.precioUnitarioTexto, item.precioUnitario, "precioUnitario"
        )
        total = _decimal_de_item(item.totalTexto, item.total, "total")

        total_calculado = cantidad * precio_unitario
        tolerancia = max(Decimal("0.05"), total * Decimal("0.02"))
        if abs(total_calculado - total) > tolerancia:
            raise ValueError("El total inconsistente excede la tolerancia permitida")

        finca = (item.finca or orden.finca or "-").strip() or "-"
        items.append(
            OrdenItemValidado(
                fecha=fecha,
                numeroOrden=numero_orden,
                finca=finca,
                producto=producto,
                cantidad=cantidad,
                unidad=_normalizar_unidad(item.unidad),
                precioUnitario=precio_unitario,
                total=total,
                clienteTexto=orden.cliente.strip(),
            )
        )

    return OrdenValidada(
        fecha=fecha,
        numeroOrden=numero_orden,
        proveedor=orden.proveedor.strip(),
        cliente=orden.cliente.strip(),
        finca=orden.finca.strip(),
        semana=orden.semana.strip(),
        items=items,
    )
