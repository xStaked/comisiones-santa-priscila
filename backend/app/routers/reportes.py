from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.comisionista import Comisionista, Tarifa, TipoTarifa
from app.models.liquidacion import Liquidacion, LiquidacionItem, LiquidacionItemTarifa
from app.models.orden import Asignacion, EstadoOrden, OrdenItem
from app.dependencies import get_current_user
from sqlalchemy.orm import selectinload

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
def resumen(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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
def por_finca(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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
def por_producto(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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
def por_comisionista(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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


@router.get("/global")
def global_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total_ordenes_activas = db.query(OrdenItem).filter(OrdenItem.estado == EstadoOrden.activo).count()
    total_liquidaciones = db.query(Liquidacion).count()

    # Total comisionado histórico (todas las liquidaciones)
    total_comisionado_historico = Decimal("0")
    total_vendido_historico = Decimal("0")
    liquidaciones = (
        db.query(Liquidacion)
        .options(selectinload(Liquidacion.items).selectinload(LiquidacionItem.tarifas))
        .all()
    )
    for l in liquidaciones:
        for li in l.items:
            total_vendido_historico += li.total_snapshot
            for t in li.tarifas:
                total_comisionado_historico += t.comision_calculada

    # Mes actual
    mes_actual = datetime.now().strftime("%Y-%m")
    liquidaciones_mes = db.query(Liquidacion).filter(Liquidacion.mes == mes_actual).all()
    total_comisionado_mes = Decimal("0")
    for l in liquidaciones_mes:
        for li in l.items:
            for t in li.tarifas:
                total_comisionado_mes += t.comision_calculada

    # Órdenes activas
    ordenes_activas = (
        db.query(OrdenItem)
        .filter(OrdenItem.estado == EstadoOrden.activo)
        .options(selectinload(OrdenItem.asignaciones).selectinload(Asignacion.comisionista).selectinload(Comisionista.tarifas))
        .all()
    )
    total_comision_activas = Decimal("0")
    total_vendido_activas = Decimal("0")
    for oi in ordenes_activas:
        total_vendido_activas += oi.total
        for asig in oi.asignaciones:
            for tarifa in asig.comisionista.tarifas:
                total_comision_activas += _calcular_comision(oi, tarifa)

    return {
        "total_ordenes_activas": total_ordenes_activas,
        "total_liquidaciones": total_liquidaciones,
        "total_comisionado_este_mes": float(total_comisionado_mes),
        "total_comisionado_historico": float(total_comisionado_historico),
        "total_comision_activas": float(total_comision_activas),
        "total_vendido_historico": float(total_vendido_historico),
        "total_vendido_activas": float(total_vendido_activas),
    }


@router.get("/tendencias")
def tendencias(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    meses: dict[str, dict[str, any]] = {}

    # Liquidaciones
    liquidaciones = (
        db.query(Liquidacion)
        .options(selectinload(Liquidacion.items).selectinload(LiquidacionItem.tarifas))
        .all()
    )
    for l in liquidaciones:
        mes = l.mes
        if mes not in meses:
            meses[mes] = {"comision": Decimal("0"), "ventas": Decimal("0"), "ordenes": 0}
        for li in l.items:
            meses[mes]["ventas"] += li.total_snapshot
            meses[mes]["ordenes"] += 1
            for t in li.tarifas:
                meses[mes]["comision"] += t.comision_calculada

    # Órdenes activas en mes actual
    mes_actual = datetime.now().strftime("%Y-%m")
    ordenes_activas = (
        db.query(OrdenItem)
        .filter(OrdenItem.estado == EstadoOrden.activo)
        .options(selectinload(OrdenItem.asignaciones).selectinload(Asignacion.comisionista).selectinload(Comisionista.tarifas))
        .all()
    )
    if ordenes_activas:
        if mes_actual not in meses:
            meses[mes_actual] = {"comision": Decimal("0"), "ventas": Decimal("0"), "ordenes": 0}
        for oi in ordenes_activas:
            meses[mes_actual]["ventas"] += oi.total
            meses[mes_actual]["ordenes"] += 1
            for asig in oi.asignaciones:
                for tarifa in asig.comisionista.tarifas:
                    meses[mes_actual]["comision"] += _calcular_comision(oi, tarifa)

    return [
        {"mes": mes, "comision": float(v["comision"]), "ventas": float(v["ventas"]), "ordenes": v["ordenes"]}
        for mes, v in sorted(meses.items())
    ]
