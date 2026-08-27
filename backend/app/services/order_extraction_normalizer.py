from __future__ import annotations

from datetime import date

from sqlalchemy import func, or_
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
    finca, _ = _buscar_finca_con_fuzzy(db, nombre, cliente)
    return finca


def _buscar_finca_con_fuzzy(
    db: Session, nombre: str, cliente: Cliente | None
) -> tuple[Finca | None, dict | None]:
    """Retorna (finca, info_fuzzy) donde info_fuzzy es None si fue match exacto."""
    limpio = _limpiar(nombre)
    if not limpio or limpio == "-":
        return None, None
    fincas_q = db.query(Finca)
    if cliente:
        fincas_q = fincas_q.filter(Finca.cliente_id == cliente.id)
    fincas = fincas_q.all()

    nombre_normalizado = normalizar_nombre_finca(limpio)
    coincidencias = [
        finca
        for finca in fincas
        if normalizar_nombre_finca(finca.nombre) == nombre_normalizado
    ]
    if len(coincidencias) == 1:
        return coincidencias[0], None
    if len(coincidencias) > 1:
        # Ambiguo: hay dos fincas con mismo nombre en catálogo (ej. EL MORRO en dos clientes sin cliente identificado)
        return None, None

    # Fallback difuso: corrige typos como "CALIFRONIA" → "CALIFORNIA"
    # Solo si no hubo match exacto único
    try:
        from app.services.fuzzy_matching import buscar_finca_cercana

        finca_cercana, r, _ = buscar_finca_cercana(limpio, fincas)
        if finca_cercana is not None and r >= 0.80:
            # Evitar corregir cuando el mejor sigue siendo ambiguo (dos fincas empatadas a mismo ratio)
            # Contar cuántos candidatos empatan al mejor ratio
            from app.services.fuzzy_matching import ratio as ratio_fn

            objetivo_norm = normalizar_nombre_finca(limpio) or ""
            candidatos_empatados = 0
            for f in fincas:
                rr = ratio_fn(objetivo_norm, normalizar_nombre_finca(f.nombre) or "")
                if abs(rr - r) < 1e-9:
                    candidatos_empatados += 1
            if candidatos_empatados > 1:
                return None, None
            return finca_cercana, {
                "original": limpio,
                "sugerido": finca_cercana.nombre,
                "ratio": r,
                "campo": "finca",
            }
    except Exception:
        pass
    return None, None


def _buscar_producto(db: Session, nombre: str) -> Producto | None:
    prod, _ = _buscar_producto_con_fuzzy(db, nombre)
    return prod


def _buscar_producto_con_fuzzy(db: Session, nombre: str) -> tuple[Producto | None, dict | None]:
    limpio = _limpiar(nombre)
    if not limpio:
        return None, None
    nombre_normalizado = normalizar_nombre_producto(limpio)
    # 1. Buscar por nombre exacto
    producto = db.query(Producto).filter(func.lower(Producto.nombre) == limpio.lower()).first()
    if producto:
        return producto, None
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
        return producto, None
    # 3. Buscar por alias exacto
    alias = (
        db.query(ProductoAlias)
        .filter(func.lower(ProductoAlias.alias) == limpio.lower())
        .first()
    )
    if alias:
        return alias.producto, None
    # 4. Buscar por alias normalizado
    for alias_row in db.query(ProductoAlias).all():
        if normalizar_nombre_producto(alias_row.alias) == nombre_normalizado:
            return alias_row.producto, None
    # 5. Buscar por alias contenido (el alias del producto está contenido en el texto extraído)
    alias_contenido = (
        db.query(ProductoAlias)
        .filter(func.lower(ProductoAlias.alias).in_(limpio.lower().split()))
        .first()
    )
    if alias_contenido:
        return alias_contenido.producto, None

    # 6. Fallback difuso
    try:
        from app.services.fuzzy_matching import buscar_producto_cercano

        productos = db.query(Producto).all()
        prod_cercano, r, _ = buscar_producto_cercano(limpio, productos)
        if prod_cercano is not None and r >= 0.85:
            return prod_cercano, {
                "original": limpio,
                "sugerido": prod_cercano.nombre,
                "ratio": r,
                "campo": "producto",
            }
    except Exception:
        pass
    return None, None


