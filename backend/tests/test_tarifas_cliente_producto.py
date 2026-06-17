from decimal import Decimal

from app.models.cliente import Cliente, Finca
from app.models.comisionista import Comisionista
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto


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
