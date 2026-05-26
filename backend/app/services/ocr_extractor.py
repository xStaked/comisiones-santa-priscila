import base64
import io
import re
from datetime import date
from decimal import Decimal
from typing import Any

import numpy as np
from PIL import Image, ImageEnhance

from app.config import settings
from app.services.order_extraction_models import EntradaExtraccion
from app.services.order_extraction_normalizer import normalizar_orden_extraida
from app.services.order_extraction_validator import validar_orden_extraida
from app.services.pdf_extractor import _orden_validada_a_respuesta, obtener_extractor_configurado

_reader = None


def _obtener_reader():
    """Inicializa y retorna el lector de EasyOCR (lazy singleton)."""
    global _reader
    if _reader is None:
        try:
            import easyocr
        except ImportError as exc:
            raise RuntimeError("EasyOCR no está instalado") from exc
        _reader = easyocr.Reader(["es", "en"], gpu=False)
    return _reader


def _preprocesar_imagen(contenido: bytes) -> np.ndarray:
    """Convierte a escala de grises, redimensiona si es muy grande y aumenta contraste."""
    img = Image.open(io.BytesIO(contenido))

    # Asegurar modo RGB/L antes de procesar
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    img = img.convert("L")

    max_dim = 2000
    if max(img.size) > max_dim:
        ratio = max_dim / max(img.size)
        nuevo_tamano = (int(img.width * ratio), int(img.height * ratio))
        img = img.resize(nuevo_tamano, Image.Resampling.LANCZOS)

    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(2.0)

    return np.array(img)


