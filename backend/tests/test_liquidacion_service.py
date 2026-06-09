from datetime import date
from decimal import Decimal

from app.models.cliente import Cliente, Finca
from app.models.comisionista import Comisionista, Tarifa, TipoTarifa
from app.models.orden import OrdenItem
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.liquidacion import (
    _buscar_tarifa_especifica,
    _calcular_comision_con_tarifa,
    _calcular_comision_especifica,
)


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


def test_calcula_tarifa_fija_kg_desde_tachos_con_peso_en_unidad(db_session):
    producto = Producto(nombre="PAST TH", unidad_comision="kg")
    db_session.add(producto)
    db_session.flush()

    orden_item = OrdenItem(
        fecha=date.today(),
        numero_orden="93188",
        finca="-",
        sector="africa",
        producto="ECU-BACILLUS SUELO-PASTILLA TH",
        producto_id=producto.id,
        cantidad=Decimal("41"),
        unidad="TACHO 10 KG",
        precio_unitario=Decimal("65"),
        total=Decimal("2665"),
    )
    tarifa = Tarifa(tipo=TipoTarifa.fijo_kg, valor=Decimal("0.75"))
    db_session.add(orden_item)
    db_session.commit()

    comision = _calcular_comision_con_tarifa(orden_item, tarifa)

    assert comision == Decimal("307.50")


def test_calcula_tarifa_fija_kg_desde_tachos_sin_peso_explicitado(db_session):
    producto = Producto(nombre="PAST TH", unidad_comision="kg")
    db_session.add(producto)
    db_session.flush()

    orden_item = OrdenItem(
        fecha=date.today(),
        numero_orden="93488",
        finca="-",
        sector="taura d",
        producto="ECU-BACILLUS SUELO PASTILLA TH",
        producto_id=producto.id,
        cantidad=Decimal("40"),
        unidad="tachos",
        precio_unitario=Decimal("685"),
        total=Decimal("27400"),
    )
    tarifa = Tarifa(tipo=TipoTarifa.fijo_kg, valor=Decimal("1.00"))
    db_session.add(orden_item)
    db_session.commit()

    comision = _calcular_comision_con_tarifa(orden_item, tarifa)

    assert comision == Decimal("600.00")


def test_calcula_tarifa_especifica_fija_kg_desde_tachos_con_peso_en_unidad(db_session):
    cliente = Cliente(nombre="Santa Priscila", tipo="grupo")
    comisionista = Comisionista(nombre="PINEDA")
    producto = Producto(nombre="PAST TH", unidad_comision="kg")
    db_session.add_all([cliente, comisionista, producto])
    db_session.flush()

    orden_item = OrdenItem(
        fecha=date.today(),
        numero_orden="93188",
        finca="-",
        sector="africa",
        producto="ECU-BACILLUS SUELO-PASTILLA TH",
        producto_id=producto.id,
        cantidad=Decimal("41"),
        unidad="TACHO 10 KG",
        precio_unitario=Decimal("65"),
        total=Decimal("2665"),
    )
    tarifa = TarifaClienteProducto(
        comisionista_id=comisionista.id,
        cliente_id=cliente.id,
        producto_id=producto.id,
        tipo=TipoTarifa.fijo_kg,
        valor=Decimal("0.75"),
    )
    db_session.add(orden_item)
    db_session.commit()

    comision = _calcular_comision_especifica(db_session, orden_item, tarifa)

    assert comision == Decimal("307.50")
