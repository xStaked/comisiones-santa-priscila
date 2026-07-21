from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.user import User
from app.models.comisionista import Comisionista, Tarifa, TipoTarifa
from app.models.liquidacion import Liquidacion, LiquidacionItem, LiquidacionItemTarifa
from app.models.orden import Asignacion, EstadoOrden, OrdenItem
from app.dependencies import get_current_user
from app.services.liquidacion import (
    _buscar_tarifa_especifica,
    _calcular_comision_con_tarifa,
    _calcular_comision_especifica,
)
from app.services.retencion import cargar_periodos
from app.models.retencion import Retencion

router = APIRouter()

LIBRA_A_KG = Decimal("0.453592")


def _calcular_comision_orden(
    db: Session,
    oi: OrdenItem,
    comisionista: Comisionista,
    periodos: list[Retencion],
) -> Decimal:
    """Calcula comisión total para un comisionista en una orden (específica → global)."""
    total = Decimal("0")
    tarifa_esp = _buscar_tarifa_especifica(db, oi, comisionista.id)
    if tarifa_esp:
        total += _calcular_comision_especifica(db, oi, tarifa_esp, periodos)
    else:
        for tarifa in comisionista.tarifas:
            total += _calcular_comision_con_tarifa(oi, tarifa)
    return total


