from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.comisionista import Comisionista, Tarifa, TipoTarifa
from app.models.liquidacion import Liquidacion
from app.models.orden import Asignacion, EstadoOrden, OrdenItem

router = APIRouter()

LIBRA_A_KG = Decimal("0.453592")


def _calcular_comision(oi: OrdenItem, tarifa: Tarifa) -> Decimal:
    if tarifa.tipo == TipoTarifa.porcentaje:
        return oi.total * (tarifa.valor / Decimal("100"))
    elif tarifa.tipo == TipoTarifa.fijo_kg:
        if oi.unidad.lower() == "libras":
            cantidad_kg = oi.cantidad * LIBRA_A_KG
        else:
            cantidad_kg = oi.cantidad
        return cantidad_kg * tarifa.valor
    return Decimal("0")


@router.get("/resumen")
def resumen(db: Session = Depends(get_db)):
    total_ordenes = (
        db.query(OrdenItem)
        .filter(OrdenItem.estado == EstadoOrden.activo)
        .count()
    )
    total_liquidaciones = db.query(Liquidacion).count()

    mes_actual = datetime.now().strftime("%Y-%m")
    liquidaciones_mes = (
        db.query(Liquidacion)
        .filter(Liquidacion.mes == mes_actual)
        .all()
    )

    total_comisionado = Decimal("0")
    for l in liquidaciones_mes:
        for li in l.items:
            for t in li.tarifas:
                total_comisionado += t.comision_calculada

    return {
        "total_ordenes_activas": total_ordenes,
        "total_liquidaciones": total_liquidaciones,
        "total_comisionado_este_mes": float(total_comisionado),
    }


@router.get("/por-finca")
def por_finca(db: Session = Depends(get_db)):
    ordenes = (
        db.query(OrdenItem)
        .filter(OrdenItem.estado == EstadoOrden.activo)
        .all()
    )
    grupos = defaultdict(
        lambda: {
            "ordenes": 0,
            "cantidad": Decimal("0"),
            "total": Decimal("0"),
            "comision": Decimal("0"),
        }
    )

    for oi in ordenes:
        grupos[oi.finca]["ordenes"] += 1
        grupos[oi.finca]["cantidad"] += oi.cantidad
        grupos[oi.finca]["total"] += oi.total
        for asignacion in oi.asignaciones:
            for tarifa in asignacion.comisionista.tarifas:
                grupos[oi.finca]["comision"] += _calcular_comision(
                    oi, tarifa
                )

    return [
        {
            "finca": finca,
            "ordenes": v["ordenes"],
            "cantidad": float(v["cantidad"]),
            "total": float(v["total"]),
            "comision": float(v["comision"]),
        }
        for finca, v in grupos.items()
    ]


@router.get("/por-producto")
def por_producto(db: Session = Depends(get_db)):
    ordenes = (
        db.query(OrdenItem)
        .filter(OrdenItem.estado == EstadoOrden.activo)
        .all()
    )
    grupos = defaultdict(
        lambda: {
            "ordenes": 0,
            "cantidad": Decimal("0"),
            "total": Decimal("0"),
            "comision": Decimal("0"),
        }
    )

    for oi in ordenes:
        grupos[oi.producto]["ordenes"] += 1
        grupos[oi.producto]["cantidad"] += oi.cantidad
        grupos[oi.producto]["total"] += oi.total
        for asignacion in oi.asignaciones:
            for tarifa in asignacion.comisionista.tarifas:
                grupos[oi.producto]["comision"] += _calcular_comision(
                    oi, tarifa
                )

    return [
        {
            "producto": producto,
            "ordenes": v["ordenes"],
            "cantidad": float(v["cantidad"]),
            "total": float(v["total"]),
            "comision": float(v["comision"]),
        }
        for producto, v in grupos.items()
    ]


@router.get("/por-comisionista")
def por_comisionista(db: Session = Depends(get_db)):
    comisionistas = db.query(Comisionista).all()
    resultados = []

    for c in comisionistas:
        ordenes = (
            db.query(OrdenItem)
            .join(Asignacion)
            .filter(
                Asignacion.comisionista_id == c.id,
                OrdenItem.estado == EstadoOrden.activo,
            )
            .all()
        )

        total_comision = Decimal("0")
        total_orden = Decimal("0")
        for oi in ordenes:
            total_orden += oi.total
            for tarifa in c.tarifas:
                total_comision += _calcular_comision(oi, tarifa)

        resultados.append(
            {
                "comisionista_id": c.id,
                "comisionista_nombre": c.nombre,
                "tarifas": " + ".join(
                    f"{t.valor}%" if t.tipo == TipoTarifa.porcentaje else f"${t.valor}/kg"
                    for t in c.tarifas
                ),
                "ordenes": len(ordenes),
                "total_orden": float(total_orden),
                "total_comision": float(total_comision),
            }
        )

    return resultados
