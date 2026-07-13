from datetime import date
from decimal import Decimal

import pytest

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

    # 40 tachos × 10 kg (default) = 400 kg × $1/kg
    assert comision == Decimal("400.00")


def _producto_saco(db_session) -> Producto:
    producto = Producto(
        nombre="CALCINIT", unidad_comision="saco", saco_kilos=Decimal("25")
    )
    db_session.add(producto)
    db_session.flush()
    return producto


def _item_saco(producto: Producto, cantidad: Decimal, unidad: str) -> OrdenItem:
    return OrdenItem(
        fecha=date.today(),
        numero_orden="ORD-SACO-001",
        finca="-",
        producto=producto.nombre,
        producto_id=producto.id,
        cantidad=cantidad,
        unidad=unidad,
        precio_unitario=Decimal("26.50"),
        total=Decimal("265"),
    )


def test_tarifa_por_saco_paga_igual_desde_orden_que_desde_factura(db_session):
    """La tarifa del comisionista es $1 por saco de 25 kg. La orden de compra la
    trae en sacos (10 sacos) y la factura en kilos (250 kg): ambas deben pagar $10."""
    producto = _producto_saco(db_session)
    tarifa = Tarifa(tipo=TipoTarifa.fijo_unidad, valor=Decimal("1.00"))

    desde_orden = _item_saco(producto, Decimal("10"), "sacos")
    desde_factura = _item_saco(producto, Decimal("250"), "kg")
    db_session.add_all([desde_orden, desde_factura])
    db_session.commit()

    assert _calcular_comision_con_tarifa(desde_orden, tarifa) == Decimal("10.00")
    assert _calcular_comision_con_tarifa(desde_factura, tarifa) == Decimal("10.00")


def test_tarifa_fija_kg_sobre_sacos_convierte_a_kilos(db_session):
    """fijo_kg es $/kg incluso cuando la orden viene en sacos: 10 sacos = 250 kg."""
    producto = _producto_saco(db_session)
    orden_item = _item_saco(producto, Decimal("10"), "sacos")
    tarifa = Tarifa(tipo=TipoTarifa.fijo_kg, valor=Decimal("0.04"))
    db_session.add(orden_item)
    db_session.commit()

    # $0.04/kg × 25 kg = $1/saco: equivalente a la tarifa fijo_unidad de arriba.
    assert _calcular_comision_con_tarifa(orden_item, tarifa) == Decimal("10.00")


def test_tarifa_especifica_por_saco_paga_igual_desde_orden_que_desde_factura(db_session):
    cliente = Cliente(nombre="Cliente Saco", tipo="grupo")
    comisionista = Comisionista(nombre="Comisionista Saco")
    producto = _producto_saco(db_session)
    db_session.add_all([cliente, comisionista])
    db_session.flush()

    tarifa = TarifaClienteProducto(
        comisionista_id=comisionista.id,
        cliente_id=cliente.id,
        producto_id=producto.id,
        tipo=TipoTarifa.fijo_unidad,
        valor=Decimal("1.00"),
    )
    desde_orden = _item_saco(producto, Decimal("10"), "sacos")
    desde_factura = _item_saco(producto, Decimal("250"), "kg")
    db_session.add_all([desde_orden, desde_factura])
    db_session.commit()

    assert _calcular_comision_especifica(db_session, desde_orden, tarifa) == Decimal("10.00")
    assert _calcular_comision_especifica(db_session, desde_factura, tarifa) == Decimal("10.00")


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


