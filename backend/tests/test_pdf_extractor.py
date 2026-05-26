from decimal import Decimal

from app.services.pdf_extractor import _extraer_items_santa_priscila_desde_filas


def _celda(texto: str, x: int) -> dict:
    return {"text": texto, "x": x}


def test_extrae_items_santa_priscila_con_cantidad_y_precio_correctos():
    filas = [
        {"y": 119, "cells": [_celda("CHANDUY", 75)]},
        {
            "y": 130,
            "cells": [
                _celda("1132", 75),
                _celda("16", 99),
                _celda("CITRIUS-011", 116),
                _celda("15.00", 281),
                _celda("CANECA", 304),
                _celda("DE", 331),
                _celda("20", 341),
                _celda("LITROS", 348),
                _celda("110.00000", 372),
                _celda("1,650.00", 497),
            ],
        },
        {
            "y": 162,
            "cells": [
                _celda("715", 75),
                _celda("16", 99),
                _celda("NITRATO", 116),
                _celda("DE", 144),
                _celda("CALCIO", 154),
                _celda("1,700.00", 274),
                _celda("SACOS", 304),
                _celda("25", 325),
                _celda("KG", 333),
                _celda("26.50000", 375),
                _celda("45,050.00", 493),
            ],
        },
    ]

    items = _extraer_items_santa_priscila_desde_filas(filas, semana="16")

    assert len(items) == 2
    assert items[0]["finca"] == "CHANDUY"
    assert items[0]["producto"] == "CITRIUS-011"
    assert items[0]["cantidad"] == Decimal("110.00000")
    assert items[0]["precioUnitario"] == Decimal("15.00")
    assert items[0]["total"] == Decimal("1650.00")
    assert items[0]["unidad"] == "litros"
    assert items[1]["producto"] == "NITRATO DE CALCIO"
    assert items[1]["cantidad"] == Decimal("26.50000")
    assert items[1]["precioUnitario"] == Decimal("1700.00")
    assert items[1]["total"] == Decimal("45050.00")
    assert items[1]["unidad"] == "kg"
