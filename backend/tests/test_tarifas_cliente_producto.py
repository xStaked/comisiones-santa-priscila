from decimal import Decimal
import uuid

from app.models.cliente import Cliente, Finca
from app.models.comisionista import Comisionista
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto, TipoTarifa


def test_crear_tarifa_normaliza_cualquier_proveedor_a_vacio(authenticated_client, db_session):
    cliente = Cliente(nombre="Santa Priscila", tipo="grupo", retencion_porcentaje=Decimal("1.75"))
    finca = Finca(nombre="TAURA D", cliente=cliente)
    comisionista = Comisionista(nombre="AUGURTO MANUEL")
    producto = Producto(nombre="NATUXTRACT", unidad_comision="tacho", tacho_kilos=Decimal("15"))
    db_session.add_all([cliente, finca, comisionista, producto])
    db_session.commit()
    db_session.refresh(cliente)
    db_session.refresh(finca)
    db_session.refresh(comisionista)
    db_session.refresh(producto)

    response = authenticated_client.post(
        "/api/v1/tarifas-cliente-producto/",
        json={
            "comisionistaId": str(comisionista.id),
            "clienteId": str(cliente.id),
            "productoId": str(producto.id),
            "fincaId": str(finca.id),
            "proveedor": "Cualquier proveedor",
            "proveedoresExcluidos": [],
            "tipo": "fijo_unidad",
            "valor": "2.0000",
        },
    )

    assert response.status_code == 201
    assert response.json()["proveedor"] == ""
    tarifa = db_session.query(TarifaClienteProducto).one()
    assert tarifa.proveedor == ""


def test_actualizacion_masiva_de_tarifas(authenticated_client, db_session):
    cliente = Cliente(nombre="Cliente Masivo", tipo="individual")
    comisionista = Comisionista(nombre="Com Masivo")
    producto1 = Producto(nombre="Prod Masivo 1", unidad_comision="kg")
    producto2 = Producto(nombre="Prod Masivo 2", unidad_comision="kg")
    db_session.add_all([cliente, comisionista, producto1, producto2])
    db_session.flush()
    t1 = TarifaClienteProducto(
        comisionista_id=comisionista.id, cliente_id=cliente.id,
        producto_id=producto1.id, tipo=TipoTarifa.porcentaje, valor=Decimal("2"),
    )
    t2 = TarifaClienteProducto(
        comisionista_id=comisionista.id, cliente_id=cliente.id,
        producto_id=producto2.id, tipo=TipoTarifa.porcentaje, valor=Decimal("2"),
    )
    db_session.add_all([t1, t2])
    db_session.commit()

    resp = authenticated_client.put(
        "/api/v1/tarifas-cliente-producto/masivo",
        json={"ids": [str(t1.id), str(t2.id)], "cambios": {"valor": "3.5"}},
    )

    assert resp.status_code == 200
    assert resp.json()["actualizadas"] == 2
    db_session.refresh(t1)
    db_session.refresh(t2)
    assert t1.valor == Decimal("3.5")
    assert t2.valor == Decimal("3.5")
    # el tipo no se tocó
    assert t1.tipo == TipoTarifa.porcentaje


def test_actualizacion_masiva_id_inexistente(authenticated_client):
    resp = authenticated_client.put(
        "/api/v1/tarifas-cliente-producto/masivo",
        json={"ids": [str(uuid.uuid4())], "cambios": {"activo": False}},
    )
    assert resp.status_code == 404
