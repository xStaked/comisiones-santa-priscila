from __future__ import annotations

import re
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
    _normalizar_texto,
    normalizar_nombre_finca,
    normalizar_nombre_producto,
)

LIBRA_A_KG = Decimal("0.453592")


def _extraer_kg_por_tacho(unidad: str | None) -> Decimal | None:
    if not unidad:
        return None

    unidad_normalizada = unidad.lower().replace(",", ".")
    if "tacho" not in unidad_normalizada:
        return None

    match = re.search(r"(\d+(?:\.\d+)?)\s*k(?:g|ilo|ilos)?\b", unidad_normalizada)
    if not match:
        return None

    return Decimal(match.group(1))


def _cantidad_para_tarifa_kg(orden_item: OrdenItem) -> Decimal:
    cantidad = orden_item.cantidad
    unidad_lower = orden_item.unidad.lower() if orden_item.unidad else ""
    producto = orden_item.producto_obj
    kg_por_tacho = _extraer_kg_por_tacho(orden_item.unidad)

    if kg_por_tacho is not None:
        return cantidad * kg_por_tacho

    if "tacho" in unidad_lower:
        tacho_kilos = producto.tacho_kilos if producto and producto.tacho_kilos else Decimal("15")
        return cantidad * tacho_kilos

    if unidad_lower == "libras":
        return cantidad * LIBRA_A_KG

    if "caneca" in unidad_lower:
        return cantidad * Decimal("20")  # 1 caneca = 20 litros ≈ 20 kg

    if "galon" in unidad_lower or "galón" in unidad_lower:
        return cantidad * Decimal("3.78541")  # 1 galón ≈ 3.785 litros ≈ 3.785 kg

    if producto and producto.unidad_comision == "tacho":
        return cantidad * (producto.tacho_kilos or Decimal("15"))

    if producto and producto.unidad_comision == "saco":
        return cantidad * (producto.saco_kilos or Decimal("25"))

    if producto and producto.unidad_comision == "caneca":
        return cantidad * Decimal("20")  # 1 caneca = 20 litros ≈ 20 kg

    if producto and producto.unidad_comision == "galon":
        return cantidad * Decimal("3.78541")  # 1 galón ≈ 3.785 litros ≈ 3.785 kg

    if (
        producto
        and producto.peso_por_unidad
        and unidad_lower not in ("kg", "libras", "litros")
    ):
        return cantidad * producto.peso_por_unidad

    return cantidad