@router.get("/resumen")
def resumen(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total_ordenes = (
        db.query(OrdenItem)
        .filter(OrdenItem.estado == EstadoOrden.pagada)
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
        "total_ordenes_pagadas": total_ordenes,
        "total_ordenes_activas": total_ordenes,
        "total_liquidaciones": total_liquidaciones,
        "total_comisionado_este_mes": float(total_comisionado),
    }


@router.get("/por-finca")
def por_finca(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ordenes = (
        db.query(OrdenItem)
        .filter(OrdenItem.estado == EstadoOrden.pagada)
        .options(
            selectinload(OrdenItem.asignaciones).selectinload(Asignacion.comisionista),
            selectinload(OrdenItem.cliente),
            selectinload(OrdenItem.producto_obj),
            selectinload(OrdenItem.finca_obj),
        )
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
    periodos = cargar_periodos(db)

    for oi in ordenes:
        clave = oi.finca_obj.nombre if oi.finca_obj else oi.finca
        grupos[clave]["ordenes"] += 1
        grupos[clave]["cantidad"] += oi.cantidad
        grupos[clave]["total"] += oi.total
        for asignacion in oi.asignaciones:
            grupos[clave]["comision"] += _calcular_comision_orden(
                db, oi, asignacion.comisionista, periodos
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
        .filter(OrdenItem.estado == EstadoOrden.pagada)
        .options(
            selectinload(OrdenItem.asignaciones).selectinload(Asignacion.comisionista),
            selectinload(OrdenItem.cliente),
            selectinload(OrdenItem.producto_obj),
            selectinload(OrdenItem.finca_obj),
        )
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
    periodos = cargar_periodos(db)

    for oi in ordenes:
        clave = oi.producto_obj.nombre if oi.producto_obj else oi.producto
        grupos[clave]["ordenes"] += 1
        grupos[clave]["cantidad"] += oi.cantidad
        grupos[clave]["total"] += oi.total
        for asignacion in oi.asignaciones:
            grupos[clave]["comision"] += _calcular_comision_orden(
                db, oi, asignacion.comisionista, periodos
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
    periodos = cargar_periodos(db)

    for c in comisionistas:
        ordenes = (
            db.query(OrdenItem)
            .join(Asignacion)
            .filter(
                Asignacion.comisionista_id == c.id,
                OrdenItem.estado == EstadoOrden.pagada,
            )
            .options(
                selectinload(OrdenItem.cliente),
                selectinload(OrdenItem.producto_obj),
                selectinload(OrdenItem.finca_obj),
            )
            .all()
        )

        total_comision = Decimal("0")
        total_orden = Decimal("0")
        for oi in ordenes:
            total_orden += oi.total
            total_comision += _calcular_comision_orden(db, oi, c, periodos)

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


@router.get("/por-cliente")
def por_cliente(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ordenes = (
        db.query(OrdenItem)
        .filter(OrdenItem.estado == EstadoOrden.pagada)
        .options(
            selectinload(OrdenItem.asignaciones).selectinload(Asignacion.comisionista),
            selectinload(OrdenItem.cliente),
            selectinload(OrdenItem.producto_obj),
            selectinload(OrdenItem.finca_obj),
        )
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
    periodos = cargar_periodos(db)

    for oi in ordenes:
        clave = oi.cliente.nombre if oi.cliente else "Sin cliente"
        grupos[clave]["ordenes"] += 1
        grupos[clave]["cantidad"] += oi.cantidad
        grupos[clave]["total"] += oi.total
        for asignacion in oi.asignaciones:
            grupos[clave]["comision"] += _calcular_comision_orden(
                db, oi, asignacion.comisionista, periodos
            )

    return [
        {
            "cliente": cliente,
            "ordenes": v["ordenes"],
            "cantidad": float(v["cantidad"]),
            "total": float(v["total"]),
            "comision": float(v["comision"]),
        }
        for cliente, v in grupos.items()
    ]


@router.get("/global")
def global_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total_ordenes_pagadas = db.query(OrdenItem).filter(OrdenItem.estado == EstadoOrden.pagada).count()
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

    # Órdenes pagadas pendientes de liquidar
    ordenes_pagadas = (
        db.query(OrdenItem)
        .filter(OrdenItem.estado == EstadoOrden.pagada)
        .options(
            selectinload(OrdenItem.asignaciones).selectinload(Asignacion.comisionista),
            selectinload(OrdenItem.cliente),
            selectinload(OrdenItem.producto_obj),
            selectinload(OrdenItem.finca_obj),
        )
        .all()
    )
    total_comision_pagadas = Decimal("0")
    total_vendido_pagadas = Decimal("0")
    periodos = cargar_periodos(db)
    for oi in ordenes_pagadas:
        total_vendido_pagadas += oi.total
        for asig in oi.asignaciones:
            total_comision_pagadas += _calcular_comision_orden(db, oi, asig.comisionista, periodos)

    return {
        "total_ordenes_pagadas": total_ordenes_pagadas,
        "total_ordenes_activas": total_ordenes_pagadas,
        "total_liquidaciones": total_liquidaciones,
        "total_comisionado_este_mes": float(total_comisionado_mes),
        "total_comisionado_historico": float(total_comisionado_historico),
        "total_comision_pagadas": float(total_comision_pagadas),
        "total_comision_activas": float(total_comision_pagadas),
        "total_vendido_historico": float(total_vendido_historico),
        "total_vendido_pagadas": float(total_vendido_pagadas),
        "total_vendido_activas": float(total_vendido_pagadas),
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

    # Órdenes pagadas pendientes de liquidar en mes actual
    mes_actual = datetime.now().strftime("%Y-%m")
    ordenes_pagadas = (
        db.query(OrdenItem)
        .filter(OrdenItem.estado == EstadoOrden.pagada)
        .options(
            selectinload(OrdenItem.asignaciones).selectinload(Asignacion.comisionista),
            selectinload(OrdenItem.cliente),
            selectinload(OrdenItem.producto_obj),
            selectinload(OrdenItem.finca_obj),
        )
        .all()
    )
    if ordenes_pagadas:
        if mes_actual not in meses:
            meses[mes_actual] = {"comision": Decimal("0"), "ventas": Decimal("0"), "ordenes": 0}
        periodos = cargar_periodos(db)
        for oi in ordenes_pagadas:
            meses[mes_actual]["ventas"] += oi.total
            meses[mes_actual]["ordenes"] += 1
            for asig in oi.asignaciones:
                meses[mes_actual]["comision"] += _calcular_comision_orden(db, oi, asig.comisionista, periodos)

    return [
        {"mes": mes, "comision": float(v["comision"]), "ventas": float(v["ventas"]), "ordenes": v["ordenes"]}
        for mes, v in sorted(meses.items())
    ]
