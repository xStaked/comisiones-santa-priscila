import re
from datetime import date
from decimal import Decimal
from typing import Any

import fitz

from app.config import settings
from app.services.ai_extractor import obtener_extractor_ia
from app.services.order_extraction_models import EntradaExtraccion, OrdenValidada
from app.services.order_extraction_normalizer import normalizar_orden_extraida
from app.services.order_extraction_validator import validar_orden_extraida


def obtener_extractor_configurado():
    provider = "openai" if settings.AI_EXTRACTION_ENABLED else "disabled"
    return obtener_extractor_ia(
        provider=provider,
        api_key=settings.OPENAI_API_KEY,
        model=settings.OPENAI_EXTRACTION_MODEL,
    )


def _orden_validada_a_respuesta(orden: OrdenValidada) -> dict[str, Any]:
    return {
        "fecha": orden.fecha,
        "numeroOrden": orden.numeroOrden,
        "proveedor": orden.proveedor,
        "semana": orden.semana,
        "items": [
            {
                "fecha": item.fecha,
                "numeroOrden": item.numeroOrden,
                "finca": item.finca,
                "fincaId": item.fincaId,
                "clienteId": item.clienteId,
                "productoId": item.productoId,
                "producto": item.producto,
                "cantidad": item.cantidad,
                "unidad": item.unidad,
                "precioUnitario": item.precioUnitario,
                "total": item.total,
                "comisionistas": [],
            }
            for item in orden.items
        ],
    }


def _extraer_con_ia(
    contenido: bytes,
    nombre_archivo: str,
    db=None,
    texto_override: str | None = None,
    cliente_id: str | None = None,
) -> dict[str, Any]:
    texto = texto_override if texto_override is not None else _extraer_texto_pdf(contenido)
    extractor = obtener_extractor_configurado()
    orden_ia = extractor.extraer_orden(
        EntradaExtraccion(
            nombre_archivo=nombre_archivo,
            content_type="application/pdf",
            texto=texto,
        )
    )
    orden_validada = validar_orden_extraida(orden_ia)
    orden_normalizada = normalizar_orden_extraida(db, orden_validada, cliente_id=cliente_id)
    return _orden_validada_a_respuesta(orden_normalizada)


def _extraer_texto_pdf(contenido: bytes) -> str:
    with fitz.open(stream=contenido, filetype="pdf") as doc:
        return "\n".join(page.get_text("text") for page in doc)


def _debe_usar_extraccion_ia(texto_pdf: str) -> bool:
    texto = texto_pdf.upper()
    return (
        "FILACAS" in texto
        or "FECHA DE EMISIÓN" in texto
    )


def _es_formato_santa_priscila(texto_pdf: str) -> bool:
    """Detecta si el PDF es de formato Santa Priscila (emisor),
    no si es una orden DINACUAMAR donde Santa Priscila es proveedor."""
    texto = texto_pdf.upper()
    if "INDUSTRIAL PESQUERA SANTA PRISCILA" not in texto:
        return False
    # Si tiene el encabezado típico de orden DINACUAMAR, es una orden
    # emitida por DINACUAMAR donde Santa Priscila es el proveedor.
    if "ORDEN DE COMPRA" in texto and "PROVEEDOR :" in texto:
        return False
    return True


def _texto_en_rango(celdas: list[dict[str, Any]], x_min: int, x_max: int) -> str:
    return " ".join(c["text"] for c in celdas if x_min <= c["x"] <= x_max).strip()


def _celda_decimal_en_rango(
    celdas: list[dict[str, Any]], x_min: int, x_max: int
) -> dict[str, Any] | None:
    return next(
        (
            c
            for c in celdas
            if x_min <= c["x"] <= x_max
            and re.match(r"^[\d,]+\.\d+$", c["text"].replace(",", ""))
        ),
        None,
    )


