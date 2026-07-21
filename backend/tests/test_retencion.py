from datetime import date
from decimal import Decimal

from app.models.cliente import Cliente
from app.models.comisionista import Comisionista, TipoTarifa
from app.models.orden import Asignacion, EstadoOrden, Orden, OrdenItem
from app.models.producto import Producto
from app.models.retencion import Retencion
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.liquidacion import _calcular_comision_especifica, crear_liquidacion
from app.services.retencion import cargar_periodos, retencion_para


def _sembrar_periodos(db_session):
    """Los mismos tramos que siembra la migración."""
    db_session.add_all([
        Retencion(vigente_desde=date(1900, 1, 1), porcentaje=Decimal("1.75")),
        Retencion(vigente_desde=date(2026, 3, 1), porcentaje=Decimal("2.00")),
    ])
    db_session.commit()


def test_persiste_un_periodo_de_retencion(db_session):
    periodo = Retencion(vigente_desde=date(2026, 3, 1), porcentaje=Decimal("2.00"))
    db_session.add(periodo)
    db_session.commit()

    guardado = db_session.query(Retencion).one()

    assert guardado.vigente_desde == date(2026, 3, 1)
    assert guardado.porcentaje == Decimal("2.00")
    assert guardado.id is not None


def test_carga_periodos_del_mas_reciente_al_mas_antiguo(db_session):
    _sembrar_periodos(db_session)

    periodos = cargar_periodos(db_session)

    assert [p.vigente_desde for p in periodos] == [date(2026, 3, 1), date(1900, 1, 1)]


def test_factura_del_ultimo_dia_de_febrero_retiene_1_75(db_session):
    _sembrar_periodos(db_session)
    periodos = cargar_periodos(db_session)

    assert retencion_para(periodos, date(2026, 2, 28)) == Decimal("1.75")


def test_factura_del_primer_dia_de_marzo_retiene_2(db_session):
    """El borde exacto entre tramos: `vigente_desde` es inclusivo."""
    _sembrar_periodos(db_session)
    periodos = cargar_periodos(db_session)

    assert retencion_para(periodos, date(2026, 3, 1)) == Decimal("2.00")


def test_factura_posterior_al_ultimo_tramo_usa_ese_tramo(db_session):
    _sembrar_periodos(db_session)
    periodos = cargar_periodos(db_session)

    assert retencion_para(periodos, date(2027, 12, 31)) == Decimal("2.00")


def test_sin_periodos_registrados_cae_al_valor_por_defecto(db_session):
    assert retencion_para([], date(2026, 5, 1)) == Decimal("1.75")


def _armar_escenario(db_session, fecha_factura):
    """Factura de $1000 con una tarifa específica del 10% sobre la base."""
    cliente = Cliente(nombre="FAGUILL", tipo="individual")
    comisionista = Comisionista(nombre="CASTRO")
    producto = Producto(nombre="ECU-BACILLUS", unidad_comision="kg")
    db_session.add_all([cliente, comisionista, producto])
    db_session.flush()

    tarifa = TarifaClienteProducto(
        comisionista_id=comisionista.id,
        cliente_id=cliente.id,
        producto_id=producto.id,
        tipo=TipoTarifa.porcentaje,
        valor=Decimal("10"),
    )
    orden_item = OrdenItem(
        fecha=fecha_factura,
        numero_orden="F-001",
        finca="-",
        producto=producto.nombre,
        producto_id=producto.id,
        cliente_id=cliente.id,
        cantidad=Decimal("100"),
        unidad="kg",
        precio_unitario=Decimal("10"),
        total=Decimal("1000"),
    )
    db_session.add_all([tarifa, orden_item])
    db_session.commit()
    return orden_item, tarifa


def test_comision_porcentaje_usa_retencion_de_febrero(db_session):
    """Base = 1000 * (1 - 1.75%) = 982.50 → comisión 10% = 98.25"""
    _sembrar_periodos(db_session)
    orden_item, tarifa = _armar_escenario(db_session, date(2026, 2, 28))

    comision = _calcular_comision_especifica(db_session, orden_item, tarifa)

    assert comision == Decimal("98.250")


def test_comision_porcentaje_usa_retencion_de_marzo(db_session):
    """Base = 1000 * (1 - 2%) = 980.00 → comisión 10% = 98.00"""
    _sembrar_periodos(db_session)
    orden_item, tarifa = _armar_escenario(db_session, date(2026, 3, 1))

    comision = _calcular_comision_especifica(db_session, orden_item, tarifa)

    assert comision == Decimal("98.000")


def test_tarifa_fijo_kg_no_se_ve_afectada_por_la_retencion(db_session):
    _sembrar_periodos(db_session)
    orden_item, tarifa = _armar_escenario(db_session, date(2026, 3, 1))
    tarifa.tipo = TipoTarifa.fijo_kg
    tarifa.valor = Decimal("0.05")
    db_session.commit()

    # 100 kg * 0.05 = 5, sin importar el tramo de retención.
    assert _calcular_comision_especifica(db_session, orden_item, tarifa) == Decimal("5.00")


def test_snapshot_congela_la_retencion_de_la_fecha_de_la_factura(db_session):
    """La factura es de febrero; se liquida hoy (con 2% vigente). El snapshot
    debe guardar 1.75, no 2."""
    _sembrar_periodos(db_session)
    orden_item, _ = _armar_escenario(db_session, date(2026, 2, 20))

    orden = Orden(
        fecha=date(2026, 2, 20),
        numero_orden="F-001",
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden)
    db_session.flush()
    orden_item.orden_id = orden.id
    orden_item.estado = EstadoOrden.pagada
    comisionista = db_session.query(Comisionista).one()
    db_session.add(
        Asignacion(orden_item_id=orden_item.id, comisionista_id=comisionista.id)
    )
    db_session.commit()

    liquidacion, _ = crear_liquidacion(db_session, "Liq feb", [orden_item.id])

    item = liquidacion.items[0]
    assert item.retencion_porcentaje_snapshot == Decimal("1.75")
