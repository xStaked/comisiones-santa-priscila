"""Matching difuso para catálogos (sector / producto / cliente).

Cubrir typos inevitables de facturas ya emitidas (ej. "CALIFRONIA" → "CALIFORNIA",
"califromia" → "california", "GOLDO" ya se maneja en normalizacion).

Usa difflib.SequenceMatcher (stdlib) que es el mismo criterio que el frontend
debe replicar para mantener paridad. El ratio es 2*M / T donde M son
caracteres coincidentes en bloques contiguos. Con threshold 0.80:
- "califromia" vs "california" → 0.80 → corrige
- "califronia" vs "california" → 0.90 → corrige
- "africa" vs "asia" → 0.60 → no corrige
"""

from __future__ import annotations

import difflib

from app.services.catalog_normalization import (
    normalizar_nombre_finca,
    normalizar_nombre_producto,
    normalizar_razon_social,
)

# Umbrales — mantener sincronizados con src/lib/normalization.ts
UMBRAL_FINCA = 0.80
UMBRAL_PRODUCTO = 0.85  # productos con familias críticas, más estricto
UMBRAL_CLIENTE = 0.85


def ratio(a: str, b: str) -> float:
    """Similitud difflib entre dos strings ya normalizados."""
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def _mejor_coincidencia(
    objetivo_normalizado: str,
    candidatos: dict[str, object],
    umbral: float,
) -> tuple[object | None, float, str | None]:
    """Busca el candidato con mayor ratio >= umbral.

    candidatos: dict {nombre_normalizado: objeto_original}
    Retorna (objeto, ratio, nombre_normalizado)
    """
    mejor = None
    mejor_ratio = 0.0
    mejor_clave = None
    for clave_norm, obj in candidatos.items():
        r = ratio(objetivo_normalizado, clave_norm)
        if r > mejor_ratio:
            mejor_ratio = r
            mejor = obj
            mejor_clave = clave_norm
    if mejor is not None and mejor_ratio >= umbral:
        return mejor, mejor_ratio, mejor_clave
    return None, mejor_ratio, None


def buscar_finca_cercana(
    nombre: str,
    fincas: list,
    umbral: float = UMBRAL_FINCA,
):
    """Finca del catálogo más cercana al texto dado (ya filtrada por cliente si aplica).

    Retorna (finca | None, ratio, nombre_normalizado_objetivo)
    """
    if not nombre or not fincas:
        return None, 0.0, None
    objetivo = normalizar_nombre_finca(nombre) or ""
    if not objetivo:
        return None, 0.0, None

    # exacto primero (evita difuso innecesario)
    for f in fincas:
        if normalizar_nombre_finca(f.nombre) == objetivo:
            return f, 1.0, objetivo

    candidatos = {normalizar_nombre_finca(f.nombre) or "": f for f in fincas}
    # eliminar claves vacías
    candidatos = {k: v for k, v in candidatos.items() if k}
    finca, r, _ = _mejor_coincidencia(objetivo, candidatos, umbral)
    return finca, r, objetivo


def buscar_producto_cercano(
    nombre: str,
    productos: list,
    umbral: float = UMBRAL_PRODUCTO,
):
    if not nombre or not productos:
        return None, 0.0, None
    objetivo = normalizar_nombre_producto(nombre) or ""
    if not objetivo:
        return None, 0.0, None
    for p in productos:
        if normalizar_nombre_producto(p.nombre) == objetivo:
            return p, 1.0, objetivo
    # también alias
    candidatos: dict[str, object] = {}
    for p in productos:
        clave = normalizar_nombre_producto(p.nombre) or ""
        if clave:
            candidatos.setdefault(clave, p)
        for alias in getattr(p, "alias", []) or []:
            clave_a = normalizar_nombre_producto(alias.alias) or ""
            if clave_a:
                candidatos.setdefault(clave_a, p)
    prod, r, _ = _mejor_coincidencia(objetivo, candidatos, umbral)
    return prod, r, objetivo


def buscar_cliente_cercano(
    nombre: str,
    clientes: list,
    umbral: float = UMBRAL_CLIENTE,
):
    if not nombre or not clientes:
        return None, 0.0, None
    objetivo = normalizar_razon_social(nombre)
    if not objetivo:
        return None, 0.0, None
    for c in clientes:
        if normalizar_razon_social(c.nombre) == objetivo:
            return c, 1.0, objetivo
    candidatos = {normalizar_razon_social(c.nombre): c for c in clientes}
    candidatos = {k: v for k, v in candidatos.items() if k}
    cli, r, _ = _mejor_coincidencia(objetivo, candidatos, umbral)
    return cli, r, objetivo


def similitud_finca(a: str, b: str) -> float:
    """Ratio entre dos nombres de finca ya con normalizar_nombre_finca aplicado."""
    na = normalizar_nombre_finca(a) or ""
    nb = normalizar_nombre_finca(b) or ""
    return ratio(na, nb)
