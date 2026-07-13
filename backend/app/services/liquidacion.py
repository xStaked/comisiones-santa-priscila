from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.cliente import Finca
from app.models.comisionista import Tarifa, TipoTarifa
from app.models.liquidacion import Liquidacion, LiquidacionItem, LiquidacionItemTarifa
from app.models.orden import Asignacion, EstadoOrden, Orden, OrdenItem
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.catalog_normalization import (
    _normalizar_texto,
    es_proveedor_comodin,
    normalizar_nombre_finca,
    normalizar_nombre_producto,
)
from app.services.product_matching import obtener_productos_equivalentes

# Kilos que contiene cada envase cuando el producto no lo define.
# 1 litro ≈ 1 kg, así que kg, litros y unidades sueltas comparten factor 1.
KG_POR_TACHO = Decimal("10")
KG_POR_SACO = Decimal("25")
KG_POR_CANECA = Decimal("20")

ENVASES = ("tacho", "saco", "caneca")


def _es_envase(unidad: str) -> bool:
    return any(envase in unidad for envase in ENVASES)


def _kg_por_envase(orden_item: OrdenItem) -> Decimal:
    """Kilos que contiene un envase del ítem.

    La unidad del documento manda. Las facturas vienen en kg (no nombran el
    envase), así que ahí el envase lo define el producto.
    """
    producto = orden_item.producto_obj
    unidad = orden_item.unidad.lower() if orden_item.unidad else ""

    if not _es_envase(unidad):
        unidad = (
            producto.unidad_comision.lower()
            if producto and producto.unidad_comision
            else ""
        )

    if "tacho" in unidad:
        return producto.tacho_kilos if producto and producto.tacho_kilos else KG_POR_TACHO
    if "saco" in unidad:
        return producto.saco_kilos if producto and producto.saco_kilos else KG_POR_SACO
    if "caneca" in unidad:
        return KG_POR_CANECA
    return Decimal("1")


def _cantidad_para_tarifa_kg(orden_item: OrdenItem) -> Decimal:
    """Cantidad del ítem en kilos: la unidad en la que se expresa una tarifa fijo_kg.

    Las órdenes de compra traen la cantidad en envases (63 tachos); las facturas
    la traen ya en kilos (630 kg).
    """
    if _es_envase(orden_item.unidad.lower() if orden_item.unidad else ""):
        return orden_item.cantidad * _kg_por_envase(orden_item)
    return orden_item.cantidad


def _cantidad_para_tarifa_unidad(orden_item: OrdenItem) -> Decimal:
    """Cantidad del ítem en envases: la unidad en la que se expresa una tarifa
    fijo_unidad ($/saco de CALCINIT, $/tacho de NATUXTRACT, $/litro de MORTAL).
    """
    if _es_envase(orden_item.unidad.lower() if orden_item.unidad else ""):
        return orden_item.cantidad
    return orden_item.cantidad / _kg_por_envase(orden_item)


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

    producto_obj = next((p for p in db.query(Producto).all() if p.id == producto_id), None)
    producto_ids = (
        obtener_productos_equivalentes(db, producto_obj)
        if producto_obj
        else [str(producto_id)]
    )

    def _tarifa_aplica_para_proveedor(tarifa: TarifaClienteProducto) -> bool:
        # 1. Si tiene proveedores excluidos y el proveedor de la orden está en la lista, NO aplica
        if tarifa.proveedores_excluidos:
            excluidos = [_normalizar_texto(p) for p in tarifa.proveedores_excluidos]
            if proveedor_orden in excluidos:
                return False
        if es_proveedor_comodin(tarifa.proveedor):
            return True
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
                TarifaClienteProducto.producto_id.in_(producto_ids),
                TarifaClienteProducto.finca_id == finca_id,
                ~or_(
                    TarifaClienteProducto.proveedor == "",
                    func.upper(TarifaClienteProducto.proveedor) == "CUALQUIER PROVEEDOR",
                ),
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
                TarifaClienteProducto.producto_id.in_(producto_ids),
                TarifaClienteProducto.finca_id == finca_id,
                or_(
                    TarifaClienteProducto.proveedor == "",
                    func.upper(TarifaClienteProducto.proveedor) == "CUALQUIER PROVEEDOR",
                ),
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
                TarifaClienteProducto.producto_id.in_(producto_ids),
                TarifaClienteProducto.finca_id.isnot(None),
                ~or_(
                    TarifaClienteProducto.proveedor == "",
                    func.upper(TarifaClienteProducto.proveedor) == "CUALQUIER PROVEEDOR",
                ),
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
                TarifaClienteProducto.producto_id.in_(producto_ids),
                TarifaClienteProducto.finca_id.isnot(None),
                or_(
                    TarifaClienteProducto.proveedor == "",
                    func.upper(TarifaClienteProducto.proveedor) == "CUALQUIER PROVEEDOR",
                ),
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
            TarifaClienteProducto.producto_id.in_(producto_ids),
            TarifaClienteProducto.finca_id.is_(None),
            ~or_(
                TarifaClienteProducto.proveedor == "",
                func.upper(TarifaClienteProducto.proveedor) == "CUALQUIER PROVEEDOR",
            ),
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
            TarifaClienteProducto.producto_id.in_(producto_ids),
            TarifaClienteProducto.finca_id.is_(None),
            or_(
                TarifaClienteProducto.proveedor == "",
                func.upper(TarifaClienteProducto.proveedor) == "CUALQUIER PROVEEDOR",
            ),
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
        return _cantidad_para_tarifa_unidad(orden_item) * tarifa.valor
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
    """Calcula comisión con tarifa específica. Igual que la global salvo que el
    porcentaje se aplica sobre el total menos la retención del cliente."""
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
        return _cantidad_para_tarifa_unidad(orden_item) * tarifa.valor
    return Decimal("0")


