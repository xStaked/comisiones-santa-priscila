from decimal import Decimal

import pytest

from app.services.order_extraction_models import OrdenExtraidaIA, OrdenItemExtraidoIA
from app.services.order_extraction_validator import (
    _numero_desde_texto,
    validar_orden_extraida,
)


def test_valida_orden_filacas_basica():
    orden = OrdenExtraidaIA(
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

    resultado = validar_orden_extraida(orden)

    assert resultado.fecha.isoformat() == "2026-05-14"
    assert resultado.numeroOrden == "2199"
    assert resultado.items[0].unidad == "kg"
    assert resultado.items[0].total == Decimal("1300.0000")


def test_rechaza_orden_sin_items():
    orden = OrdenExtraidaIA(
        fecha="2026-05-14",
        numeroOrden="2199",
        proveedor="Proveedor",
        cliente="Cliente",
        finca="Finca",
        semana="",
        items=[],
    )

    with pytest.raises(ValueError, match="No se encontraron productos"):
        validar_orden_extraida(orden)


def test_rechaza_total_inconsistente_extremo():
    orden = OrdenExtraidaIA(
        fecha="2026-05-14",
        numeroOrden="2199",
        proveedor="Proveedor",
        cliente="Cliente",
        finca="Finca",
        semana="",
        items=[
            OrdenItemExtraidoIA(
                producto="Producto",
                cantidad=Decimal("20.00"),
                unidad="kg",
                precioUnitario=Decimal("65.00"),
                total=Decimal("9999.00"),
            )
        ],
    )

    with pytest.raises(ValueError, match="total inconsistente"):
        validar_orden_extraida(orden)


def test_usa_el_numero_transcrito_y_no_el_de_la_ia():
    """EO 2083: la IA devolvía 22,5 kg y $26,55 por leer el punto de miles como
    decimal, y el chequeo cantidad x precio no lo delataba porque el error era
    parejo. El número tal cual lo imprime la factura manda."""
    orden = OrdenExtraidaIA(
        fecha="11/06/2026",
        numeroOrden="001-002-000002083",
        proveedor="OCHOA RECALDE ELIZABETH MERCEDES",
        cliente="INDUSTRIAL PESQUERA SANTA PRISCILA S.A.",
        finca="",
        semana="24",
        items=[
            OrdenItemExtraidoIA(
                producto="ECU - CALCINIT ACUÍCOLA",
                cantidad=Decimal("22.5"),
                unidad="Kilogramos",
                precioUnitario=Decimal("1.18"),
                total=Decimal("26.55"),
                cantidadTexto="22.500,00",
                precioUnitarioTexto="1,180000",
                totalTexto="26.550,00",
            )
        ],
    )

    item = validar_orden_extraida(orden).items[0]

    assert item.cantidad == Decimal("22500.00")
    assert item.precioUnitario == Decimal("1.180000")
    assert item.total == Decimal("26550.00")


@pytest.mark.parametrize(
    "texto, esperado",
    [
        ("22.500,00", "22500.00"),   # punto de miles, coma decimal
        ("1.234,56", "1234.56"),
        ("1,234.56", "1234.56"),     # documentos en formato inglés
        ("1.234.567", "1234567"),    # solo separadores de miles
        ("22.500", "22500"),         # separador solitario partiendo 3 dígitos
        ("1,180000", "1.180000"),
        ("$ 26.550,00", "26550.00"),
        ("1300.0000", "1300.0000"),
        ("65,00", "65.00"),
        ("900", "900"),
    ],
)
def test_numero_desde_texto(texto, esperado):
    assert _numero_desde_texto(texto) == Decimal(esperado)


def test_numero_desde_texto_ignora_lo_que_no_es_numero():
    assert _numero_desde_texto("") is None
    assert _numero_desde_texto("s/d") is None


def test_cae_al_campo_numerico_si_no_hay_transcripcion():
    """Las respuestas viejas (y el extractor de imágenes sin IA) no traen los
    campos de texto: el número de la IA sigue siendo el respaldo."""
    orden = OrdenExtraidaIA(
        fecha="2026-05-14",
        numeroOrden="2199",
        proveedor="Proveedor",
        cliente="Cliente",
        finca="Finca",
        semana="",
        items=[
            OrdenItemExtraidoIA(
                producto="ECUBACILLUS TH",
                cantidad=Decimal("20"),
                unidad="KILOGRAMOS",
                precioUnitario=Decimal("65"),
                total=Decimal("1300"),
            )
        ],
    )

    assert validar_orden_extraida(orden).items[0].cantidad == Decimal("20")
