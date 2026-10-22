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
UMBRAL_TOKEN = 0.85
MARGEN_AMBIGUEDAD = 0.02


def ratio(a: str, b: str) -> float:
    """Similitud difflib entre dos strings ya normalizados."""
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def _tokens(valor: str) -> list[str]:
    return [token for token in valor.replace("-", " ").replace("/", " ").split() if token]


def es_coincidencia_segura(
    a: str,
    b: str,
    umbral: float,
    umbral_token: float = UMBRAL_TOKEN,
) -> bool:
    """Coincidencia difusa SEGURA.

    Solo acepta diferencias que parezcan un typo dentro de una misma palabra.
    Nunca acepta que una palabra completa se sustituya por otra: AGUA no es
    SALUD, PAST TH no es PASTILLAS GRANDES, CORVINERO A no es CORVINERO C.
    Esas variantes se resuelven por ID o por nombre normalizado exacto.

    Paridad obligatoria con src/lib/normalization.ts (esCoincidenciaSegura).
    """
    if not a or not b:
        return False
    if a == b:
        return True
    if ratio(a, b) < umbral:
        return False

    tokens_a = _tokens(a)
    tokens_b = _tokens(b)
    if len(tokens_a) != len(tokens_b):
        return False

    for ta, tb in zip(tokens_a, tokens_b):
        if ta == tb:
            continue
        max_len = max(len(ta), len(tb))
        min_len = min(len(ta), len(tb))
        # Un typo no cambia drásticamente el largo de la palabra.
        if min_len < max_len * 0.6:
            return False
        if ratio(ta, tb) < umbral_token:
            return False
    return True


def _mejor_coincidencia(
    objetivo_normalizado: str,
    candidatos: dict[str, object],
    umbral: float,
) -> tuple[object | None, float, str | None]:
    """Busca el candidato seguro con mayor ratio.

    Un candidato solo entra si ``es_coincidencia_segura`` lo acepta. Si hay
    dos candidatos seguros prácticamente empatados, devuelve None: es mejor
    no asignar tarifa que asignar la variante equivocada.
    """
    mejor_ratio_crudo = 0.0
    seguros: list[tuple[float, object, str]] = []

    for clave_norm, obj in candidatos.items():
        r = ratio(objetivo_normalizado, clave_norm)
        mejor_ratio_crudo = max(mejor_ratio_crudo, r)
        if not es_coincidencia_segura(objetivo_normalizado, clave_norm, umbral):
            continue
        seguros.append((r, obj, clave_norm))

    if not seguros:
        return None, mejor_ratio_crudo, None

    seguros.sort(key=lambda item: item[0], reverse=True)
    mejor_ratio, mejor, mejor_clave = seguros[0]
    if (
        len(seguros) > 1
        and seguros[0][1] is not seguros[1][1]
        and abs(mejor_ratio - seguros[1][0]) < MARGEN_AMBIGUEDAD
    ):
        return None, mejor_ratio, None
    return mejor, mejor_ratio, mejor_clave


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
