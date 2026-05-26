from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest

from app.models.cliente import Cliente, Finca
from app.models.producto import Producto
from app.routers.upload import ItemExtraido
from app.services.order_extraction_models import OrdenExtraidaIA, OrdenItemExtraidoIA
from app.services.ocr_extractor import extraer_orden_de_imagen
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


def test_pdf_santa_priscila_ecubacillus_delega_a_ia(monkeypatch):
    class ExtractorSantaPriscilaFake:
        def extraer_orden(self, entrada):
            assert entrada.nombre_archivo == "93188 SEM 15 ECU-BACILLUS.pdf"
            assert "INDUSTRIAL PESQUERA SANTA PRISCILA" in entrada.texto
            assert "ECU-BACILLUS SUELO-PASTILLA TH" in entrada.texto
            return OrdenExtraidaIA(
                fecha="2026-04-08",
                numeroOrden="93188",
                proveedor="INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA.LTDA.",
                cliente="INDUSTRIAL PESQUERA SANTA PRISCILA S.A.",
                finca="",
                semana="15",
                items=[
                    OrdenItemExtraidoIA(
                        finca="CALIFORNIA ADM A",
                        producto="ECU-BACILLUS SUELO-PASTILLA TH",
                        cantidad=Decimal("5.00"),
                        unidad="TACHO 10 KG",
                        precioUnitario=Decimal("685.00000"),
                        total=Decimal("3425.00"),
                    ),
                    OrdenItemExtraidoIA(
                        finca="CALIFORNIA ADM B",
                        producto="ECU-BACILLUS SUELO-PASTILLA TH",
                        cantidad=Decimal("15.00"),
                        unidad="TACHO 10 KG",
                        precioUnitario=Decimal("685.00000"),
                        total=Decimal("10275.00"),
                    ),
                ],
            )

    monkeypatch.setattr(
        "app.services.pdf_extractor.obtener_extractor_configurado",
        lambda: ExtractorSantaPriscilaFake(),
    )

    contenido = b"%PDF-1.4\ntexto simulado"
    resultado = extraer_orden_de_pdf(
        contenido,
        nombre_archivo="93188 SEM 15 ECU-BACILLUS.pdf",
        db=None,
        texto_override=(
            "INDUSTRIAL PESQUERA SANTA PRISCILA S.A. ORDEN DE COMPRA No. 93188 "
            "SEMANA : 15 ECU-BACILLUS SUELO-PASTILLA TH CALIFORNIA ADM A"
        ),
    )

    assert resultado["fecha"].isoformat() == "2026-04-08"
    assert resultado["numeroOrden"] == "93188"
    assert resultado["semana"] == "15"
    assert len(resultado["items"]) == 2
    assert resultado["items"][0]["finca"] == "CALIFORNIA ADM A"
    assert resultado["items"][1]["finca"] == "CALIFORNIA ADM B"


def test_schema_upload_conserva_producto_id():
    producto_id = uuid4()
    item = ItemExtraido.model_validate(
        {
            "fecha": "2026-05-14",
            "numeroOrden": "2199",
            "finca": "EL MORRO",
            "productoId": producto_id,
            "producto": "ECUBACILLUS TH",
            "cantidad": Decimal("20.00"),
            "unidad": "kg",
            "precioUnitario": Decimal("65.0000"),
            "total": Decimal("1300.0000"),
            "comisionistas": [],
        }
    )

    assert item.productoId == producto_id


