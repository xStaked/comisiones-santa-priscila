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
    orden_normalizada = normalizar_orden_extraida(db, orden_validada)
    return _orden_validada_a_respuesta(orden_normalizada)


def _extraer_texto_pdf(contenido: bytes) -> str:
    with fitz.open(stream=contenido, filetype="pdf") as doc:
        return "\n".join(page.get_text("text") for page in doc)


def extraer_orden_de_pdf(
    contenido: bytes,
    nombre_archivo: str = "",
    db=None,
    texto_override: str | None = None,
) -> dict[str, Any]:
    """Extrae ítems de una orden de compra en formato PDF específico de DINACUAMAR."""
    texto_pdf = texto_override if texto_override is not None else _extraer_texto_pdf(contenido)
    if "FILACAS" in texto_pdf.upper() or "FECHA DE EMISIÓN" in texto_pdf.upper():
        return _extraer_con_ia(
            contenido,
            nombre_archivo=nombre_archivo,
            db=db,
            texto_override=texto_pdf,
        )

    with fitz.open(stream=contenido, filetype="pdf") as doc:
        pagina = doc[0]
        palabras = pagina.get_text("words")

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

    # 5. Extraer filas de tabla (entre Y < 690 y Y > 530)
    filas_tabla = [f for f in filas if 530 < f["y"] < 690]

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
            solo_celda = len(celdas) == 1 and 70 <= celdas[0]["x"] <= 100
            primera_celda = celdas[0] if celdas else None
            parece_finca = solo_celda or (
                len(celdas) <= 2
                and primera_celda is not None
                and 70 <= primera_celda["x"] <= 100
                and not re.match(r"^\d+$", primera_celda["text"])
                and "," not in primera_celda["text"]
            )

            if parece_finca:
                nombre = " ".join(c["text"] for c in celdas).strip()
                if (
                    nombre
                    and len(nombre) > 1
                    and "PEDIDO" not in nombre
                    and "DESCRIPCION" not in nombre
                    and "CANTIDAD" not in nombre
                    and "MEDIDA" not in nombre
                    and "PREC" not in nombre
                    and "DESC" not in nombre
                    and "TOTAL" not in nombre
                    and not re.match(r"^\d+(\.\d+)?$", nombre)
                ):
                    fincas.append({"y": fila["y"], "nombre": nombre})

    # 9. Asignar fincas a ítems
    orden_items: list[dict[str, Any]] = []
    for item in items_crudos:
        finca = "-"

        # Preferir finca ARRIBA (y mayor, diff <= 16)
        min_diff = float("inf")
        finca_arriba = None
        for f in fincas:
            diff = f["y"] - item["y"]
            if 0 < diff <= 16 and diff < min_diff:
                min_diff = diff
                finca_arriba = f

        if finca_arriba:
            finca = finca_arriba["nombre"]
        else:
            # Fallback: finca ABAJO (diff <= 14)
            min_diff = float("inf")
            finca_abajo = None
            for f in fincas:
                diff = item["y"] - f["y"]
                if 0 < diff <= 14 and diff < min_diff:
                    min_diff = diff
                    finca_abajo = f
            if finca_abajo:
                finca = finca_abajo["nombre"]

        # Intentar vincular finca con base de datos
        finca_id = None
        cliente_id = None
        if db and finca and finca != "-":
            from app.models.cliente import Finca
            finca_db = db.query(Finca).filter(Finca.nombre.ilike(finca)).first()
            if finca_db:
                finca_id = str(finca_db.id)
                cliente_id = str(finca_db.cliente_id)

        orden_items.append({
            "fecha": date.fromisoformat(fecha),
            "numeroOrden": numero_orden or f"OC-{fecha}",
            "finca": finca,
            "fincaId": finca_id,
            "clienteId": cliente_id,
            "producto": item["producto"],
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