def _buscar_tarifa_especifica(
    db: Session, orden_item: OrdenItem, comisionista_id: UUID
) -> TarifaClienteProducto | None:
    """Busca tarifa específica considerando Cliente, Producto, Finca y Proveedor."""
    cliente_id = orden_item.cliente_id
    producto_id = orden_item.producto_id
    finca_id = orden_item.finca_id
    proveedor_orden = _normalizar_texto(
        orden_item.orden.proveedor if orden_item.orden else ""
    )

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

    def _tarifa_aplica_para_proveedor(tarifa: TarifaClienteProducto) -> bool:
        # 1. Si tiene proveedores excluidos y el proveedor de la orden está en la lista, NO aplica
        if tarifa.proveedores_excluidos:
            excluidos = [_normalizar_texto(p) for p in tarifa.proveedores_excluidos]
            if proveedor_orden in excluidos:
                return False
        # 2. Si tiene proveedor específico, solo aplica si coincide
        if tarifa.proveedor:
            return _normalizar_texto(tarifa.proveedor) == proveedor_orden
        # 3. Sin proveedor ni exclusiones = aplica a cualquiera
        return True

    # 1. Con finca exacta (por ID) + proveedor específico
    if finca_id:
        tarifa = (
            db.query(TarifaClienteProducto)
            .filter(
                TarifaClienteProducto.comisionista_id == comisionista_id,
                TarifaClienteProducto.cliente_id == cliente_id,
                TarifaClienteProducto.producto_id == producto_id,
                TarifaClienteProducto.finca_id == finca_id,
                TarifaClienteProducto.proveedor != "",
                TarifaClienteProducto.activo.is_(True),
            )
            .first()
        )
        if tarifa and _tarifa_aplica_para_proveedor(tarifa):
            return tarifa

    # 2. Con finca exacta (por ID) + sin proveedor (wildcard)
    if finca_id:
        tarifa = (
            db.query(TarifaClienteProducto)
            .filter(
                TarifaClienteProducto.comisionista_id == comisionista_id,
                TarifaClienteProducto.cliente_id == cliente_id,
                TarifaClienteProducto.producto_id == producto_id,
                TarifaClienteProducto.finca_id == finca_id,
                TarifaClienteProducto.proveedor == "",
                TarifaClienteProducto.activo.is_(True),
            )
            .first()
        )
        if tarifa and _tarifa_aplica_para_proveedor(tarifa):
            return tarifa

    # 3. Buscar tarifa con finca por nombre + proveedor específico
    if not finca_id and nombre_finca_orden:
        nombre_finca = normalizar_nombre_finca(nombre_finca_orden)
        tarifas_con_finca = (
            db.query(TarifaClienteProducto)
            .filter(
                TarifaClienteProducto.comisionista_id == comisionista_id,
                TarifaClienteProducto.cliente_id == cliente_id,
                TarifaClienteProducto.producto_id == producto_id,
                TarifaClienteProducto.finca_id.isnot(None),
                TarifaClienteProducto.proveedor != "",
                TarifaClienteProducto.activo.is_(True),
            )
            .all()
        )
        for t in tarifas_con_finca:
            if t.finca and normalizar_nombre_finca(t.finca.nombre) == nombre_finca and _tarifa_aplica_para_proveedor(t):
                return t

    # 4. Buscar tarifa con finca por nombre + sin proveedor
    if not finca_id and nombre_finca_orden:
        nombre_finca = normalizar_nombre_finca(nombre_finca_orden)
        tarifas_con_finca = (
            db.query(TarifaClienteProducto)
            .filter(
                TarifaClienteProducto.comisionista_id == comisionista_id,
                TarifaClienteProducto.cliente_id == cliente_id,
                TarifaClienteProducto.producto_id == producto_id,
                TarifaClienteProducto.finca_id.isnot(None),
                TarifaClienteProducto.proveedor == "",
                TarifaClienteProducto.activo.is_(True),
            )
            .all()
        )
        for t in tarifas_con_finca:
            if t.finca and normalizar_nombre_finca(t.finca.nombre) == nombre_finca and _tarifa_aplica_para_proveedor(t):
                return t

    # 5. Sin finca (finca_id IS NULL) + proveedor específico
    tarifa = (
        db.query(TarifaClienteProducto)
        .filter(
            TarifaClienteProducto.comisionista_id == comisionista_id,
            TarifaClienteProducto.cliente_id == cliente_id,
            TarifaClienteProducto.producto_id == producto_id,
            TarifaClienteProducto.finca_id.is_(None),
            TarifaClienteProducto.proveedor != "",
            TarifaClienteProducto.activo.is_(True),
        )
        .first()
    )
    if tarifa and _tarifa_aplica_para_proveedor(tarifa):
        return tarifa

    # 6. Sin finca (finca_id IS NULL) + sin proveedor (wildcard)
    tarifa = (
        db.query(TarifaClienteProducto)
        .filter(
            TarifaClienteProducto.comisionista_id == comisionista_id,
            TarifaClienteProducto.cliente_id == cliente_id,
            TarifaClienteProducto.producto_id == producto_id,
            TarifaClienteProducto.finca_id.is_(None),
            TarifaClienteProducto.proveedor == "",
            TarifaClienteProducto.activo.is_(True),
        )
        .first()
    )
    if tarifa and _tarifa_aplica_para_proveedor(tarifa):
        return tarifa
    return None


