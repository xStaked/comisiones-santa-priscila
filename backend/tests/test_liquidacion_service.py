from datetime import date
from decimal import Decimal

from app.models.cliente import Cliente, Finca
from app.models.comisionista import Comisionista, Tarifa, TipoTarifa
from app.models.orden import Asignacion, EstadoOrden, Orden, OrdenItem
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.liquidacion import (
    _buscar_tarifa_especifica,
    _calcular_comision_con_tarifa,
    _calcular_comision_especifica,
    crear_liquidacion,
    eliminar_liquidacion,
    restaurar_liquidacion,
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


def test_buscar_tarifa_especifica_descarta_cuando_proveedor_excluido(db_session):
    cliente = Cliente(nombre="Cliente Test", tipo="grupo")
    comisionista = Comisionista(nombre="Comisionista Test")
    producto = Producto(nombre="Producto Test", unidad_comision="kg")
    db_session.add_all([cliente, comisionista, producto])
    db_session.flush()

    tarifa = TarifaClienteProducto(
        comisionista_id=comisionista.id,
        cliente_id=cliente.id,
        producto_id=producto.id,
        finca_id=None,
        tipo=TipoTarifa.fijo_kg,
        valor=Decimal("1.00"),
        proveedores_excluidos=["Elizabeth Ochoa"],
    )

    orden = Orden(
        fecha=date.today(),
        numero_orden="ORD-001",
        proveedor="Elizabeth Ochoa",
    )
    db_session.add(orden)
    db_session.flush()

    orden_item = OrdenItem(
        orden_id=orden.id,
        fecha=date.today(),
        numero_orden="ORD-001",
        finca="-",
        producto=producto.nombre,
        cantidad=Decimal("10"),
        unidad="kg",
        precio_unitario=Decimal("5"),
        total=Decimal("50"),
        cliente_id=cliente.id,
        producto_id=producto.id,
    )
    db_session.add_all([tarifa, orden_item])
    db_session.commit()

    encontrada = _buscar_tarifa_especifica(db_session, orden_item, comisionista.id)
    assert encontrada is None


def test_buscar_tarifa_especifica_encuentra_cuando_proveedor_no_excluido(db_session):
    cliente = Cliente(nombre="Cliente Test", tipo="grupo")
    comisionista = Comisionista(nombre="Comisionista Test")
    producto = Producto(nombre="Producto Test", unidad_comision="kg")
    db_session.add_all([cliente, comisionista, producto])
    db_session.flush()

    tarifa = TarifaClienteProducto(
        comisionista_id=comisionista.id,
        cliente_id=cliente.id,
        producto_id=producto.id,
        finca_id=None,
        tipo=TipoTarifa.fijo_kg,
        valor=Decimal("1.00"),
        proveedores_excluidos=["Elizabeth Ochoa"],
    )

    orden = Orden(
        fecha=date.today(),
        numero_orden="ORD-002",
        proveedor="Dinacuamar",
    )
    db_session.add(orden)
    db_session.flush()

    orden_item = OrdenItem(
        orden_id=orden.id,
        fecha=date.today(),
        numero_orden="ORD-002",
        finca="-",
        producto=producto.nombre,
        cantidad=Decimal("10"),
        unidad="kg",
        precio_unitario=Decimal("5"),
        total=Decimal("50"),
        cliente_id=cliente.id,
        producto_id=producto.id,
    )
    db_session.add_all([tarifa, orden_item])
    db_session.commit()

    encontrada = _buscar_tarifa_especifica(db_session, orden_item, comisionista.id)
    assert encontrada is not None
    assert encontrada.id == tarifa.id


def test_crear_liquidacion_aplica_cero_cuando_proveedor_excluido_en_global(db_session):
    comisionista = Comisionista(nombre="Comisionista Test")
    comisionista.tarifas = [
        Tarifa(
            tipo=TipoTarifa.fijo_kg,
            valor=Decimal("1.00"),
            proveedores_excluidos=["Elizabeth Ochoa"],
        )
    ]
    db_session.add(comisionista)
    db_session.flush()

    orden = Orden(
        fecha=date.today(),
        numero_orden="ORD-003",
        proveedor="Elizabeth Ochoa",
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden)
    db_session.flush()

    orden_item = OrdenItem(
        orden_id=orden.id,
        fecha=date.today(),
        numero_orden="ORD-003",
        finca="-",
        producto="Producto Test",
        cantidad=Decimal("10"),
        unidad="kg",
        precio_unitario=Decimal("5"),
        total=Decimal("50"),
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden_item)
    db_session.flush()

    asignacion = Asignacion(orden_item_id=orden_item.id, comisionista_id=comisionista.id)
    db_session.add(asignacion)
    db_session.commit()

    liquidacion, omitidos = crear_liquidacion(db_session, "Liq Test", [orden_item.id])

    assert len(liquidacion.items) == 1
    tarifas_comisionista = [
        t for t in liquidacion.items[0].tarifas if t.comisionista_id == comisionista.id
    ]
    assert len(tarifas_comisionista) == 0


def test_crear_liquidacion_aplica_global_cuando_proveedor_no_excluido(db_session):
    comisionista = Comisionista(nombre="Comisionista Test")
    comisionista.tarifas = [
        Tarifa(
            tipo=TipoTarifa.fijo_kg,
            valor=Decimal("1.00"),
            proveedores_excluidos=["Elizabeth Ochoa"],
        )
    ]
    db_session.add(comisionista)
    db_session.flush()

    orden = Orden(
        fecha=date.today(),
        numero_orden="ORD-004",
        proveedor="Dinacuamar",
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden)
    db_session.flush()

    orden_item = OrdenItem(
        orden_id=orden.id,
        fecha=date.today(),
        numero_orden="ORD-004",
        finca="-",
        producto="Producto Test",
        cantidad=Decimal("10"),
        unidad="kg",
        precio_unitario=Decimal("5"),
        total=Decimal("50"),
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden_item)
    db_session.flush()

    asignacion = Asignacion(orden_item_id=orden_item.id, comisionista_id=comisionista.id)
    db_session.add(asignacion)
    db_session.commit()

    liquidacion, omitidos = crear_liquidacion(db_session, "Liq Test 2", [orden_item.id])

    assert len(liquidacion.items) == 1
    tarifas_comisionista = [
        t for t in liquidacion.items[0].tarifas if t.comisionista_id == comisionista.id
    ]
    assert len(tarifas_comisionista) == 1
    assert tarifas_comisionista[0].comision_calculada == Decimal("10.00")


def test_crear_liquidacion_cero_comision_cuando_proveedor_excluido_en_tarifa_especifica(db_session):
    """Flujo completo: orden con proveedor excluido → tarifa específica descartada → comisión $0."""
    from decimal import Decimal
    from datetime import date
    from app.models.cliente import Cliente
    from app.models.comisionista import Comisionista
    from app.models.producto import Producto
    from app.models.orden import Orden, OrdenItem, Asignacion
    from app.models.tarifa_cliente_producto import TarifaClienteProducto
    from app.models.comisionista import TipoTarifa
    from app.services.liquidacion import crear_liquidacion

    cliente = Cliente(nombre="Santa Priscila", tipo="grupo")
    comisionista = Comisionista(nombre="MALAVE")
    producto = Producto(nombre="ECU-BACILLUS SUELO PASTILLA TH", unidad_comision="kg")
    db_session.add_all([cliente, comisionista, producto])
    db_session.flush()

    tarifa = TarifaClienteProducto(
        comisionista_id=comisionista.id,
        cliente_id=cliente.id,
        producto_id=producto.id,
        finca_id=None,
        tipo=TipoTarifa.porcentaje,
        valor=Decimal("2.00"),
        proveedores_excluidos=["Elizabeth Ochoa"],
    )
    db_session.add(tarifa)
    db_session.flush()

    orden = Orden(
        fecha=date.today(),
        numero_orden="ORD-MALAVE-001",
        proveedor="Elizabeth Ochoa",
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden)
    db_session.flush()

    orden_item = OrdenItem(
        orden_id=orden.id,
        fecha=date.today(),
        numero_orden="ORD-MALAVE-001",
        finca="-",
        producto=producto.nombre,
        cantidad=Decimal("100"),
        unidad="kg",
        precio_unitario=Decimal("5"),
        total=Decimal("500"),
        cliente_id=cliente.id,
        producto_id=producto.id,
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden_item)
    db_session.flush()

    asignacion = Asignacion(orden_item_id=orden_item.id, comisionista_id=comisionista.id)
    db_session.add(asignacion)
    db_session.commit()

    liquidacion, omitidos = crear_liquidacion(db_session, "Liq Malave Test", [orden_item.id])

    assert len(liquidacion.items) == 1
    tarifas_comisionista = [
        t for t in liquidacion.items[0].tarifas if t.comisionista_id == comisionista.id
    ]
    assert len(tarifas_comisionista) == 1
    assert tarifas_comisionista[0].comision_calculada == Decimal("0")
    assert tarifas_comisionista[0].tipo_snapshot == "sin_tarifa"


def test_crear_liquidacion_rechaza_item_si_su_orden_padre_no_esta_pagada(db_session):
    orden = Orden(
        fecha=date.today(),
        numero_orden="ORD-PADRE-PENDIENTE-001",
        estado=EstadoOrden.pendiente,
    )
    db_session.add(orden)
    db_session.flush()

    orden_item = OrdenItem(
        orden_id=orden.id,
        fecha=date.today(),
        numero_orden="ORD-PADRE-PENDIENTE-001",
        finca="Finca Test",
        producto="Producto Test",
        cantidad=Decimal("10"),
        unidad="kg",
        precio_unitario=Decimal("5"),
        total=Decimal("50"),
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden_item)
    db_session.commit()

    import pytest

    with pytest.raises(ValueError, match="Solo se pueden liquidar órdenes en estado pagada"):
        crear_liquidacion(db_session, "Liq inválida", [orden_item.id])


def test_eliminar_liquidacion_restaura_orden_y_items_a_pagada(db_session):
    orden = Orden(
        fecha=date.today(),
        numero_orden="ORD-ELIMINAR-LIQ-001",
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden)
    db_session.flush()

    orden_item = OrdenItem(
        orden_id=orden.id,
        fecha=date.today(),
        numero_orden="ORD-ELIMINAR-LIQ-001",
        finca="Finca Test",
        producto="Producto Test",
        cantidad=Decimal("10"),
        unidad="kg",
        precio_unitario=Decimal("5"),
        total=Decimal("50"),
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden_item)
    db_session.commit()

    liquidacion, _ = crear_liquidacion(db_session, "Liq eliminar", [orden_item.id])
    assert orden.estado == EstadoOrden.liquidada
    assert orden_item.estado == EstadoOrden.liquidada

    eliminar_liquidacion(db_session, liquidacion.id)

    db_session.refresh(orden)
    db_session.refresh(orden_item)
    assert orden.estado == EstadoOrden.pagada
    assert orden_item.estado == EstadoOrden.pagada


def test_restaurar_liquidacion_recrea_orden_y_items_en_pagada(db_session):
    orden = Orden(
        fecha=date.today(),
        numero_orden="ORD-RESTAURAR-LIQ-001",
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden)
    db_session.flush()

    orden_item = OrdenItem(
        orden_id=orden.id,
        fecha=date.today(),
        numero_orden="ORD-RESTAURAR-LIQ-001",
        finca="Finca Test",
        producto="Producto Test",
        cantidad=Decimal("10"),
        unidad="kg",
        precio_unitario=Decimal("5"),
        total=Decimal("50"),
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden_item)
    db_session.commit()

    liquidacion, _ = crear_liquidacion(db_session, "Liq restaurar", [orden_item.id])

    nuevos_ids = restaurar_liquidacion(db_session, liquidacion.id)

    nuevos_items = (
        db_session.query(OrdenItem)
        .filter(OrdenItem.id.in_(nuevos_ids))
        .all()
    )
    assert len(nuevos_items) == 1
    assert nuevos_items[0].estado == EstadoOrden.pagada
    assert nuevos_items[0].orden is not None
    assert nuevos_items[0].orden.estado == EstadoOrden.pagada
