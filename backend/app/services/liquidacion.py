from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.comisionista import Tarifa, TipoTarifa
from app.models.liquidacion import Liquidacion, LiquidacionItem, LiquidacionItemTarifa
from app.models.orden import Asignacion, EstadoOrden, OrdenItem

LIBRA_A_KG = Decimal("0.453592")


def _calcular_comision(orden_item: OrdenItem, tarifa: Tarifa) -> Decimal:
    if tarifa.tipo == TipoTarifa.porcentaje:
        return orden_item.total * (tarifa.valor / Decimal("100"))
    elif tarifa.tipo == TipoTarifa.fijo_kg:
        if orden_item.unidad.lower() == "libras":
            cantidad_kg = orden_item.cantidad * LIBRA_A_KG
        else:
            cantidad_kg = orden_item.cantidad
        return cantidad_kg * tarifa.valor
    return Decimal("0")


def crear_liquidacion(
    db: Session, nombre: str, orden_item_ids: list[UUID]
) -> Liquidacion:
    orden_items = (
        db.query(OrdenItem).filter(OrdenItem.id.in_(orden_item_ids)).all()
    )

    found_ids = {oi.id for oi in orden_items}
    missing = set(orden_item_ids) - found_ids
    if missing:
        raise ValueError(f"OrdenItems no encontrados: {missing}")

    for oi in orden_items:
        if oi.estado != EstadoOrden.activo:
            raise ValueError(
                f"OrdenItem {oi.id} no está activo (estado={oi.estado.value})"
            )

    now = datetime.now()
    mes = now.strftime("%Y-%m")

    liquidacion = Liquidacion(
        nombre=nombre,
        mes=mes,
        fecha_creacion=now,
    )
    db.add(liquidacion)
    db.flush()

    for oi in orden_items:
        li = LiquidacionItem(
            liquidacion_id=liquidacion.id,
            orden_item_id=oi.id,
            fecha_snapshot=oi.fecha,
            numero_orden_snapshot=oi.numero_orden,
            finca_snapshot=oi.finca,
            producto_snapshot=oi.producto,
            cantidad_snapshot=oi.cantidad,
            unidad_snapshot=oi.unidad,
            precio_unitario_snapshot=oi.precio_unitario,
            total_snapshot=oi.total,
            sector_snapshot=oi.sector,
            estado_snapshot=oi.estado.value,
        )
        db.add(li)
        db.flush()

        for asignacion in oi.asignaciones:
            comisionista = asignacion.comisionista
            for tarifa in comisionista.tarifas:
                comision = _calcular_comision(oi, tarifa)
                lit = LiquidacionItemTarifa(
                    liquidacion_item_id=li.id,
                    comisionista_id=comisionista.id,
                    comisionista_nombre_snapshot=comisionista.nombre,
                    tipo_snapshot=tarifa.tipo.value,
                    valor_snapshot=tarifa.valor,
                    comision_calculada=comision,
                )
                db.add(lit)

    for oi in orden_items:
        oi.estado = EstadoOrden.liquidado

    db.commit()
    db.refresh(liquidacion)
    return liquidacion


def eliminar_liquidacion(db: Session, liquidacion_id: UUID) -> bool:
    liquidacion = (
        db.query(Liquidacion).filter(Liquidacion.id == liquidacion_id).first()
    )
    if not liquidacion:
        raise ValueError("Liquidación no encontrada")

    orden_item_ids = [
        li.orden_item_id
        for li in liquidacion.items
        if li.orden_item_id is not None
    ]

    if orden_item_ids:
        db.query(OrdenItem).filter(OrdenItem.id.in_(orden_item_ids)).update(
            {OrdenItem.estado: EstadoOrden.activo},
            synchronize_session=False,
        )

    db.delete(liquidacion)
    db.commit()
    return True


def restaurar_liquidacion(db: Session, liquidacion_id: UUID) -> list[UUID]:
    liquidacion = (
        db.query(Liquidacion).filter(Liquidacion.id == liquidacion_id).first()
    )
    if not liquidacion:
        raise ValueError("Liquidación no encontrada")

    nuevos_ids: list[UUID] = []

    for li in liquidacion.items:
        nuevo_oi = OrdenItem(
            fecha=li.fecha_snapshot,
            numero_orden=li.numero_orden_snapshot,
            finca=li.finca_snapshot,
            producto=li.producto_snapshot,
            cantidad=li.cantidad_snapshot,
            unidad=li.unidad_snapshot,
            precio_unitario=li.precio_unitario_snapshot,
            total=li.total_snapshot,
            sector=li.sector_snapshot,
            estado=EstadoOrden.activo,
        )
        db.add(nuevo_oi)
        db.flush()

        comisionista_ids = {t.comisionista_id for t in li.tarifas}
        for cid in comisionista_ids:
            db.add(Asignacion(orden_item_id=nuevo_oi.id, comisionista_id=cid))

        nuevos_ids.append(nuevo_oi.id)

    db.delete(liquidacion)
    db.commit()
    return nuevos_ids
