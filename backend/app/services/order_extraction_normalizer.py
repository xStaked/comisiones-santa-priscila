from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.cliente import Cliente, ClienteAlias, Finca
from app.models.producto import Producto, ProductoAlias
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.catalog_normalization import (
    _normalizar_texto,
    es_proveedor_comodin,
    normalizar_nombre_finca,
    normalizar_nombre_producto,
    normalizar_razon_social,
)
from app.services.product_matching import obtener_productos_equivalentes
from app.services.order_extraction_models import OrdenValidada


def _limpiar(valor: str) -> str:
    return " ".join((valor or "").strip().split())


def _buscar_cliente(db: Session, nombre: str) -> Cliente | None:
    """El catálogo guarda alias cortos (FAGUILL, PLUMONT - EXPALSA) pero los PDFs
    traen la razón social completa (CAMARONERA FAGUILL S.A., PLUMONT S.A.)."""
    limpio = _limpiar(nombre)
    if not limpio:
        return None

    exacto = db.query(Cliente).filter(func.lower(Cliente.nombre) == limpio.lower()).first()
    if exacto:
        return exacto

    # El alias configurado a mano manda sobre cualquier heurística.
    alias = (
        db.query(ClienteAlias)
        .filter(func.lower(ClienteAlias.alias) == limpio.lower())
        .first()
    )
    if alias:
        return alias.cliente

    tokens = normalizar_razon_social(limpio).split()
    if not tokens:
        return None

    for alias_row in db.query(ClienteAlias).all():
        if normalizar_razon_social(alias_row.alias).split() == tokens:
            return alias_row.cliente

    clientes = db.query(Cliente).all()
    claves = {c.id: normalizar_razon_social(c.nombre).split() for c in clientes}

    misma_clave = [c for c in clientes if claves[c.id] == tokens]
    if len(misma_clave) == 1:
        return misma_clave[0]

    # El alias del catálogo aparece dentro de la razón social. Ante varios
    # candidatos gana el más largo y, a igual longitud, el que aparece más al
    # final (ASOCIACION INTEDECAM - CAMPONIO → CAMPONIO, no INTEDECAM).
    contenidos = [c for c in clientes if claves[c.id] and set(claves[c.id]) <= set(tokens)]
    if contenidos:
        return max(
            contenidos,
            key=lambda c: (len(claves[c.id]), max(tokens.index(t) for t in claves[c.id])),
        )

    # Caso inverso: el catálogo agrega un sufijo de grupo (PLUMONT → PLUMONT - EXPALSA).
    extendidos = [c for c in clientes if set(tokens) <= set(claves[c.id])]
    return extendidos[0] if len(extendidos) == 1 else None


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
    producto_ids = obtener_productos_equivalentes(db, producto)

    query = db.query(TarifaClienteProducto).filter(
        TarifaClienteProducto.cliente_id == cliente.id,
        TarifaClienteProducto.producto_id.in_(producto_ids),
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
        if es_proveedor_comodin(tarifa.proveedor):
            comisionistas_sin_prov[com_id] = True
        elif tarifa.proveedor:
            if _normalizar_texto(tarifa.proveedor) == proveedor_normalizado:
                comisionistas_con_prov[com_id] = True

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
        else:
            # El sector viene en la descripción de la factura (una dirección, p. ej.
            # "GUAYAS / DURAN / ..."). Si no coincide con un sector registrado, no lo
            # inventamos: mejor dejarlo vacío que mostrar un sector inexistente.
            item.fincaId = None
            item.finca = "-"
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
