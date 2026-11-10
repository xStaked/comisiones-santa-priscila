from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest

from app.commands.reextraer import revisar
from app.models import EstadoOrden, Orden, OrdenExtraccion, OrdenItem
from app.services.extracciones import (
    guardar_extraccion_pendiente,
    limpiar_pendientes,
    vincular_extraccion,
)
from app.services.pdf_extractor import (
    deserializar_entrada,
    extraer_orden_de_pdf,
    extraer_orden_desde_entrada,
    serializar_entrada,
)

CORPUS = Path(__file__).parent / "fixtures" / "ordenes" / "100453.pdf"


@pytest.fixture(scope="module")
def extraccion_real():
    return extraer_orden_de_pdf(CORPUS.read_bytes(), nombre_archivo=CORPUS.name)


def _orden(
    db,
    numero: str = "100453",
    fecha: date = date(2026, 9, 15),
) -> Orden:
    orden = Orden(
        fecha=fecha,
        numero_orden=numero,
        origen="pdf",
        estado=EstadoOrden.pendiente,
    )
    db.add(orden)
    db.flush()
    return orden


def _item(db, orden: Orden, **overrides) -> OrdenItem:
    datos = {
        "orden_id": orden.id,
        "fecha": orden.fecha,
        "numero_orden": orden.numero_orden,
        "finca": "AFRICA - ADMINISTRACION",
        "producto": "ECU-BACILLUS SUELO-PASTILLA TH",
        "cantidad": Decimal("18.00"),
        "unidad": "tachos",
        "precio_unitario": Decimal("685.00"),
        "total": Decimal("12330.00"),
        "estado": EstadoOrden.pendiente,
    }
    datos.update(overrides)
    item = OrdenItem(**datos)
    db.add(item)
    db.flush()
    return item


def test_la_entrada_guardada_reejecuta_la_misma_extraccion(extraccion_real):
    reejecutada = extraer_orden_desde_entrada(
        extraccion_real["_entrada"], nombre_archivo=CORPUS.name
    )

    assert reejecutada["items"] == extraccion_real["items"]
    assert "_entrada" not in reejecutada


def test_la_entrada_comprimida_es_mucho_mas_chica_que_el_pdf(extraccion_real):
    blob = serializar_entrada(extraccion_real["_entrada"])

    assert len(blob) < len(CORPUS.read_bytes()) // 10
    assert deserializar_entrada(blob)["version"] == extraccion_real["_entrada"]["version"]


def test_vincula_la_entrada_pendiente_a_la_orden(db_session, extraccion_real):
    guardar_extraccion_pendiente(
        db_session, extraccion_real["_entrada"], "100453", date(2026, 9, 15)
    )
    orden = _orden(db_session)

    vincular_extraccion(db_session, orden)
    db_session.commit()

    fila = db_session.query(OrdenExtraccion).one()
    assert fila.orden_id == orden.id
    assert fila.parser_version == 1
    assert len(fila.entrada) > 0


def test_no_vincula_una_entrada_de_otra_fecha(db_session, extraccion_real):
    guardar_extraccion_pendiente(
        db_session, extraccion_real["_entrada"], "100453", date(2026, 9, 14)
    )
    orden = _orden(db_session, fecha=date(2026, 9, 15))

    vincular_extraccion(db_session, orden)
    db_session.commit()

    assert db_session.query(OrdenExtraccion).one().orden_id is None


def test_limpiar_pendientes_respeta_las_vinculadas(db_session, extraccion_real):
    orden = _orden(db_session, numero="100453", fecha=date(2026, 9, 15))
    guardar_extraccion_pendiente(
        db_session, extraccion_real["_entrada"], "100453", date(2026, 9, 15)
    )
    vincular_extraccion(db_session, orden)
    db_session.commit()

    guardar_extraccion_pendiente(
        db_session, extraccion_real["_entrada"], "999999", date(2026, 9, 15)
    )
    viejo = datetime.now(timezone.utc) - timedelta(days=60)
    for fila in db_session.query(OrdenExtraccion).all():
        fila.creado_en = viejo
    db_session.commit()

    assert limpiar_pendientes(db_session, 30) == 1
    assert db_session.query(OrdenExtraccion).count() == 1


def test_reextraer_reporta_ordenes_con_diferencias(
    db_session, extraccion_real, capsys
):
    orden = _orden(db_session)
    _item(db_session, orden, cantidad=Decimal("1359"), total=Decimal("930615"))
    guardar_extraccion_pendiente(
        db_session, extraccion_real["_entrada"], orden.numero_orden, orden.fecha
    )
    vincular_extraccion(db_session, orden)
    db_session.commit()

    assert revisar(db_session) == 1

    salida = capsys.readouterr().out
    assert "100453" in salida
    assert "con diferencias" in salida


def test_upload_y_alta_vinculan_la_entrada(authenticated_client, db_session):
    with CORPUS.open("rb") as archivo:
        subida = authenticated_client.post(
            "/api/v1/upload/pdf",
            files={"file": (CORPUS.name, archivo, "application/pdf")},
        )
    assert subida.status_code == 200, subida.text
    extraccion = subida.json()
    assert extraccion["numeroOrden"] == "100453"

    item = extraccion["items"][0]
    alta = authenticated_client.post(
        "/api/v1/ordenes/",
        json=[
            {
                "fecha": item["fecha"],
                "numero_orden": item["numeroOrden"],
                "finca": item["finca"],
                "producto": item["producto"],
                "cantidad": item["cantidad"],
                "unidad": item["unidad"],
                "precio_unitario": item["precioUnitario"],
                "total": item["total"],
                "sector": item.get("sector"),
                "proveedor": extraccion["proveedor"],
                "comisionista_ids": [],
                "cliente_id": item.get("clienteId"),
                "producto_id": item.get("productoId"),
                "finca_id": item.get("fincaId"),
            }
        ],
    )
    assert alta.status_code == 201, alta.text

    fila = db_session.query(OrdenExtraccion).one()
    assert fila.numero_orden == "100453"
    assert fila.orden_id is not None