def extraer_orden_de_imagen(
    contenido: bytes,
    nombre_archivo: str = "",
    db=None,
    cliente_id: str | None = None,
) -> dict[str, Any]:
    """Extrae ítems de una orden de compra a partir de una imagen usando OCR."""
    if settings.AI_EXTRACTION_ENABLED:
        extractor = obtener_extractor_configurado()
        imagen_base64 = base64.b64encode(contenido).decode("ascii")
        orden_ia = extractor.extraer_orden(
            EntradaExtraccion(
                nombre_archivo=nombre_archivo,
                content_type="image",
                imagenes_base64=[imagen_base64],
            )
        )
        orden_validada = validar_orden_extraida(orden_ia)
        orden_normalizada = normalizar_orden_extraida(db, orden_validada, cliente_id=cliente_id)
        return _orden_validada_a_respuesta(orden_normalizada)

    reader = _obtener_reader()
    img_array = _preprocesar_imagen(contenido)
    resultados = reader.readtext(img_array)

    # Convertir resultados OCR a estructura con posiciones
    palabras = []
    for bbox, texto, _confianza in resultados:
        if not texto or not texto.strip():
            continue
        x1, y1 = bbox[0]
        x2, y2 = bbox[2]
        palabras.append({
            "text": texto.strip(),
            "x": round((x1 + x2) / 2),
            "y": round(max(y1, y2)),
        })

    # Agrupar por filas (tolerancia Y de 15 píxeles)
    palabras.sort(key=lambda a: (a["y"], a["x"]))
    filas: list[dict[str, Any]] = []
    fila_actual: list[dict[str, Any]] = []
    y_actual: int | None = None

    for palabra in palabras:
        if y_actual is None or abs(palabra["y"] - y_actual) <= 15:
            fila_actual.append(palabra)
            y_actual = palabra["y"]
        else:
            filas.append({"y": y_actual, "cells": sorted(fila_actual, key=lambda c: c["x"])})
            fila_actual = [palabra]
            y_actual = palabra["y"]
    if fila_actual:
        filas.append({"y": y_actual, "cells": sorted(fila_actual, key=lambda c: c["x"])})

    # Extraer encabezado
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
        if not numero_orden and re.search(r"ORDEN DE COMPRA", linea, re.IGNORECASE):
            match = re.search(r"ORDEN DE COMPRA No\.?\s*(\d+)", linea, re.IGNORECASE)
            if match:
                numero_orden = match.group(1)
        if not proveedor and re.search(r"PROVEEDOR", linea, re.IGNORECASE):
            match = re.search(r"PROVEEDOR\s*:?\s+(.+?)(?:\s+CREDITO|$)", linea, re.IGNORECASE)
            if match:
                proveedor = match.group(1).strip()
        if not semana and re.search(r"SEMANA", linea, re.IGNORECASE):
            match = re.search(r"SEMANA\s*:?\s*(\d+)", linea, re.IGNORECASE)
            if match:
                semana = match.group(1)

    # Fallback fecha desde nombre de archivo o hoy
    if not fecha:
        match = re.search(r"(\d{4})[-_](\d{2})[-_](\d{2})", nombre_archivo)
        if match:
            fecha = f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
        else:
            fecha = date.today().isoformat()

    # Extraer filas de tabla y fincas
    fincas: list[dict[str, Any]] = []
    items_crudos: list[dict[str, Any]] = []

    for fila in filas:
        celdas = fila["cells"]
        linea = " ".join(c["text"] for c in celdas)

        # Detectar fila de ítem buscando números decimales
        tokens = linea.split()
        decimales = [
            (i, t) for i, t in enumerate(tokens)
            if re.match(r"^[\d,]+\.\d+$", t.replace(",", ""))
        ]

        es_fila_item = False
        cantidad_str = ""
        precio_str = ""
        total_str = ""
        producto = ""
        descripcion = ""
        codigo = ""

        if len(decimales) >= 3:
            # Tomar los últimos 3 decimales como cantidad, precio, total
            idx_cantidad, cantidad_str = decimales[-3]
            _idx_precio, precio_str = decimales[-2]
            _idx_total, total_str = decimales[-1]

            texto_previo = " ".join(tokens[:idx_cantidad]).strip()
            texto_upper = texto_previo.upper()

            # Evitar confundir con encabezados de tabla
            palabras_excluidas = {"CANTIDAD", "PRECIO", "TOTAL", "DESCRIPCION", "MEDIDA", "PEDIDO"}
            if not any(p in texto_upper for p in palabras_excluidas):
                es_fila_item = True

                # Intentar extraer código (número al inicio del texto previo)
                codigo_match = re.match(r"^(\d+)\s+(.+)$", texto_previo)
                if codigo_match:
                    codigo = codigo_match.group(1)
                    producto = codigo_match.group(2).strip()
                else:
                    producto = texto_previo

                descripcion = producto

        if es_fila_item:
            items_crudos.append({
                "y": fila["y"],
                "codigo": codigo,
                "semana": semana,
                "producto": producto,
                "cantidad": Decimal(cantidad_str.replace(",", "")),
                "descripcion": descripcion,
                "precioUnitario": Decimal(precio_str.replace(",", "")),
                "total": Decimal(total_str.replace(",", "")),
            })
        else:
            # Detectar fila de finca
            solo_celda = len(celdas) == 1
            primera_celda = celdas[0] if celdas else None
            parece_finca = solo_celda or (
                len(celdas) <= 2
                and primera_celda is not None
                and not re.match(r"^\d+(\.\d+)?$", primera_celda["text"])
                and "," not in primera_celda["text"]
            )

            if parece_finca:
                nombre = linea.strip()
                if (
                    nombre
                    and len(nombre) > 1
                    and "PEDIDO" not in nombre.upper()
                    and "DESCRIPCION" not in nombre.upper()
                    and "CANTIDAD" not in nombre.upper()
                    and "MEDIDA" not in nombre.upper()
                    and "PREC" not in nombre.upper()
                    and "DESC" not in nombre.upper()
                    and "TOTAL" not in nombre.upper()
                    and not re.match(r"^\d+(\.\d+)?$", nombre)
                    and not re.match(r"^\d{1,2}\s+de\s+\w+\s+de\s+\d{4}$", nombre)
                ):
                    fincas.append({"y": fila["y"], "nombre": nombre})

    # Asignar fincas a ítems
    orden_items: list[dict[str, Any]] = []
    for item in items_crudos:
        finca = "-"

        # Preferir finca ARRIBA (y mayor, diff <= 20)
        min_diff = float("inf")
        finca_arriba = None
        for f in fincas:
            diff = f["y"] - item["y"]
            if 0 < diff <= 20 and diff < min_diff:
                min_diff = diff
                finca_arriba = f

        if finca_arriba:
            finca = finca_arriba["nombre"]
        else:
            # Fallback: finca ABAJO (diff <= 20)
            min_diff = float("inf")
            finca_abajo = None
            for f in fincas:
                diff = item["y"] - f["y"]
                if 0 < diff <= 20 and diff < min_diff:
                    min_diff = diff
                    finca_abajo = f
            if finca_abajo:
                finca = finca_abajo["nombre"]

        orden_items.append({
            "fecha": date.fromisoformat(fecha),
            "numeroOrden": numero_orden or f"OC-{fecha}",
            "finca": finca,
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