def _buscar_comisionistas_aplicables(
    db: Session,
    cliente: Cliente | None,
    producto: Producto | None,
    finca: Finca | None,
    proveedor: str = "",
    fecha: date | None = None,
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
    if fecha:
        # Una tarifa caducada no asigna comisionistas a órdenes posteriores.
        query = query.filter(
            or_(
                TarifaClienteProducto.vigente_hasta.is_(None),
                TarifaClienteProducto.vigente_hasta >= fecha,
            )
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
        # Guardar texto original para mensaje de corrección / problema
        finca_texto_original = item.finca or orden.finca or ""
        producto_texto_original = item.producto or ""

        finca, finca_fuzzy = _buscar_finca_con_fuzzy(db, finca_texto_original, item_cliente)
        producto, prod_fuzzy = _buscar_producto_con_fuzzy(db, producto_texto_original)

        # Advertencias por corrección difusa (preservar las que ya vienen de la glosa)
        advertencias: list[str] = list(getattr(item, "advertencias", []) or [])
        correccion = getattr(item, "correccion", None)
        if finca_fuzzy:
            pct = int(round(finca_fuzzy["ratio"] * 100))
            advertencias.append(
                f'Sector corregido automáticamente: "{finca_fuzzy["original"]}" → "{finca_fuzzy["sugerido"]}" (similitud {pct}%). Verificar.'
            )
            correccion = {
                "campo": "finca",
                "original": finca_fuzzy["original"],
                "sugerido": finca_fuzzy["sugerido"],
                "similitud": round(finca_fuzzy["ratio"], 3),
            }
        if prod_fuzzy:
            pct = int(round(prod_fuzzy["ratio"] * 100))
            advertencias.append(
                f'Producto corregido automáticamente: "{prod_fuzzy["original"]}" → "{prod_fuzzy["sugerido"]}" (similitud {pct}%).'
            )
            # si ya había corrección de finca, guardar solo la última o combinar
            if correccion is None:
                correccion = {
                    "campo": "producto",
                    "original": prod_fuzzy["original"],
                    "sugerido": prod_fuzzy["sugerido"],
                    "similitud": round(prod_fuzzy["ratio"], 3),
                }
            else:
                # múltiples correcciones: guardar lista en advertencias, correccion principal finca
                pass

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
            # El texto original se usa solo para el mensaje de error (ver _problemas_del_item).
            item.fincaId = None
            item.finca = "-"
        if producto:
            item.productoId = str(producto.id)
            item.producto = producto.nombre
        else:
            # Preservar texto original si no se resolvió
            item.producto = producto_texto_original
            item.productoId = None

        item.comisionistas = _buscar_comisionistas_aplicables(
            db,
            item_cliente or (finca.cliente if finca else None),
            producto,
            finca,
            orden.proveedor or "",
            orden.fecha,
        )
        # El problema de sector debe mostrar el texto original intentado, no "-"
        # si no hubo corrección.
        item.problemas = _problemas_del_item(
            item, item_cliente, producto, finca, finca_texto_original=finca_texto_original
        )
        item.advertencias = advertencias
        item.correccion = correccion
        # Estado derivado para columna de la vista previa
        if item.problemas:
            item.estado = "error"
        elif advertencias:
            item.estado = "advertencia"
        else:
            item.estado = "ok"

    return orden


def _problemas_del_item(
    item,
    cliente: Cliente | None,
    producto: Producto | None,
    finca: Finca | None,
    finca_texto_original: str | None = None,
) -> list[str]:
    """Por qué este ítem no se puede cargar, dicho para que la clienta lo pueda
    arreglar sola.

    Un ítem sin producto, sin cliente o sin comisionistas nunca va a generar
    comisión: entra a la base, no falla nada y el faltante recién aparece
    cuando no cuadra la liquidación. Vale más frenarlo en la vista previa
    diciendo qué hay que dar de alta.
    """
    problemas: list[str] = []

    if not producto:
        problemas.append(
            f'El producto "{item.producto}" no está registrado. '
            "Dalo de alta en Productos (o agregalo como alias de uno existente)."
        )
    if not cliente:
        problemas.append(
            "No se pudo identificar al cliente de la factura. "
            "Elegilo en el selector de arriba o dalo de alta en Clientes."
        )
    if not item.comisionistas:
        # El motivo más frecuente no es que falte la tarifa, sino que el sector
        # no se resolvió: Santa Priscila asigna comisionistas por sector.
        if cliente and cliente.fincas and not finca:
            sector_mostrado = (
                finca_texto_original
                if finca_texto_original and finca_texto_original != "-"
                else item.finca
            )
            problemas.append(
                f'No se reconoció el sector "{sector_mostrado}" entre los de {cliente.nombre}. '
                "Sin sector no se pueden asignar comisionistas."
            )
        else:
            problemas.append(
                "Ningún comisionista tiene tarifa configurada para este producto."
            )

    return problemas
