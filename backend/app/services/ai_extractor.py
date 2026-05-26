from __future__ import annotations

import importlib
from typing import Protocol

from app.services.order_extraction_models import EntradaExtraccion, OrdenExtraidaIA


class ExtraccionIADeshabilitada(RuntimeError):
    pass


class ErrorExtraccionIA(RuntimeError):
    pass


class ExtractorIA(Protocol):
    def extraer_orden(self, entrada: EntradaExtraccion) -> OrdenExtraidaIA:
        pass


class ExtractorDeshabilitado:
    def extraer_orden(self, entrada: EntradaExtraccion) -> OrdenExtraidaIA:
        raise ExtraccionIADeshabilitada("Extraccion IA deshabilitada")


def obtener_extractor_ia(provider: str, api_key: str, model: str) -> ExtractorIA:
    if provider == "disabled":
        return ExtractorDeshabilitado()
    if provider == "openai":
        if not api_key:
            raise ExtraccionIADeshabilitada("OPENAI_API_KEY no esta configurado")
        try:
            modulo = importlib.import_module("app.services.openai_extractor")
        except ModuleNotFoundError as exc:
            raise ExtraccionIADeshabilitada(
                "La dependencia OpenAI no esta disponible para extraccion IA"
            ) from exc

        return modulo.OpenAIOrdenExtractor(api_key=api_key, model=model)
    raise ExtraccionIADeshabilitada(f"Proveedor IA no soportado: {provider}")
