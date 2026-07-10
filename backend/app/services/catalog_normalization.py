from __future__ import annotations

import re
import unicodedata


# ⚠️ DEBEN MANTENERSE SINCRONIZADAS con src/lib/normalization.ts
# Cualquier cambio en la lógica de normalización debe replicarse en ambos
# lados para garantizar que el matching de tarifas específicas funcione
# consistentemente entre la vista previa (frontend) y el cálculo persistido
# (backend).


def _normalizar_texto(valor: str) -> str:
    sin_tildes = "".join(
        caracter
        for caracter in unicodedata.normalize("NFD", valor or "")
        if unicodedata.category(caracter) != "Mn"
    )
    return " ".join(re.sub(r"[^A-Z0-9]+", " ", sin_tildes.upper()).split())


def normalizar_nombre_finca(nombre: str) -> str:
    tokens = [
        token
        for token in _normalizar_texto(nombre).split()
        if token not in {"ADM", "ADMINISTRACION"}
    ]
    return " ".join("GOLFO" if token == "GOLDO" else token for token in tokens)


def normalizar_nombre_producto(nombre: str) -> str:
    normalizado = _normalizar_texto(nombre)

    # Detectar familia ECU-BACILLUS (nombres largos y abreviaturas de PDF)
    es_ecu_bacillus = "ECU" in normalizado and (
        "BACILLUS" in normalizado
        or normalizado.startswith("ECU B ")
        or "ECU B" in normalizado
    )

    if es_ecu_bacillus:
        tokens = normalizado.split()
        # Las facturas escriben PASTILLAS en plural: sin la S opcional, C1TH y
        # C1PA caían al fallback SUELO, que es otro producto con otra tarifa.
        if re.search(r"\bPASTILLAS?\b", normalizado):
            if "TH" in tokens:
                return "PAST TH"
            if "ALIMENTADOR" in tokens or "ALIMENTACION" in tokens or "ALIM" in tokens:
                return "PAST ALIM"
            # "PASTILLAS GRANDES" y "SUELO PASTILLA" son el mismo producto: cada
            # cliente lo tiene cargado con un nombre distinto en su sistema.
            return "ECU BACILLUS SUELO PASTILLA"
        if "ALIMENTACION" in normalizado or "ALIM" in normalizado:
            return "PAST ALIM"
        if "AGUA" in normalizado:
            return "ECU-BACILLUS AGUA"
        if "SALUD" in normalizado:
            return "ECU-BACILLUS SALUD"
        if "SUELO" in normalizado or "POLVO" in normalizado:
            return "ECU-BACILLUS SUELO"

    # Abreviaturas sueltas que aparecen en los PDFs / Excel de tarifas
    if normalizado in {"PAST TH", "PAST ALIM"}:
        return normalizado
    if normalizado == "PAST GRAN":
        return "ECU BACILLUS SUELO PASTILLA"
    if normalizado in {"AGUA", "ECU BACILLUS AGUA"}:
        return "ECU-BACILLUS AGUA"
    if normalizado in {"SALUD", "ECU BACILLUS SALUD"}:
        return "ECU-BACILLUS SALUD"
    if normalizado in {
        "SUELO",
        "POLVO",
        "SUELO POLVO",
        "SUELO / POLVO",
        "ECU BACILLUS SUELO",
        "ECU BACILLUS SUELO POLVO",
    }:
        return "ECU-BACILLUS SUELO"

    if re.search(r"\bNATUXTRACT\b", normalizado):
        return "NATUXTRACT"
    if re.search(r"\bCITRIUS\b", normalizado):
        return "CITRIUS"
    if re.search(r"\bCALCINIT\b", normalizado) or (
        re.search(r"\bNITRATO\b", normalizado) and re.search(r"\bCALCIO\b", normalizado)
    ):
        return "CALCINIT"
    if re.search(r"\bMORTAL\b", normalizado) and "C" in normalizado.split():
        return "MORTAL C"

    # Fallback legacy
    if "PASTILLA" in normalizado and "TH" in normalizado:
        return "PAST TH"

    return normalizado


# ponytail: lista corta de sufijos vistos en órdenes reales; ampliar si aparece otro
_SUFIJOS_SOCIETARIOS = {"CIA", "LTDA", "SA", "S", "A", "CA", "SAS"}


def normalizar_razon_social(nombre: str | None) -> str:
    """Clave de matching para razones sociales: ignora tildes, puntuación y
    sufijos societarios finales (CIA. LTDA., S.A., ...) para unificar variantes
    de la misma empresa que vienen distintas en cada PDF."""
    tokens = _normalizar_texto(nombre or "").split()
    while tokens and tokens[-1] in _SUFIJOS_SOCIETARIOS:
        tokens.pop()
    return " ".join(tokens)


def es_proveedor_comodin(proveedor: str | None) -> bool:
    return not _normalizar_texto(proveedor or "") or _normalizar_texto(proveedor or "") == "CUALQUIER PROVEEDOR"


def normalizar_proveedor_tarifa(proveedor: str | None) -> str:
    if es_proveedor_comodin(proveedor):
        return ""
    return " ".join((proveedor or "").strip().split())