def _extraer_items_santa_priscila_desde_filas(
    filas: list[dict[str, Any]], semana: str
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    finca_actual = "-"

    for fila in sorted(filas, key=lambda f: f["y"]):
        celdas = fila["cells"]
        if not celdas:
            continue

        pedido = next(
            (c for c in celdas if 70 <= c["x"] <= 85 and re.match(r"^\d+$", c["text"])),
            None,
        )
        precio_celda = _celda_decimal_en_rango(celdas, 270, 292)
        cantidad_celda = _celda_decimal_en_rango(celdas, 365, 390)
        total_celda = _celda_decimal_en_rango(celdas, 490, 515)

        if pedido and precio_celda and cantidad_celda and total_celda:
            producto = _texto_en_rango(celdas, 110, 270)
            unidad_texto = _texto_en_rango(celdas, 300, 365)
            items.append(
                {
                    "codigo": pedido["text"],
                    "semana": semana,
                    "finca": finca_actual,
                    "producto": producto,
                    "cantidad": Decimal(cantidad_celda["text"].replace(",", "")),
                    "descripcion": unidad_texto or producto,
                    "precioUnitario": Decimal(precio_celda["text"].replace(",", "")),
                    "total": Decimal(total_celda["text"].replace(",", "")),
                    "unidad": inferir_unidad(unidad_texto),
                }
            )
            continue

        texto_fila = " ".join(c["text"] for c in celdas).strip()
        tiene_decimal = any(
            re.match(r"^[\d,]+\.\d+$", c["text"])
            for c in celdas[1:]
        )
        es_finca = (
            texto_fila
            and len(celdas) <= 3
            and 70 <= celdas[0]["x"] <= 120
            and not re.match(r"^\d", texto_fila)
            and not tiene_decimal
            and "SUB-TOTAL" not in texto_fila.upper()
            and "OBSERVACIONES" not in texto_fila.upper()
            and "TOTAL" not in texto_fila.upper()
            and "R.U.C." not in texto_fila.upper()
        )
        if es_finca:
            finca_actual = texto_fila

    return items


def _buscar_producto_en_db(db, nombre: str) -> tuple[Any | None, str]:
    """Busca un producto en la DB por nombre o alias."""
    from sqlalchemy import func
    from app.models.producto import Producto, ProductoAlias

    limpio = " ".join((nombre or "").strip().split())
    if not limpio or db is None:
        return None, nombre

    # 1. Por nombre exacto
    producto = db.query(Producto).filter(func.lower(Producto.nombre) == limpio.lower()).first()
    if producto:
        return producto, producto.nombre

    # 2. Por alias exacto
    alias = db.query(ProductoAlias).filter(func.lower(ProductoAlias.alias) == limpio.lower()).first()
    if alias:
        return alias.producto, alias.producto.nombre

    # 3. Por alias contenido (alguna palabra del texto coincide con un alias)
    palabras = limpio.lower().split()
    alias_contenido = db.query(ProductoAlias).filter(func.lower(ProductoAlias.alias).in_(palabras)).first()
    if alias_contenido:
        return alias_contenido.producto, alias_contenido.producto.nombre

    return None, nombre


def extraer_orden_de_pdf(
    contenido: bytes,
    nombre_archivo: str = "",
    db=None,
    texto_override: str | None = None,
    cliente_id: str | None = None,
) -> dict[str, Any]:
    """Extrae ítems de una orden de compra en formato PDF específico de DINACUAMAR."""
    texto_pdf = texto_override if texto_override is not None else _extraer_texto_pdf(contenido)
    usar_ia = _debe_usar_extraccion_ia(texto_pdf)
    es_santa_priscila = _es_formato_santa_priscila(texto_pdf)

    if usar_ia and not es_santa_priscila:
        return _extraer_con_ia(
            contenido,
            nombre_archivo=nombre_archivo,
            db=db,
            texto_override=texto_pdf,
            cliente_id=cliente_id,
        )

    try:
        with fitz.open(stream=contenido, filetype="pdf") as doc:
            pagina = doc[0]
            palabras = pagina.get_text("words")
    except Exception:
        if usar_ia:
            return _extraer_con_ia(
                contenido,
                nombre_archivo=nombre_archivo,
                db=db,
                texto_override=texto_pdf,
                cliente_id=cliente_id,
            )
        raise

    # 1. Extraer palabras con posiciones (x, y)
    items: list[dict[str, Any]] = []
    for w in palabras:
        x0, y0, x1, y1, texto, *_ = w
        if not texto or not texto.strip():
            continue
        items.append({
            "text": texto.strip(),
            "x": round(x0),
            "y": round(y1),
        })

    # 2. Agrupar por filas (tolerancia Y de 4 unidades)
    items.sort(key=lambda a: (-a["y"], a["x"]))
    filas: list[dict[str, Any]] = []
    fila_actual: list[dict[str, Any]] = []
    y_actual: int | None = None

    for item in items:
        if y_actual is None or abs(item["y"] - y_actual) <= 4:
            fila_actual.append(item)
            y_actual = item["y"]
        else:
            filas.append({"y": y_actual, "cells": sorted(fila_actual, key=lambda c: c["x"])})
            fila_actual = [item]
            y_actual = item["y"]
    if fila_actual:
        filas.append({"y": y_actual, "cells": sorted(fila_actual, key=lambda c: c["x"])})

    # 3. Extraer encabezado
    fecha = ""
    numero_orden = ""
    proveedor = ""
    semana = ""

    meses = {
        "enero": "01",
        "febrero": "02",
        "marzo": "03",
        "abril": "04",
        "mayo": "05",
        "junio": "06",
        "julio": "07",
        "agosto": "08",
        "septiembre": "09",
        "octubre": "10",
        "noviembre": "11",
        "diciembre": "12",
    }

    for fila in filas:
        linea = " ".join(c["text"] for c in fila["cells"])
        if not fecha and re.search(r"\d{1,2}\s+de\s+\w+\s+de\s+\d{4}", linea):
            match = re.search(r"(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})", linea)
            if match:
                fecha = f"{match.group(3)}-{meses.get(match.group(2).lower(), '01')}-{match.group(1).zfill(2)}"
        if "ORDEN DE COMPRA No." in linea:
            match = re.search(r"ORDEN DE COMPRA No\.\s+(\d+)", linea)
            if match:
                numero_orden = match.group(1)
        if "PROVEEDOR :" in linea:
            match = re.search(r"PROVEEDOR :\s+(.+?)(?:\s+CREDITO|$)", linea)
            if match:
                proveedor = match.group(1).strip()
        if "SEMANA :" in linea:
            match = re.search(r"SEMANA :\s+(\d+)", linea)
            if match:
                semana = match.group(1)

    # 10/11. Fallback fecha desde nombre de archivo o hoy
    if not fecha:
        match = re.search(r"(\d{4})[-_](\d{2})[-_](\d{2})", nombre_archivo)
        if match:
            fecha = f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
        else:
            fecha = date.today().isoformat()

    if es_santa_priscila:
        items_santa_priscila = _extraer_items_santa_priscila_desde_filas(filas, semana)
        if items_santa_priscila:
            orden_items = []
            for item in items_santa_priscila:
                finca = item["finca"] or "-"
                finca_id = None
                cliente_id_item = cliente_id
                producto_id = None
                producto = item["producto"]
                if db:
                    from app.models.cliente import Finca
                    from app.models.producto import Producto

                    query_finca = db.query(Finca).filter(Finca.nombre.ilike(finca))
                    if cliente_id:
                        from uuid import UUID
                        query_finca = query_finca.filter(Finca.cliente_id == UUID(cliente_id))
                    finca_db = query_finca.first()
                    if finca_db:
                        finca_id = str(finca_db.id)
                        cliente_id_item = str(finca_db.cliente_id)
                    producto_db = db.query(Producto).filter(Producto.nombre.ilike(producto)).first()
                    if producto_db:
                        producto_id = str(producto_db.id)
                        producto = producto_db.nombre

                orden_items.append(
                    {
                        "fecha": date.fromisoformat(fecha),
                        "numeroOrden": numero_orden or f"OC-{fecha}",
                        "finca": finca,
                        "fincaId": finca_id,
                        "clienteId": cliente_id_item,
                        "productoId": producto_id,
                        "producto": producto,
                        "cantidad": item["cantidad"],
                        "unidad": item["unidad"],
                        "precioUnitario": item["precioUnitario"],
                        "total": item["total"],
                        "comisionistas": [],
                    }
                )

            return {
                "fecha": date.fromisoformat(fecha),
                "numeroOrden": numero_orden or f"OC-{fecha}",
                "proveedor": proveedor or "",
                "semana": semana,
                "items": orden_items,
            }

    if usar_ia:
        return _extraer_con_ia(
            contenido,
            nombre_archivo=nombre_archivo,
            db=db,
            texto_override=texto_pdf,
            cliente_id=cliente_id,
        )

    # 5. Extraer filas de tabla
    # Detectar dinámicamente la zona de la tabla buscando el encabezado y el fin
    y_encabezado = None
    y_fin = None
    for fila in filas:
        texto_fila = " ".join(c["text"] for c in fila["cells"]).upper()
        if (
            y_encabezado is None
            and ("DESCRIPCION" in texto_fila or "DESCRIPCIÓN" in texto_fila)
            and ("CANTIDAD" in texto_fila or "PREC." in texto_fila)
        ):
            y_encabezado = fila["y"]
        if y_encabezado is not None and (
            "SUB-TOTAL" in texto_fila
            or "SUBTOTAL" in texto_fila
            or ("TOTAL" in texto_fila and ("BASE" in texto_fila or "IVA" in texto_fila))
        ):
            y_fin = fila["y"]
            break

    if y_encabezado is not None and y_fin is not None:
        filas_tabla = [f for f in filas if y_encabezado < f["y"] < y_fin]
    else:
        # Fallback al rango Y estándar para órdenes DINACUAMAR tradicionales
        filas_tabla = [f for f in filas if 100 < f["y"] < 700]

    fincas: list[dict[str, Any]] = []
    items_crudos: list[dict[str, Any]] = []

    for fila in filas_tabla:
        celdas = fila["cells"]

        # 6. Detectar fila de ítem por cantidad, precio y total en rangos X esperados
        cantidad_celda = next(
            (
                c
                for c in celdas
                if 270 <= c["x"] <= 300
                and re.match(r"^[\d,]+\.\d+$", c["text"].replace(",", ""))
            ),
            None,
        )
        precio_celda = next(
            (
                c
                for c in celdas
                if 365 <= c["x"] <= 395
                and re.match(r"^[\d,]+\.\d+$", c["text"].replace(",", ""))
            ),
            None,
        )
        total_celda = next(
            (
                c
                for c in celdas
                if 485 <= c["x"] <= 510
                and re.match(r"^[\d,]+\.\d+$", c["text"].replace(",", ""))
            ),
            None,
        )

        es_fila_item = cantidad_celda is not None and precio_celda is not None and total_celda is not None

        if es_fila_item:
            # 7. producto, descripcion, codigo
            celdas_producto = [c for c in celdas if 110 <= c["x"] < 270]
            producto = " ".join(c["text"] for c in celdas_producto).strip()

            celdas_desc = [c for c in celdas if 300 <= c["x"] < 365]
            descripcion = " ".join(c["text"] for c in celdas_desc).strip()

            codigo_celda = next(
                (c for c in celdas if 70 <= c["x"] <= 100 and re.match(r"^\d+$", c["text"])),
                None,
            )

            items_crudos.append({
                "y": fila["y"],
                "codigo": codigo_celda["text"] if codigo_celda else "",
                "semana": semana,
                "producto": producto or descripcion,
                "cantidad": Decimal(cantidad_celda["text"].replace(",", "")),
                "descripcion": descripcion or producto,
                "precioUnitario": Decimal(precio_celda["text"].replace(",", "")),
                "total": Decimal(total_celda["text"].replace(",", "")),
            })
        else:
            # 8. Detectar fila de finca
            # Como ya sabemos que NO es item, si no tiene decimales y empieza
            # en la zona izquierda, es probablemente una finca.
            tiene_decimal = any(
                re.match(r"^[\d,]+\.\d+$", c["text"].replace(",", ""))
                for c in celdas
            )
            primera_celda = celdas[0] if celdas else None
            parece_finca = (
                not tiene_decimal
                and primera_celda is not None
                and 70 <= primera_celda["x"] <= 130
                and not re.match(r"^\d+$", primera_celda["text"])
            )

            if parece_finca:
                nombre = " ".join(c["text"] for c in celdas).strip()
                if (
                    nombre
                    and len(nombre) > 1
                    and "PEDIDO" not in nombre.upper()
                    and "DESCRIPCION" not in nombre.upper()
                    and "DESCRIPCIÓN" not in nombre.upper()
                    and "CANTIDAD" not in nombre.upper()
                    and "MEDIDA" not in nombre.upper()
                    and "PREC" not in nombre.upper()
                    and "DESC" not in nombre.upper()
                    and "TOTAL" not in nombre.upper()
                    and "SUB-TOTAL" not in nombre.upper()
                    and "OBSERVACIONES" not in nombre.upper()
                    and not re.match(r"^\d+(\.\d+)?$", nombre)
                ):
                    fincas.append({"y": fila["y"], "nombre": nombre})

    # 9. Asignar fincas a ítems
    # Buscar la finca más cercana en cualquier dirección (hasta 25 unidades).
    # En caso de empate, preferir la finca que esté más arriba (menor Y).
    orden_items: list[dict[str, Any]] = []
    for item in items_crudos:
        finca = "-"
        min_diff = float("inf")
        finca_cercana = None
        for f in fincas:
            diff = abs(f["y"] - item["y"])
            if diff <= 25:
                if (
                    finca_cercana is None
                    or diff < min_diff
                    or (diff == min_diff and f["y"] < finca_cercana["y"])
                ):
                    min_diff = diff
                    finca_cercana = f

        if finca_cercana:
            finca = finca_cercana["nombre"]

        # Intentar vincular finca con base de datos
        finca_id = None
        cliente_id = None
        if db and finca and finca != "-":
            from app.models.cliente import Finca
            finca_db = db.query(Finca).filter(Finca.nombre.ilike(finca)).first()
            if finca_db:
                finca_id = str(finca_db.id)
                cliente_id = str(finca_db.cliente_id)

        # Buscar producto en DB por nombre o alias
        producto_id = None
        producto_nombre = item["producto"]
        if db:
            prod_db, prod_nombre = _buscar_producto_en_db(db, producto_nombre)
            if prod_db:
                producto_id = str(prod_db.id)
                producto_nombre = prod_nombre

        orden_items.append({
            "fecha": date.fromisoformat(fecha),
            "numeroOrden": numero_orden or f"OC-{fecha}",
            "finca": finca,
            "fincaId": finca_id,
            "clienteId": cliente_id,
            "producto": producto_nombre,
            "productoId": producto_id,
            "cantidad": item["cantidad"],
            "unidad": inferir_unidad(item["descripcion"]),
            "precioUnitario": item["precioUnitario"],
            "total": item["total"],
            "comisionistas": [],
        })

    return {
        "fecha": date.fromisoformat(fecha),
        "numeroOrden": numero_orden or f"OC-{fecha}",
        "proveedor": proveedor or "",
        "semana": semana,
        "items": orden_items,
    }


def inferir_unidad(descripcion: str) -> str:
    """Infiere la unidad de medida a partir de la descripción del producto."""
    lower = descripcion.lower()
    if "kg" in lower:
        return "kg"
    if "litros" in lower or "lts" in lower:
        return "litros"
    if "galon" in lower or "galón" in lower:
        return "galones"
    if "caneca" in lower:
        return "canecas"
    if "saco" in lower:
        return "sacos"
    if "tacho" in lower:
        return "tachos"
    if "caja" in lower:
        return "cajas"
    if "unidad" in lower:
        return "unidades"
    return "unidades"