def _comision_con_umbral(
    orden_item: OrdenItem,
    tarifa: Tarifa | TarifaClienteProducto,
    kg_acumulado: Decimal,
) -> tuple[str, Decimal, Decimal] | None:
    """Regla por volumen: si el comisionista acumula >= umbral_kg en la liquidación,
    la comisión del ítem se paga como fijo_kg con valor_sobre_umbral.

    Devuelve (tipo_snapshot, valor_snapshot, comision) o None si no aplica.
    Debe mantenerse en paridad con comisionConUmbral() de src/lib/export-utils.ts.
    """
    if tarifa.umbral_kg is None or tarifa.valor_sobre_umbral is None:
        return None
    if kg_acumulado < tarifa.umbral_kg:
        return None
    comision = _cantidad_para_tarifa_kg(orden_item) * tarifa.valor_sobre_umbral
    return (TipoTarifa.fijo_kg.value, tarifa.valor_sobre_umbral, comision)


def crear_liquidacion(
    db: Session,
    nombre: str,
    orden_item_ids: list[UUID],
    comisionista_ids: list[UUID] | None = None,
) -> tuple[Liquidacion, list[dict]]:
    """Liquida las asignaciones pendientes de los ítems indicados.

    La liquidación es POR PERSONA: si `comisionista_ids` viene, solo se liquidan
    las asignaciones de esos comisionistas. El resto queda pendiente y el ítem
    sigue en estado `pagada` hasta que todas sus asignaciones estén liquidadas.
    """
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

    filtro = set(comisionista_ids) if comisionista_ids else None

    def _pendientes(oi: OrdenItem) -> list[Asignacion]:
        return [
            a
            for a in oi.asignaciones
            if a.liquidacion_id is None
            and (filtro is None or a.comisionista_id in filtro)
        ]

    # Sin filtro por persona, un ítem sin asignaciones también se liquida (comisión 0).
    orden_items_pagados = [
        oi
        for oi in orden_items_pagados
        if _pendientes(oi) or (filtro is None and not oi.asignaciones)
    ]
    if not orden_items_pagados:
        raise ValueError(
            "No hay comisionistas pendientes de liquidar en los ítems seleccionados"
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

    # Volumen acumulado por comisionista dentro de ESTA liquidación (regla por umbral).
    kg_por_comisionista: dict[UUID, Decimal] = {}
    for oi in orden_items_pagados:
        for asignacion in _pendientes(oi):
            cid = asignacion.comisionista_id
            kg_por_comisionista[cid] = (
                kg_por_comisionista.get(cid, Decimal("0")) + _cantidad_para_tarifa_kg(oi)
            )

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

        for asignacion in _pendientes(oi):
            asignacion.liquidacion_id = liquidacion.id
            comisionista = asignacion.comisionista
            tarifa_esp = _buscar_tarifa_especifica(db, oi, comisionista.id)

            if tarifa_esp:
                umbral = _comision_con_umbral(
                    oi, tarifa_esp, kg_por_comisionista.get(comisionista.id, Decimal("0"))
                )
                if umbral:
                    tipo_snapshot, valor_snapshot, comision = umbral
                else:
                    comision = _calcular_comision_especifica(db, oi, tarifa_esp)
                    tipo_snapshot = tarifa_esp.tipo.value
                    valor_snapshot = tarifa_esp.valor
                lit = LiquidacionItemTarifa(
                    liquidacion_item_id=li.id,
                    comisionista_id=comisionista.id,
                    comisionista_nombre_snapshot=comisionista.nombre,
                    tipo_snapshot=tipo_snapshot,
                    valor_snapshot=valor_snapshot,
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
                        umbral = _comision_con_umbral(
                            oi, tarifa, kg_por_comisionista.get(comisionista.id, Decimal("0"))
                        )
                        if umbral:
                            tipo_snapshot, valor_snapshot, comision = umbral
                        else:
                            comision = _calcular_comision_con_tarifa(oi, tarifa)
                            tipo_snapshot = tarifa.tipo.value
                            valor_snapshot = tarifa.valor
                        lit = LiquidacionItemTarifa(
                            liquidacion_item_id=li.id,
                            comisionista_id=comisionista.id,
                            comisionista_nombre_snapshot=comisionista.nombre,
                            tipo_snapshot=tipo_snapshot,
                            valor_snapshot=valor_snapshot,
                            comision_calculada=comision,
                        )
                        db.add(lit)

    orden_ids = {oi.orden_id for oi in orden_items_pagados if oi.orden_id is not None}
    for oi in orden_items_pagados:
        # El ítem solo queda liquidado cuando TODAS sus asignaciones lo están.
        if all(a.liquidacion_id is not None for a in oi.asignaciones):
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

    # Devuelve las asignaciones de esta liquidación al estado pendiente.
    db.query(Asignacion).filter(Asignacion.liquidacion_id == liquidacion_id).update(
        {Asignacion.liquidacion_id: None}, synchronize_session=False
    )

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

    db.query(Asignacion).filter(Asignacion.liquidacion_id == liquidacion_id).update(
        {Asignacion.liquidacion_id: None}, synchronize_session=False
    )

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