def _calcular_comision_con_tarifa(
    orden_item: OrdenItem, tarifa: Tarifa | TarifaClienteProducto
) -> Decimal:
    """Calcula comisión usando una tarifa (global o específica)."""
    if tarifa.tipo == TipoTarifa.porcentaje:
        return orden_item.total * (tarifa.valor / Decimal("100"))
    elif tarifa.tipo == TipoTarifa.fijo_kg:
        return _cantidad_para_tarifa_kg(orden_item) * tarifa.valor
    elif tarifa.tipo == TipoTarifa.fijo_unidad:
        cantidad = orden_item.cantidad
        if (
            orden_item.producto_obj
            and orden_item.producto_obj.peso_por_unidad
            and orden_item.unidad
            and orden_item.unidad.lower() in ("kg", "litros")
        ):
            cantidad = orden_item.cantidad / orden_item.producto_obj.peso_por_unidad
        elif (
            orden_item.producto_obj
            and orden_item.producto_obj.peso_por_unidad
            and orden_item.unidad
            and orden_item.unidad.lower() not in ("kg", "libras", "litros")
        ):
            # Ya está en unidades, usar directamente
            pass
        # Si no hay peso_por_unidad, usar cantidad directa
        return cantidad * tarifa.valor
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
        return _cantidad_para_tarifa_kg(orden_item) * tarifa.valor
    elif tarifa.tipo == TipoTarifa.fijo_unidad:
        producto = orden_item.producto_obj
        cantidad = orden_item.cantidad
        if (
            producto
            and producto.peso_por_unidad
            and orden_item.unidad
            and orden_item.unidad.lower() in ("kg", "litros")
        ):
            cantidad = orden_item.cantidad / producto.peso_por_unidad
        elif (
            producto
            and producto.peso_por_unidad
            and orden_item.unidad
            and orden_item.unidad.lower() not in ("kg", "libras", "litros")
        ):
            # Ya está en unidades, usar directamente
            pass
        # Si no hay peso_por_unidad, usar cantidad directa
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
            selectinload(OrdenItem.orden),
        )
        .all()
    )

    found_ids = {oi.id for oi in orden_items}
    missing = set(orden_item_ids) - found_ids
    if missing:
        raise ValueError(f"OrdenItems no encontrados: {missing}")

    errores_estado: list[dict] = []
    orden_items_pagados: list[OrdenItem] = []
    for oi in orden_items:
        estado_orden = oi.orden.estado if oi.orden else oi.estado
        if estado_orden != EstadoOrden.pagada or oi.estado != EstadoOrden.pagada:
            errores_estado.append({
                "id": str(oi.id),
                "estado": estado_orden.value,
                "estado_item": oi.estado.value,
                "motivo": "la orden debe estar pagada para liquidarse",
            })
        else:
            orden_items_pagados.append(oi)

    if errores_estado:
        raise ValueError("Solo se pueden liquidar órdenes en estado pagada")

    if not orden_items_pagados:
        raise ValueError("Ninguno de los ítems seleccionados pertenece a una orden pagada")

    now = datetime.now()
    mes = now.strftime("%Y-%m")

    liquidacion = Liquidacion(
        nombre=nombre,
        mes=mes,
        fecha_creacion=now,
    )
    db.add(liquidacion)
    db.flush()

    for oi in orden_items_pagados:
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
                    proveedor_orden = _normalizar_texto(
                        oi.orden.proveedor if oi.orden else ""
                    )
                    for tarifa in comisionista.tarifas:
                        if tarifa.proveedores_excluidos:
                            excluidos = [
                                _normalizar_texto(p) for p in tarifa.proveedores_excluidos
                            ]
                            if proveedor_orden in excluidos:
                                continue
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

    orden_ids = {oi.orden_id for oi in orden_items_pagados if oi.orden_id is not None}
    for oi in orden_items_pagados:
        oi.estado = EstadoOrden.liquidada

    db.flush()
    for orden_id in orden_ids:
        orden = db.query(Orden).filter(Orden.id == orden_id).first()
        if orden:
            pendientes = (
                db.query(OrdenItem)
                .filter(
                    OrdenItem.orden_id == orden_id,
                    OrdenItem.estado == EstadoOrden.pagada,
                )
                .count()
            )
            orden.estado = (
                EstadoOrden.liquidada
                if pendientes == 0
                else EstadoOrden.pagada
            )

    db.commit()
    db.refresh(liquidacion)
    return liquidacion, []


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
            {OrdenItem.estado: EstadoOrden.pagada},
            synchronize_session=False,
        )

    orden_ids = [
        li.orden_id
        for li in liquidacion.items
        if li.orden_id is not None
    ]
    if orden_ids:
        db.query(Orden).filter(Orden.id.in_(orden_ids)).update(
            {Orden.estado: EstadoOrden.pagada},
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
                estado=EstadoOrden.pagada,
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
            estado=EstadoOrden.pagada,
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
