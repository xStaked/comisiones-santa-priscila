import importlib
import sys
from types import ModuleType, SimpleNamespace

import pytest

from app.services.ai_extractor import (
    ErrorExtraccionIA,
    ExtraccionIADeshabilitada,
    obtener_extractor_ia,
)
from app.services.order_extraction_models import EntradaExtraccion, OrdenExtraidaIA


def test_disabled_provider_raises_clear_error():
    extractor = obtener_extractor_ia(provider="disabled", api_key="", model="gpt-4.1-mini")

    with pytest.raises(ExtraccionIADeshabilitada, match="Extraccion IA deshabilitada"):
        extractor.extraer_orden(
            EntradaExtraccion(nombre_archivo="x.pdf", content_type="application/pdf")
        )


def test_openai_provider_requires_api_key():
    with pytest.raises(ExtraccionIADeshabilitada, match="OPENAI_API_KEY"):
        obtener_extractor_ia(provider="openai", api_key="", model="gpt-4.1-mini")


def test_fake_extractor_contract():
    class FakeExtractor:
        def extraer_orden(self, entrada):
            return OrdenExtraidaIA(
                fecha="2026-05-14",
                numeroOrden="2199",
                proveedor="Proveedor",
                cliente="Cliente",
                finca="Finca",
                semana="",
                items=[],
            )

    resultado = FakeExtractor().extraer_orden(
        EntradaExtraccion(nombre_archivo="x.pdf", content_type="application/pdf")
    )

    assert resultado.numeroOrden == "2199"


def instalar_openai_fake(monkeypatch, output_text):
    llamadas = []

    class FakeResponses:
        def create(self, **kwargs):
            llamadas.append(kwargs)
            return SimpleNamespace(output_text=output_text)

    class FakeOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.responses = FakeResponses()

    modulo = ModuleType("openai")
    modulo.OpenAI = FakeOpenAI
    modulo.OpenAIError = RuntimeError
    monkeypatch.setitem(sys.modules, "openai", modulo)
    sys.modules.pop("app.services.openai_extractor", None)
    return llamadas


def test_openai_provider_builds_request_and_parses_response(monkeypatch):
    llamadas = instalar_openai_fake(
        monkeypatch,
        """
        {
            "fecha": "2026-05-14",
            "numeroOrden": "2199",
            "proveedor": "Proveedor",
            "cliente": "Cliente",
            "finca": "Finca",
            "semana": "",
            "confidence": 0.91,
            "items": []
        }
        """,
    )

    extractor = obtener_extractor_ia(
        provider="openai", api_key="sk-test", model="gpt-4.1-mini"
    )
    resultado = extractor.extraer_orden(
        EntradaExtraccion(
            nombre_archivo="x.pdf",
            content_type="application/pdf",
            texto="ORDEN DE COMPRA 2199",
            imagenes_base64=["abc123"],
        )
    )

    assert resultado.numeroOrden == "2199"
    assert resultado.confidence == 0.91

    llamada = llamadas[0]
    assert llamada["model"] == "gpt-4.1-mini"
    contenido = llamada["input"][0]["content"]
    assert contenido[0]["type"] == "input_text"
    assert "Extrae una orden de compra acuicola" in contenido[0]["text"]
    assert contenido[1] == {"type": "input_text", "text": "ORDEN DE COMPRA 2199"}
    assert contenido[2] == {
        "type": "input_image",
        "image_url": "data:image/png;base64,abc123",
        "detail": "high",
    }
    formato = llamada["text"]["format"]
    assert formato["type"] == "json_schema"
    assert formato["name"] == "orden_compra_extraida"
    assert formato["strict"] is True


def test_openai_provider_wraps_invalid_json(monkeypatch):
    instalar_openai_fake(monkeypatch, "no-json")

    extractor = obtener_extractor_ia(
        provider="openai", api_key="sk-test", model="gpt-4.1-mini"
    )

    with pytest.raises(ErrorExtraccionIA, match="No se pudo extraer la orden con IA"):
        extractor.extraer_orden(
            EntradaExtraccion(nombre_archivo="x.pdf", content_type="application/pdf")
        )


def test_openai_provider_wraps_missing_output_text(monkeypatch):
    llamadas = []

    class FakeResponses:
        def create(self, **kwargs):
            llamadas.append(kwargs)
            return SimpleNamespace()

    class FakeOpenAI:
        def __init__(self, api_key):
            self.responses = FakeResponses()

    modulo = ModuleType("openai")
    modulo.OpenAI = FakeOpenAI
    modulo.OpenAIError = RuntimeError
    monkeypatch.setitem(sys.modules, "openai", modulo)
    sys.modules.pop("app.services.openai_extractor", None)

    extractor = obtener_extractor_ia(
        provider="openai", api_key="sk-test", model="gpt-4.1-mini"
    )

    with pytest.raises(ErrorExtraccionIA, match="No se pudo extraer la orden con IA"):
        extractor.extraer_orden(
            EntradaExtraccion(nombre_archivo="x.pdf", content_type="application/pdf")
        )


def test_openai_provider_wraps_openai_error(monkeypatch):
    class FakeOpenAIError(Exception):
        pass

    class FakeResponses:
        def create(self, **kwargs):
            raise FakeOpenAIError("sdk-error")

    class FakeOpenAI:
        def __init__(self, api_key):
            self.responses = FakeResponses()

    modulo = ModuleType("openai")
    modulo.OpenAI = FakeOpenAI
    modulo.OpenAIError = FakeOpenAIError
    monkeypatch.setitem(sys.modules, "openai", modulo)
    sys.modules.pop("app.services.openai_extractor", None)

    extractor = obtener_extractor_ia(
        provider="openai", api_key="sk-test", model="gpt-4.1-mini"
    )

    with pytest.raises(ErrorExtraccionIA, match="No se pudo extraer la orden con IA"):
        extractor.extraer_orden(
            EntradaExtraccion(nombre_archivo="x.pdf", content_type="application/pdf")
        )


def test_openai_provider_wraps_missing_dependency(monkeypatch):
    monkeypatch.delitem(sys.modules, "openai", raising=False)
    sys.modules.pop("app.services.openai_extractor", None)

    real_import = importlib.import_module

    def fake_import(name, package=None):
        if name == "app.services.openai_extractor":
            raise ModuleNotFoundError("No module named 'openai'")
        return real_import(name, package)

    monkeypatch.setattr(importlib, "import_module", fake_import)

    with pytest.raises(ExtraccionIADeshabilitada, match="dependencia OpenAI"):
        obtener_extractor_ia(provider="openai", api_key="sk-test", model="gpt-4.1-mini")
