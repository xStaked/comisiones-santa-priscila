from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.comisionista import Tarifa, TipoTarifa
from app.models.liquidacion import Liquidacion, LiquidacionItem, LiquidacionItemTarifa
from app.models.orden import Asignacion, EstadoOrden, OrdenItem
from app.models.tarifa_cliente_producto import TarifaClienteProducto

LIBRA_A_KG = Decimal("0.453592")


def _buscar_tarifa_especifica(
    db: Session, orden_item: OrdenItem, comisionista_id: UUID
) -> TarifaClienteProducto | None:
    """Busca tarifa específica Comisionista+Cliente+Producto+Finca, luego sin Finca."""
    if not orden_item.cliente_id or not orden_item.producto_id:
        return None

    # 1. Con finca
    if orden_item.finca_id:
        tarifa = (
            db.query(TarifaClienteProducto)
            .filter(
                TarifaClienteProducto.comisionista_id == comisionista_id,
                TarifaClienteProducto.cliente_id == orden_item.cliente_id,
                TarifaClienteProducto.producto_id == orden_item.producto_id,
                TarifaClienteProducto.finca_id == orden_item.finca_id,
                TarifaClienteProducto.activo.is_(True),
            )
            .first()
        )
        if tarifa:
            return tarifa

    # 2. Sin finca (finca_id IS NULL)
    tarifa = (
        db.query(TarifaClienteProducto)
        .filter(
            TarifaClienteProducto.comisionista_id == comisionista_id,
            TarifaClienteProducto.cliente_id == orden_item.cliente_id,
            TarifaClienteProducto.producto_id == orden_item.producto_id,
            TarifaClienteProducto.finca_id.is_(None),
            TarifaClienteProducto.activo.is_(True),
        )
        .first()
    )
    return tarifa


def _calcular_comision_con_tarifa(
    orden_item: OrdenItem, tarifa: Tarifa | TarifaClienteProducto
) -> Decimal:
    """Calcula comisión usando una tarifa (global o específica)."""
    if tarifa.tipo == TipoTarifa.porcentaje:
        return orden_item.total * (tarifa.valor / Decimal("100"))
    elif tarifa.tipo == TipoTarifa.fijo_kg:
        if orden_item.unidad.lower() == "libras":
            cantidad_kg = orden_item.cantidad * LIBRA_A_KG
        else:
            cantidad_kg = orden_item.cantidad
        return cantidad_kg * tarifa.valor
    return Decimal("0")


def _calcular_comision_especifica(
    db: Session, orden_item: OrdenItem, tarifa: TarifaClienteProducto
) -> Decimal:
    """Calcula comisión con tarifa específica considerando retención y unidad de producto."""
    if tarifa.tipo == TipoTarifa.porcentaje:
        retencion = (
            orden_item.cliente.retencion_porcentaje
            if orden_item.cliente
            else Decimal("1.75")
        )
        base = orden_item.total * (Decimal("1") - retencion / Decimal("100"))
        return base * (tarifa.valor / Decimal("100"))
    elif tarifa.tipo == TipoTarifa.fijo_kg:
        producto = orden_item.producto_obj
        if producto and producto.unidad_comision == "litro":
            cantidad = orden_item.cantidad
        elif producto and producto.unidad_comision == "tacho":
            cantidad = orden_item.cantidad * (producto.tacho_kilos or Decimal("15"))
        else:
            if orden_item.unidad and orden_item.unidad.lower() == "libras":
                cantidad = orden_item.cantidad * LIBRA_A_KG
            else:
                cantidad = orden_item.cantidad
        return cantidad * tarifa.valor
    return Decimal("0")


def crear_liquidacion(
    db: Session, nombre: str, orden_item_ids: list[UUID]
) -> Liquidacion:
    from sqlalchemy.orm import selectinload

    orden_items = (
        db.query(OrdenItem)
        .filter(OrdenItem.id.in_(orden_item_ids))
        .options(
            selectinload(OrdenItem.asignaciones).selectinload(Asignacion.comisionista),
            selectinload(OrdenItem.cliente),
            selectinload(OrdenItem.producto_obj),
            selectinload(OrdenItem.finca_obj),
        )
        .all()
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
            cliente_snapshot=oi.cliente.nombre if oi.cliente else None,
            retencion_porcentaje_snapshot=(
                oi.cliente.retencion_porcentaje if oi.cliente else Decimal("1.75")
            ),
        )
        db.add(li)
        db.flush()

        for asignacion in oi.asignaciones:
            comisionista = asignacion.comisionista
            tarifa_esp = _buscar_tarifa_especifica(db, oi, comisionista.id)

            if tarifa_esp:
                comision = _calcular_comision_especifica(db, oi, tarifa_esp)
                lit = LiquidacionItemTarifa(
                    liquidacion_item_id=li.id,
                    comisionista_id=comisionista.id,
                    comisionista_nombre_snapshot=comisionista.nombre,
                    tipo_snapshot=tarifa_esp.tipo.value,
                    valor_snapshot=tarifa_esp.valor,
                    comision_calculada=comision,
                )
                db.add(lit)
            else:
                # Fallback a tarifas globales del comisionista
                for tarifa in comisionista.tarifas:
                    comision = _calcular_comision_con_tarifa(oi, tarifa)
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