def test_buscar_tarifa_especifica_trata_cualquier_proveedor_como_comodin(db_session):
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
        proveedor="Cualquier proveedor",
    )

    orden = Orden(
        fecha=date.today(),
        numero_orden="ORD-003-A",
        proveedor="Dinacuamar",
    )
    db_session.add(orden)
    db_session.flush()

    orden_item = OrdenItem(
        orden_id=orden.id,
        fecha=date.today(),
        numero_orden="ORD-003-A",
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


def test_buscar_tarifa_especifica_encuentra_tarifa_en_producto_legado_equivalente(db_session):
    cliente = Cliente(nombre="Cliente Test", tipo="grupo")
    comisionista = Comisionista(nombre="Comisionista Test")
    producto_canonico = Producto(nombre="NATUXTRACT", unidad_comision="tacho")
    producto_legado = Producto(nombre="NATUXTRACT-ECUCITRIUS", unidad_comision="tacho")
    db_session.add_all([cliente, comisionista, producto_canonico, producto_legado])
    db_session.flush()

    tarifa = TarifaClienteProducto(
        comisionista_id=comisionista.id,
        cliente_id=cliente.id,
        producto_id=producto_legado.id,
        finca_id=None,
        tipo=TipoTarifa.fijo_kg,
        valor=Decimal("1.00"),
        proveedor="",
    )

    orden = Orden(
        fecha=date.today(),
        numero_orden="ORD-003-B",
        proveedor="Dinacuamar",
    )
    db_session.add(orden)
    db_session.flush()

    orden_item = OrdenItem(
        orden_id=orden.id,
        fecha=date.today(),
        numero_orden="ORD-003-B",
        finca="-",
        producto="NATRUXTACT-ECUCITRIUS",
        cantidad=Decimal("10"),
        unidad="tachos",
        precio_unitario=Decimal("5"),
        total=Decimal("50"),
        cliente_id=cliente.id,
        producto_id=producto_canonico.id,
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


def test_liquidacion_parcial_mantiene_orden_pagada_hasta_liquidar_todos_los_items(db_session):
    orden = Orden(
        fecha=date.today(),
        numero_orden="ORD-LIQ-PARCIAL-001",
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden)
    db_session.flush()

    item_uno = OrdenItem(
        orden_id=orden.id,
        fecha=date.today(),
        numero_orden="ORD-LIQ-PARCIAL-001",
        finca="Finca A",
        producto="Producto A",
        cantidad=Decimal("10"),
        unidad="kg",
        precio_unitario=Decimal("5"),
        total=Decimal("50"),
        estado=EstadoOrden.pagada,
    )
    item_dos = OrdenItem(
        orden_id=orden.id,
        fecha=date.today(),
        numero_orden="ORD-LIQ-PARCIAL-001",
        finca="Finca B",
        producto="Producto B",
        cantidad=Decimal("20"),
        unidad="kg",
        precio_unitario=Decimal("3"),
        total=Decimal("60"),
        estado=EstadoOrden.pagada,
    )
    db_session.add_all([item_uno, item_dos])
    db_session.commit()

    primera_liquidacion, _ = crear_liquidacion(
        db_session,
        "Liq parcial 1",
        [item_uno.id],
    )

    db_session.refresh(orden)
    db_session.refresh(item_uno)
    db_session.refresh(item_dos)
    assert primera_liquidacion.id is not None
    assert orden.estado == EstadoOrden.pagada
    assert item_uno.estado == EstadoOrden.liquidada
    assert item_dos.estado == EstadoOrden.pagada

    segunda_liquidacion, _ = crear_liquidacion(
        db_session,
        "Liq parcial 2",
        [item_dos.id],
    )

    db_session.refresh(orden)
    db_session.refresh(item_dos)
    assert segunda_liquidacion.id is not None
    assert orden.estado == EstadoOrden.liquidada
    assert item_dos.estado == EstadoOrden.liquidada


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


def _setup_umbral(db_session, umbral, valor_sobre_umbral):
    cliente = Cliente(nombre="Cliente Umbral", tipo="individual", retencion_porcentaje=Decimal("1.75"))
    comisionista = Comisionista(nombre="NARANJO")
    producto = Producto(nombre="Producto Umbral", unidad_comision="kg")
    db_session.add_all([cliente, comisionista, producto])
    db_session.flush()
    tarifa = TarifaClienteProducto(
        comisionista_id=comisionista.id,
        cliente_id=cliente.id,
        producto_id=producto.id,
        tipo=TipoTarifa.porcentaje,
        valor=Decimal("2"),
        umbral_kg=umbral,
        valor_sobre_umbral=valor_sobre_umbral,
    )
    db_session.add(tarifa)
    return cliente, comisionista, producto


def _orden_pagada(db_session, cliente, producto, comisionista, numero, cantidad_kg):
    orden = Orden(fecha=date.today(), numero_orden=numero, origen="manual", estado=EstadoOrden.pagada)
    db_session.add(orden)
    db_session.flush()
    oi = OrdenItem(
        orden_id=orden.id, fecha=date.today(), numero_orden=numero,
        finca="-", producto=producto.nombre, cantidad=cantidad_kg, unidad="kg",
        precio_unitario=Decimal("1"), total=cantidad_kg,
        estado=EstadoOrden.pagada, cliente_id=cliente.id, producto_id=producto.id,
    )
    db_session.add(oi)
    db_session.flush()
    db_session.add(Asignacion(orden_item_id=oi.id, comisionista_id=comisionista.id))
    return oi


def test_umbral_alcanzado_aplica_valor_sobre_umbral(db_session):
    cliente, comisionista, producto = _setup_umbral(db_session, Decimal("1000"), Decimal("3.50"))
    i1 = _orden_pagada(db_session, cliente, producto, comisionista, "UMB-1", Decimal("600"))
    i2 = _orden_pagada(db_session, cliente, producto, comisionista, "UMB-2", Decimal("600"))
    db_session.commit()

    liq, _ = crear_liquidacion(db_session, "Liquidación umbral", [i1.id, i2.id])

    tarifas = [t for li in liq.items for t in li.tarifas]
    assert len(tarifas) == 2
    # 1200 kg acumulados >= 1000 → toda la comisión a 3.50 $/kg
    assert all(t.tipo_snapshot == "fijo_kg" for t in tarifas)
    assert all(t.valor_snapshot == Decimal("3.50") for t in tarifas)
    assert sum(t.comision_calculada for t in tarifas) == Decimal("4200.00")


def test_umbral_no_alcanzado_usa_tarifa_normal(db_session):
    cliente, comisionista, producto = _setup_umbral(db_session, Decimal("1000"), Decimal("3.50"))
    i1 = _orden_pagada(db_session, cliente, producto, comisionista, "UMB-3", Decimal("400"))
    db_session.commit()

    liq, _ = crear_liquidacion(db_session, "Liquidación sin umbral", [i1.id])

    tarifas = [t for li in liq.items for t in li.tarifas]
    assert len(tarifas) == 1
    # 400 kg < 1000 → tarifa porcentaje normal: 400 * (1 - 1.75%) * 2% = 7.86
    assert tarifas[0].tipo_snapshot == "porcentaje"
    assert tarifas[0].comision_calculada == Decimal("400") * (Decimal("1") - Decimal("0.0175")) * Decimal("0.02")


def test_liquida_por_persona_en_la_misma_orden(db_session):
    """Dos comisionistas en la misma factura se liquidan por separado y en fechas distintas."""
    cliente = Cliente(nombre="Cliente Persona", tipo="grupo")
    ana = Comisionista(nombre="ANA", tarifas=[Tarifa(tipo=TipoTarifa.fijo_kg, valor=Decimal("1"))])
    beto = Comisionista(nombre="BETO", tarifas=[Tarifa(tipo=TipoTarifa.fijo_kg, valor=Decimal("2"))])
    producto = Producto(nombre="Producto Persona", unidad_comision="kg")
    db_session.add_all([cliente, ana, beto, producto])
    db_session.flush()

    orden = Orden(fecha=date.today(), numero_orden="OC-DUO", origen="manual", estado=EstadoOrden.pagada)
    db_session.add(orden)
    db_session.flush()
    oi = OrdenItem(
        orden_id=orden.id, fecha=date.today(), numero_orden="OC-DUO",
        finca="-", producto=producto.nombre, cantidad=Decimal("100"), unidad="kg",
        precio_unitario=Decimal("1"), total=Decimal("100"),
        estado=EstadoOrden.pagada, cliente_id=cliente.id, producto_id=producto.id,
    )
    db_session.add(oi)
    db_session.flush()
    db_session.add_all([
        Asignacion(orden_item_id=oi.id, comisionista_id=ana.id),
        Asignacion(orden_item_id=oi.id, comisionista_id=beto.id),
    ])
    db_session.commit()

    # Junio: se liquida solo a ANA.
    liq_ana, _ = crear_liquidacion(db_session, "Junio ANA", [oi.id], [ana.id])
    tarifas_ana = [t for li in liq_ana.items for t in li.tarifas]
    assert [t.comisionista_nombre_snapshot for t in tarifas_ana] == ["ANA"]
    assert tarifas_ana[0].comision_calculada == Decimal("100")
    # El ítem sigue pagado: BETO aún no cobra.
    db_session.refresh(oi)
    assert oi.estado == EstadoOrden.pagada
    assert orden.estado == EstadoOrden.pagada

    # Septiembre: se liquida a BETO sobre la misma orden.
    liq_beto, _ = crear_liquidacion(db_session, "Septiembre BETO", [oi.id], [beto.id])
    tarifas_beto = [t for li in liq_beto.items for t in li.tarifas]
    assert [t.comisionista_nombre_snapshot for t in tarifas_beto] == ["BETO"]
    assert tarifas_beto[0].comision_calculada == Decimal("200")

    # Ya no queda nadie pendiente → el ítem y la orden quedan liquidados.
    db_session.refresh(oi)
    db_session.refresh(orden)
    assert oi.estado == EstadoOrden.liquidada
    assert orden.estado == EstadoOrden.liquidada


def test_no_reliquida_al_mismo_comisionista(db_session):
    """El ítem sigue pagado (BETO pendiente), pero ANA ya cobró: no se le paga dos veces."""
    cliente = Cliente(nombre="Cliente Doble", tipo="grupo")
    ana = Comisionista(nombre="ANA2", tarifas=[Tarifa(tipo=TipoTarifa.fijo_kg, valor=Decimal("1"))])
    beto = Comisionista(nombre="BETO2", tarifas=[Tarifa(tipo=TipoTarifa.fijo_kg, valor=Decimal("1"))])
    producto = Producto(nombre="Producto Doble", unidad_comision="kg")
    db_session.add_all([cliente, ana, beto, producto])
    db_session.flush()
    oi = _orden_pagada(db_session, cliente, producto, ana, "OC-DOBLE", Decimal("50"))
    db_session.add(Asignacion(orden_item_id=oi.id, comisionista_id=beto.id))
    db_session.commit()

    crear_liquidacion(db_session, "Primera", [oi.id], [ana.id])

    with pytest.raises(ValueError, match="pendientes"):
        crear_liquidacion(db_session, "Segunda", [oi.id], [ana.id])


def test_eliminar_liquidacion_devuelve_asignacion_a_pendiente(db_session):
    cliente = Cliente(nombre="Cliente Reversa", tipo="grupo")
    ana = Comisionista(nombre="ANA3", tarifas=[Tarifa(tipo=TipoTarifa.fijo_kg, valor=Decimal("1"))])
    producto = Producto(nombre="Producto Reversa", unidad_comision="kg")
    db_session.add_all([cliente, ana, producto])
    db_session.flush()
    oi = _orden_pagada(db_session, cliente, producto, ana, "OC-REV", Decimal("50"))
    db_session.commit()

    liq, _ = crear_liquidacion(db_session, "A revertir", [oi.id], [ana.id])
    eliminar_liquidacion(db_session, liq.id)

    asignacion = db_session.query(Asignacion).filter(Asignacion.orden_item_id == oi.id).one()
    assert asignacion.liquidacion_id is None
    db_session.refresh(oi)
    assert oi.estado == EstadoOrden.pagada


def test_factura_en_kg_no_se_multiplica_por_tacho_kilos(db_session):
    """Las facturas vienen en kg aunque el producto se venda por tacho en las OC."""
    producto = Producto(
        nombre="ECU-BACILLUS SUELO PASTILLA TH",
        unidad_comision="tacho",
        tacho_kilos=Decimal("10"),
    )
    db_session.add(producto)
    db_session.flush()

    def _item(cantidad: str, unidad: str) -> OrdenItem:
        return OrdenItem(
            fecha=date.today(),
            numero_orden="2209",
            finca="-",
            producto="ECU-BACILLUS SUELO PASTILLA TH",
            producto_id=producto.id,
            cantidad=Decimal(cantidad),
            unidad=unidad,
            precio_unitario=Decimal("65"),
            total=Decimal(cantidad) * Decimal("65"),
        )

    factura = _item("80", "kg")
    orden = _item("26", "tachos")
    db_session.add_all([factura, orden])
    db_session.commit()

    tarifa = Tarifa(tipo=TipoTarifa.fijo_kg, valor=Decimal("1.00"))
    # 80 kg son 80 kg, no 800.
    assert _calcular_comision_con_tarifa(factura, tarifa) == Decimal("80.00")
    # La orden en tachos sí convierte: 26 × 10 kg.
    assert _calcular_comision_con_tarifa(orden, tarifa) == Decimal("260.00")
