from __future__ import annotations

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

        cantidad = _decimal_positivo(item.cantidad, "cantidad")
        precio_unitario = _decimal_positivo(item.precioUnitario, "precioUnitario")
        total = _decimal_positivo(item.total, "total")

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
