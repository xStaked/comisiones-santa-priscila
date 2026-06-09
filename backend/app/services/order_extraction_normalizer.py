from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.cliente import Cliente, Finca
from app.models.producto import Producto, ProductoAlias
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.catalog_normalization import (
    _normalizar_texto,
    normalizar_nombre_finca,
    normalizar_nombre_producto,
)
from app.services.order_extraction_models import OrdenValidada


def _limpiar(valor: str) -> str:
    return " ".join((valor or "").strip().split())


def _buscar_cliente(db: Session, nombre: str) -> Cliente | None:
    limpio = _limpiar(nombre)
    if not limpio:
        return None
    return db.query(Cliente).filter(func.lower(Cliente.nombre) == limpio.lower()).first()


def _buscar_finca(db: Session, nombre: str, cliente: Cliente | None) -> Finca | None:
    limpio = _limpiar(nombre)
    if not limpio or limpio == "-":
        return None
    fincas = db.query(Finca)
    if cliente:
        fincas = fincas.filter(Finca.cliente_id == cliente.id)

    nombre_normalizado = normalizar_nombre_finca(limpio)
    coincidencias = [
        finca
        for finca in fincas.all()
        if normalizar_nombre_finca(finca.nombre) == nombre_normalizado
    ]
    if len(coincidencias) != 1:
        return None
    return coincidencias[0]


def _buscar_producto(db: Session, nombre: str) -> Producto | None:
    limpio = _limpiar(nombre)
    if not limpio:
        return None
    nombre_normalizado = normalizar_nombre_producto(limpio)
    # 1. Buscar por nombre exacto
    producto = db.query(Producto).filter(func.lower(Producto.nombre) == limpio.lower()).first()
    if producto:
        return producto
    # 2. Buscar por nombre normalizado
    producto = next(
        (
            producto
            for producto in db.query(Producto).all()
            if normalizar_nombre_producto(producto.nombre) == nombre_normalizado
        ),
        None,
    )
    if producto:
        return producto
    # 3. Buscar por alias exacto
    alias = (
        db.query(ProductoAlias)
        .filter(func.lower(ProductoAlias.alias) == limpio.lower())
        .first()
    )
    if alias:
        return alias.producto
    # 4. Buscar por alias normalizado
    for alias_row in db.query(ProductoAlias).all():
        if normalizar_nombre_producto(alias_row.alias) == nombre_normalizado:
            return alias_row.producto
    # 5. Buscar por alias contenido (el alias del producto está contenido en el texto extraído)
    alias_contenido = (
        db.query(ProductoAlias)
        .filter(func.lower(ProductoAlias.alias).in_(limpio.lower().split()))
        .first()
    )
    if alias_contenido:
        return alias_contenido.producto
    return None


def _buscar_comisionistas_aplicables(
    db: Session,
    cliente: Cliente | None,
    producto: Producto | None,
    finca: Finca | None,
    proveedor: str = "",
) -> list[dict[str, str]]:
    if not cliente or not producto:
        return []

    proveedor_normalizado = _normalizar_texto(proveedor)

    query = db.query(TarifaClienteProducto).filter(
        TarifaClienteProducto.cliente_id == cliente.id,
        TarifaClienteProducto.producto_id == producto.id,
        TarifaClienteProducto.activo.is_(True),
    )
    if cliente.fincas:
        if not finca:
            return []
        query = query.filter(TarifaClienteProducto.finca_id == finca.id)
    else:
        query = query.filter(TarifaClienteProducto.finca_id.is_(None))

    tarifas = query.all()

    # Priorizar tarifas con proveedor específico que coincida
    comisionistas_con_prov: dict[str, bool] = {}
    comisionistas_sin_prov: dict[str, bool] = {}

    for tarifa in tarifas:
        com_id = str(tarifa.comisionista_id)
        if tarifa.proveedor:
            if _normalizar_texto(tarifa.proveedor) == proveedor_normalizado:
                comisionistas_con_prov[com_id] = True
        else:
            comisionistas_sin_prov[com_id] = True

    # Si un comisionista tiene tarifa con proveedor coincidente, usar esa.
    # Si no, usar la tarifa sin proveedor (wildcard).
    resultado: list[str] = []
    for com_id in dict.fromkeys(t.comisionista_id for t in tarifas):
        com_id_str = str(com_id)
        if com_id_str in comisionistas_con_prov:
            resultado.append(com_id_str)
        elif com_id_str in comisionistas_sin_prov:
            resultado.append(com_id_str)

    return [{"comisionistaId": cid} for cid in resultado]


def normalizar_orden_extraida(db: Session | None, orden: OrdenValidada, cliente_id: str | None = None) -> OrdenValidada:
    if db is None:
        return orden

    cliente = None
    if cliente_id:
        from uuid import UUID
        cliente = db.query(Cliente).filter(Cliente.id == UUID(cliente_id)).first()
    if not cliente:
        cliente = _buscar_cliente(db, orden.cliente)

    for item in orden.items:
        item_cliente = cliente or _buscar_cliente(db, item.clienteTexto)
        finca = _buscar_finca(db, item.finca or orden.finca, item_cliente)
        producto = _buscar_producto(db, item.producto)

        if item_cliente:
            item.clienteId = str(item_cliente.id)
        if finca:
            item.fincaId = str(finca.id)
            item.finca = finca.nombre
            if not item.clienteId:
                item.clienteId = str(finca.cliente_id)
        if producto:
            item.productoId = str(producto.id)
            item.producto = producto.nombre
        item.comisionistas = _buscar_comisionistas_aplicables(
            db,
            item_cliente or (finca.cliente if finca else None),
            producto,
            finca,
            orden.proveedor or "",
        )

    return orden
