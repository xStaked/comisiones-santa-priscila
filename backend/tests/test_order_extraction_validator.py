from decimal import Decimal

import pytest

from app.services.order_extraction_models import OrdenExtraidaIA, OrdenItemExtraidoIA
from app.services.order_extraction_validator import validar_orden_extraida


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
