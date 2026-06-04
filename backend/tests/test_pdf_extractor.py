from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from app.models.cliente import Cliente, Finca
from app.models.comisionista import Comisionista, TipoTarifa
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.order_extraction_models import OrdenItemValidado, OrdenValidada
from app.services.pdf_extractor import (
    _extraer_items_santa_priscila_desde_filas,
    _orden_validada_a_respuesta,
    extraer_orden_de_pdf,
)


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
    assert items[0]["unidad"] == "canecas"
    assert items[1]["producto"] == "NITRATO DE CALCIO"
    assert items[1]["cantidad"] == Decimal("26.50000")
    assert items[1]["precioUnitario"] == Decimal("1700.00")
    assert items[1]["total"] == Decimal("45050.00")
    assert items[1]["unidad"] == "sacos"


def test_serializa_comisionistas_resueltos_por_normalizador():
    orden = OrdenValidada(
        fecha=date(2026, 4, 7),
        numeroOrden="93133",
        proveedor="DINACUAMAR",
        semana="15",
        items=[
            OrdenItemValidado(
                fecha=date(2026, 4, 7),
                numeroOrden="93133",
                finca="TAURA ADM D",
                producto="ECU-BACILLUS SUELO-PASTILLA TH",
                cantidad=Decimal("20"),
                unidad="kg",
                precioUnitario=Decimal("685"),
                total=Decimal("13700"),
                comisionistas=[{"comisionistaId": "comisionista-uno"}],
            )
        ],
    )

    respuesta = _orden_validada_a_respuesta(orden)

    assert respuesta["items"][0]["comisionistas"] == [
        {"comisionistaId": "comisionista-uno"}
    ]


def test_pdf_real_asigna_comisionistas_por_cliente_producto_y_finca(db_session):
    ruta_pdf = Path("/Users/xstaked/Downloads/ordenes/93133 SEM 15 ECU-BACILLUS.pdf")
    if not ruta_pdf.exists():
        pytest.skip("No existe el PDF real 93133 SEM 15 ECU-BACILLUS.pdf")

    cliente = Cliente(nombre="Santa Priscila", tipo="grupo")
    finca_taura_d = Finca(nombre="TAURA ADM D", cliente=cliente)
    finca_golfo = Finca(nombre="GOLFO", cliente=cliente)
    producto_pastilla = Producto(
        nombre="ECU-BACILLUS SUELO-PASTILLA TH",
        unidad_comision="kg",
    )
    producto_salud = Producto(nombre="ECU-BACILLUS SALUD", unidad_comision="kg")
    comisionista_uno = Comisionista(nombre="COMISIONISTA UNO")
    comisionista_dos = Comisionista(nombre="COMISIONISTA DOS")
    db_session.add_all(
        [
            cliente,
            finca_taura_d,
            finca_golfo,
            producto_pastilla,
            producto_salud,
            comisionista_uno,
            comisionista_dos,
        ]
    )
    db_session.flush()
    db_session.add_all(
        [
            TarifaClienteProducto(
                comisionista_id=comisionista_uno.id,
                cliente_id=cliente.id,
                producto_id=producto_pastilla.id,
                finca_id=finca_taura_d.id,
                tipo=TipoTarifa.fijo_kg,
                valor=Decimal("1"),
            ),
            TarifaClienteProducto(
                comisionista_id=comisionista_dos.id,
                cliente_id=cliente.id,
                producto_id=producto_pastilla.id,
                finca_id=finca_taura_d.id,
                tipo=TipoTarifa.fijo_kg,
                valor=Decimal("2"),
            ),
            TarifaClienteProducto(
                comisionista_id=comisionista_dos.id,
                cliente_id=cliente.id,
                producto_id=producto_salud.id,
                finca_id=finca_golfo.id,
                tipo=TipoTarifa.fijo_kg,
                valor=Decimal("3"),
            ),
        ]
    )
    db_session.commit()

    respuesta = extraer_orden_de_pdf(
        ruta_pdf.read_bytes(),
        nombre_archivo=ruta_pdf.name,
        db=db_session,
        cliente_id=str(cliente.id),
    )

    items_por_combinacion = {
        (item["finca"], item["producto"]): item
        for item in respuesta["items"]
    }
    assert items_por_combinacion[
        ("TAURA ADM D", "ECU-BACILLUS SUELO-PASTILLA TH")
    ]["comisionistas"] == [
        {"comisionistaId": str(comisionista_uno.id)},
        {"comisionistaId": str(comisionista_dos.id)},
    ]
    assert items_por_combinacion[
        ("GOLFO", "ECU-BACILLUS SALUD")
    ]["comisionistas"] == [
        {"comisionistaId": str(comisionista_dos.id)},
    ]
