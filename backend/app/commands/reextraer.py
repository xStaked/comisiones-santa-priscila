"""
Reejecuta el parser sobre las entradas guardadas y reporta diferencias.

Uso:
    python -m app.commands.reextraer [--desde-version N] [--limite N] [--detalle]

No modifica datos: sirve para saber qué órdenes quedaron con un parseo distinto
después de un cambio en el parser y decidir cuáles re-subir.
"""

import argparse
import os
import sys
from collections import Counter
from decimal import Decimal

# Ensure the backend directory is on the path when running outside Docker
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.database import SessionLocal
from app.models import OrdenExtraccion, OrdenItem
from app.services.pdf_extractor import (
    PARSER_VERSION,
    deserializar_entrada,
    extraer_orden_desde_entrada,
)

CENTAVOS = Decimal("0.01")


def _num(valor) -> Decimal:
    return Decimal(str(valor or 0)).quantize(CENTAVOS)


def _linea_guardada(item: OrdenItem) -> tuple:
    return (
        item.finca,
        item.producto,
        _num(item.cantidad),
        item.unidad,
        _num(item.precio_unitario),
        _num(item.total),
    )


def _linea_reejecutada(item: dict) -> tuple:
    return (
        item["finca"],
        item["producto"],
        _num(item["cantidad"]),
        item["unidad"],
        _num(item["precioUnitario"]),
        _num(item["total"]),
    )


def _formato(linea: tuple) -> str:
    finca, producto, cantidad, unidad, precio, total = linea
    return f"{finca} | {producto} | {cantidad} {unidad} | {precio} | {total}"


def revisar(
    db,
    desde_version: int | None = None,
    limite: int | None = None,
    detalle: bool = False,
) -> int:
    query = db.query(OrdenExtraccion).filter(
        OrdenExtraccion.orden_id.isnot(None)
    )
    if desde_version is not None:
        query = query.filter(OrdenExtraccion.parser_version < desde_version)
    query = query.order_by(OrdenExtraccion.numero_orden)
    if limite:
        query = query.limit(limite)

    revisadas = 0
    afectadas = 0
    for extraccion in query.all():
        guardadas = (
            db.query(OrdenItem)
            .filter(OrdenItem.orden_id == extraccion.orden_id)
            .all()
        )
        if not guardadas:
            continue

        revisadas += 1
        cliente_id = next(
            (str(item.cliente_id) for item in guardadas if item.cliente_id),
            None,
        )
        try:
            nuevo = extraer_orden_desde_entrada(
                deserializar_entrada(extraccion.entrada),
                db=db,
                cliente_id=cliente_id,
            )
        except Exception as exc:  # reportar y seguir con la próxima
            afectadas += 1
            print(
                f"OC {extraccion.numero_orden}: no se pudo reejecutar ({exc})"
            )
            continue

        antiguas = Counter(_linea_guardada(item) for item in guardadas)
        actuales = Counter(_linea_reejecutada(item) for item in nuevo["items"])
        if antiguas == actuales:
            continue

        afectadas += 1
        total_antiguo = sum(
            (_linea_guardada(item)[5] for item in guardadas), Decimal("0")
        )
        total_nuevo = sum(
            (_linea_reejecutada(item)[5] for item in nuevo["items"]), Decimal("0")
        )
        print(
            f"OC {extraccion.numero_orden} {extraccion.fecha_orden} "
            f"(parser v{extraccion.parser_version} -> v{PARSER_VERSION}): "
            f"{sum(antiguas.values())} -> {sum(actuales.values())} líneas, "
            f"${total_antiguo} -> ${total_nuevo}"
        )
        if detalle:
            for linea, cantidad in (antiguas - actuales).items():
                for _ in range(cantidad):
                    print(f"  - {_formato(linea)}")
            for linea, cantidad in (actuales - antiguas).items():
                for _ in range(cantidad):
                    print(f"  + {_formato(linea)}")

    print(
        f"\n{revisadas} entradas revisadas, {afectadas} con diferencias "
        f"(parser actual v{PARSER_VERSION})"
    )
    return afectadas


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reejecuta el parser sobre las entradas guardadas (solo reporte)"
    )
    parser.add_argument(
        "--desde-version",
        type=int,
        default=None,
        help="solo entradas con parser_version menor a N",
    )
    parser.add_argument(
        "--limite", type=int, default=None, help="máximo de órdenes a revisar"
    )
    parser.add_argument(
        "--detalle", action="store_true", help="mostrar las líneas que difieren"
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        revisar(db, args.desde_version, args.limite, args.detalle)
    finally:
        db.close()


if __name__ == "__main__":
    main()
