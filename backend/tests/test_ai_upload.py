from decimal import Decimal

from app.services.order_extraction_models import OrdenExtraidaIA, OrdenItemExtraidoIA
from app.services.pdf_extractor import extraer_orden_de_pdf


class FakeExtractor:
    def extraer_orden(self, entrada):
        assert entrada.nombre_archivo == "FL OC2199 DINACUAMAR.pdf"
        assert entrada.texto
        return OrdenExtraidaIA(
            fecha="14/05/2026",
            numeroOrden="2199",
            proveedor="INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA. LTDA.",
            cliente="FILACAS SA",
            finca="EL MORRO",
            semana="",
            items=[
                OrdenItemExtraidoIA(
                    producto="ECUBACILLUS TH",
                    cantidad=Decimal("20.00"),
                    unidad="KILOGRAMOS",
                    precioUnitario=Decimal("65.0000"),
                    total=Decimal("1300.0000"),
                )
            ],
        )


def test_pdf_filacas_delega_a_ia_y_conserva_contrato(monkeypatch):
    monkeypatch.setattr(
        "app.services.pdf_extractor.obtener_extractor_configurado",
        lambda: FakeExtractor(),
    )

    contenido = b"%PDF-1.4\ntexto simulado"
    resultado = extraer_orden_de_pdf(
        contenido,
        nombre_archivo="FL OC2199 DINACUAMAR.pdf",
        db=None,
        texto_override="FL - FILACAS SA ORDEN DE COMPRA N° 2199 Fecha de Emisión: 14/05/2026",
    )

    assert resultado["fecha"].isoformat() == "2026-05-14"
    assert resultado["numeroOrden"] == "2199"
    assert resultado["items"][0]["producto"] == "ECUBACILLUS TH"
    assert resultado["items"][0]["unidad"] == "kg"