def test_imagen_con_ia_deshabilitada_usa_fallback_easyocr(monkeypatch):
    def fallar_si_usa_ia():
        raise AssertionError("No debe configurar IA cuando esta deshabilitada")

    class ReaderFake:
        def readtext(self, _img_array):
            return [
                ([(0, 0), (100, 0), (100, 20), (0, 20)], "14 de mayo de 2026", 0.99),
                ([(0, 30), (160, 30), (160, 50), (0, 50)], "ORDEN DE COMPRA No. 2199", 0.99),
                ([(0, 60), (200, 60), (200, 80), (0, 80)], "PROVEEDOR : DINACUAMAR", 0.99),
                ([(0, 90), (100, 90), (100, 110), (0, 110)], "EL MORRO", 0.99),
                (
                    [(0, 120), (300, 120), (300, 140), (0, 140)],
                    "100 ECUBACILLUS TH 20.00 65.0000 1300.0000",
                    0.99,
                ),
            ]

    monkeypatch.setattr("app.services.pdf_extractor.settings.AI_EXTRACTION_ENABLED", False)
    monkeypatch.setattr(
        "app.services.ocr_extractor.obtener_extractor_configurado",
        fallar_si_usa_ia,
    )
    monkeypatch.setattr("app.services.ocr_extractor._obtener_reader", lambda: ReaderFake())
    monkeypatch.setattr("app.services.ocr_extractor._preprocesar_imagen", lambda _contenido: object())

    resultado = extraer_orden_de_imagen(b"imagen", nombre_archivo="orden.png")

    assert resultado["numeroOrden"] == "2199"
    assert resultado["items"][0]["producto"] == "ECUBACILLUS TH"


def test_imagen_con_ia_normaliza_usando_db(monkeypatch, db_session):
    cliente = Cliente(nombre="FILACAS SA", tipo="empresa")
    producto = Producto(nombre="ECUBACILLUS TH", unidad_comision="kg")
    db_session.add_all([cliente, producto])
    db_session.flush()
    finca = Finca(nombre="EL MORRO", cliente_id=cliente.id)
    db_session.add(finca)
    db_session.commit()

    class ExtractorImagenFake:
        def extraer_orden(self, entrada):
            assert entrada.nombre_archivo == "orden.png"
            assert entrada.imagenes_base64
            return OrdenExtraidaIA(
                fecha="14/05/2026",
                numeroOrden="2199",
                proveedor="DINACUAMAR",
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

    monkeypatch.setattr("app.services.pdf_extractor.settings.AI_EXTRACTION_ENABLED", True)
    monkeypatch.setattr(
        "app.services.ocr_extractor.obtener_extractor_configurado",
        lambda: ExtractorImagenFake(),
    )

    resultado = extraer_orden_de_imagen(b"imagen", nombre_archivo="orden.png", db=db_session)

    assert resultado["items"][0]["clienteId"] == str(cliente.id)
    assert resultado["items"][0]["fincaId"] == str(finca.id)
    assert resultado["items"][0]["productoId"] == str(producto.id)


def test_endpoint_pdf_filacas_con_ia_deshabilitada_responde_422(monkeypatch, authenticated_client):
    ruta_pdf = Path(__file__).resolve().parents[2] / "FL OC2199 DINACUAMAR.pdf"
    if not ruta_pdf.exists():
        pytest.skip("No existe FL OC2199 DINACUAMAR.pdf en la raíz del repositorio")

    monkeypatch.setattr("app.services.pdf_extractor.settings.AI_EXTRACTION_ENABLED", False)

    with ruta_pdf.open("rb") as archivo:
        response = authenticated_client.post(
            "/api/v1/upload/pdf",
            files={"file": ("FL OC2199 DINACUAMAR.pdf", archivo, "application/pdf")},
        )

    assert response.status_code == 422
    assert "Error al procesar el PDF" in response.json()["detail"]


def test_endpoint_pdf_recorta_mensaje_de_error_largo(monkeypatch, authenticated_client):
    mensaje_largo = "x" * 220

    def extractor_fallido(*_args, **_kwargs):
        raise RuntimeError(mensaje_largo)

    monkeypatch.setattr("app.routers.upload.extraer_orden_de_pdf", extractor_fallido)

    response = authenticated_client.post(
        "/api/v1/upload/pdf",
        files={"file": ("orden.pdf", b"%PDF-1.4\ncontenido", "application/pdf")},
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail == f"Error al procesar el PDF: {'x' * 147} [recortado]"
    assert mensaje_largo not in detail
