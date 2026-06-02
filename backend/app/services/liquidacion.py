from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.cliente import Finca
from app.models.comisionista import Tarifa, TipoTarifa
from app.models.liquidacion import Liquidacion, LiquidacionItem, LiquidacionItemTarifa
from app.models.orden import Asignacion, EstadoOrden, Orden, OrdenItem
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.catalog_normalization import (
    normalizar_nombre_finca,
    normalizar_nombre_producto,
)

LIBRA_A_KG = Decimal("0.453592")


def _buscar_tarifa_especifica(
    db: Session, orden_item: OrdenItem, comisionista_id: UUID
) -> TarifaClienteProducto | None:
    """Busca tarifa específica Comisionista+Cliente+Producto+Finca, luego sin Finca."""
    cliente_id = orden_item.cliente_id
    producto_id = orden_item.producto_id
    finca_id = orden_item.finca_id

    if not producto_id and orden_item.producto:
        nombre_producto = normalizar_nombre_producto(orden_item.producto)
        producto = next(
            (
                producto
                for producto in db.query(Producto).all()
                if normalizar_nombre_producto(producto.nombre) == nombre_producto
            ),
            None,
        )
        producto_id = producto.id if producto else None

    nombre_finca_orden = (
        orden_item.finca
        if orden_item.finca and orden_item.finca != "-"
        else orden_item.sector
    )
    if not finca_id and nombre_finca_orden:
        fincas_query = db.query(Finca)
        if cliente_id:
            fincas_query = fincas_query.filter(Finca.cliente_id == cliente_id)
        nombre_finca = normalizar_nombre_finca(nombre_finca_orden)
        fincas = [
            finca
            for finca in fincas_query.all()
            if normalizar_nombre_finca(finca.nombre) == nombre_finca
        ]
        if len(fincas) == 1:
            finca_id = fincas[0].id
            cliente_id = cliente_id or fincas[0].cliente_id

    if not cliente_id or not producto_id:
        return None

    # 1. Con finca
    if finca_id:
        tarifa = (
            db.query(TarifaClienteProducto)
            .filter(
                TarifaClienteProducto.comisionista_id == comisionista_id,
                TarifaClienteProducto.cliente_id == cliente_id,
                TarifaClienteProducto.producto_id == producto_id,
                TarifaClienteProducto.finca_id == finca_id,
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
            TarifaClienteProducto.cliente_id == cliente_id,
            TarifaClienteProducto.producto_id == producto_id,
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


def _tiene_tarifas_especificas(
    db: Session, comisionista_id: UUID
) -> bool:
    """Devuelve True si el comisionista tiene al menos una tarifa específica activa."""
    return (
        db.query(TarifaClienteProducto)
        .filter(
            TarifaClienteProducto.comisionista_id == comisionista_id,
            TarifaClienteProducto.activo.is_(True),
        )
        .first()
        is not None
    )


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
) -> tuple[Liquidacion, list[dict]]:
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

    # Filtrar ítems no activos: se omiten en lugar de fallar
    omitidos: list[dict] = []
    orden_items_activos: list[OrdenItem] = []
    for oi in orden_items:
        if oi.estado != EstadoOrden.activo:
            omitidos.append({
                "id": str(oi.id),
                "estado": oi.estado.value,
                "motivo": "no está activo",
            })
        else:
            orden_items_activos.append(oi)

    if not orden_items_activos:
        raise ValueError("Ninguno de los ítems seleccionados está activo")

    now = datetime.now()
    mes = now.strftime("%Y-%m")

    liquidacion = Liquidacion(
        nombre=nombre,
        mes=mes,
        fecha_creacion=now,
    )
    db.add(liquidacion)
    db.flush()

    for oi in orden_items_activos:
        li = LiquidacionItem(
            liquidacion_id=liquidacion.id,
            orden_item_id=oi.id,
            orden_id=oi.orden_id,
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
                # Si el comisionista tiene tarifas específicas configuradas pero
                # ninguna aplica a este item, no debe hacer fallback a globales.
                if _tiene_tarifas_especificas(db, comisionista.id):
                    lit = LiquidacionItemTarifa(
                        liquidacion_item_id=li.id,
                        comisionista_id=comisionista.id,
                        comisionista_nombre_snapshot=comisionista.nombre,
                        tipo_snapshot="sin_tarifa",
                        valor_snapshot=Decimal("0"),
                        comision_calculada=Decimal("0"),
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

    for oi in orden_items_activos:
        oi.estado = EstadoOrden.liquidado

    db.flush()

    orden_ids = {oi.orden_id for oi in orden_items_activos if oi.orden_id is not None}
    for orden_id in orden_ids:
        pendientes = (
            db.query(OrdenItem)
            .filter(
                OrdenItem.orden_id == orden_id,
                OrdenItem.estado == EstadoOrden.activo,
            )
            .count()
        )
        if pendientes == 0:
            orden = db.query(Orden).filter(Orden.id == orden_id).first()
            if orden:
                orden.estado = EstadoOrden.liquidado

    db.commit()
    db.refresh(liquidacion)
    return liquidacion, omitidos


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

    orden_ids = [
        li.orden_id
        for li in liquidacion.items
        if li.orden_id is not None
    ]
    if orden_ids:
        db.query(Orden).filter(Orden.id.in_(orden_ids)).update(
            {Orden.estado: EstadoOrden.activo},
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
    ordenes_restauradas: dict[UUID, Orden] = {}

    for li in liquidacion.items:
        clave_orden = li.orden_id or li.id
        orden = ordenes_restauradas.get(clave_orden)
        if not orden:
            orden = Orden(
                fecha=li.fecha_snapshot,
                numero_orden=li.numero_orden_snapshot,
                origen="manual",
                estado=EstadoOrden.activo,
            )
            db.add(orden)
            db.flush()
            ordenes_restauradas[clave_orden] = orden

        nuevo_oi = OrdenItem(
            orden_id=orden.id,
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
