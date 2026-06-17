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
        if re.search(r"\bPASTILLA\b", normalizado) and "TH" in normalizado:
            return "PAST TH"
        if re.search(r"\bPASTILLAS\b", normalizado) and "GRANDES" in normalizado:
            return "PAST GRAN"
        if re.search(r"\bPASTILLA\b", normalizado):
            return "ECU BACILLUS SUELO PASTILLA"
        if "ALIMENTACION" in normalizado or "ALIM" in normalizado:
            return "PAST ALIM"
        if "AGUA" in normalizado:
            return "AGUA"
        if "SALUD" in normalizado:
            return "SALUD"
        if "SUELO" in normalizado or "POLVO" in normalizado:
            return "SUELO / POLVO"

    # Abreviaturas sueltas que aparecen en los PDFs / Excel de tarifas
    if normalizado in {
        "PAST TH", "PAST GRAN", "PAST ALIM", "AGUA", "SALUD", "SUELO / POLVO"
    }:
        return normalizado

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
