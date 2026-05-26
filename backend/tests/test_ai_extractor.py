import pytest

from app.services.ai_extractor import ExtraccionIADeshabilitada, obtener_extractor_ia
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
