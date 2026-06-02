from datetime import date
from decimal import Decimal

from app.models.cliente import Cliente, Finca
from app.models.comisionista import Comisionista, TipoTarifa
from app.models.orden import OrdenItem
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.liquidacion import _buscar_tarifa_especifica


def test_busca_tarifa_especifica_por_nombres_en_orden_antigua(db_session):
    cliente = Cliente(nombre="Cliente Test", tipo="grupo")
    comisionista = Comisionista(nombre="Comisionista Test")
    producto = Producto(nombre="Camarón Test", unidad_comision="kg")
    db_session.add_all([cliente, comisionista, producto])
    db_session.flush()

    finca = Finca(nombre="Finca Test", cliente_id=cliente.id)
    db_session.add(finca)
    db_session.flush()

    tarifa = TarifaClienteProducto(
        comisionista_id=comisionista.id,
        cliente_id=cliente.id,
        producto_id=producto.id,
        finca_id=finca.id,
        tipo=TipoTarifa.fijo_kg,
        valor=Decimal("0.05"),
    )
    orden_item = OrdenItem(
        fecha=date.today(),
        numero_orden="ORD-ANTIGUA-001",
        finca=finca.nombre,
        producto=producto.nombre,
        cantidad=Decimal("100"),
        unidad="kg",
        precio_unitario=Decimal("2"),
        total=Decimal("200"),
    )
    db_session.add_all([tarifa, orden_item])
    db_session.commit()

    encontrada = _buscar_tarifa_especifica(db_session, orden_item, comisionista.id)

    assert encontrada is not None
    assert encontrada.id == tarifa.id


def test_busca_tarifa_pineda_para_goldo_administracion_y_ecu_bacillus(db_session):
    cliente = Cliente(nombre="Santa Priscila", tipo="grupo")
    comisionista = Comisionista(nombre="PINEDA")
    producto = Producto(nombre="PAST TH", unidad_comision="kg")
    db_session.add_all([cliente, comisionista, producto])
    db_session.flush()

    finca = Finca(nombre="GOLFO", cliente_id=cliente.id)
    db_session.add(finca)
    db_session.flush()

    tarifa = TarifaClienteProducto(
        comisionista_id=comisionista.id,
        cliente_id=cliente.id,
        producto_id=producto.id,
        finca_id=finca.id,
        tipo=TipoTarifa.porcentaje,
        valor=Decimal("0.02"),
    )
    orden_item = OrdenItem(
        fecha=date.today(),
        numero_orden="93188",
        finca="-",
        sector="goldo-administracion",
        producto="ECU-BACILLUS SUELO-PASTILLA TH",
        cantidad=Decimal("5"),
        unidad="kg",
        precio_unitario=Decimal("10"),
        total=Decimal("50"),
    )
    db_session.add_all([tarifa, orden_item])
    db_session.commit()

    encontrada = _buscar_tarifa_especifica(db_session, orden_item, comisionista.id)

    assert encontrada is not None
    assert encontrada.id == tarifa.id
