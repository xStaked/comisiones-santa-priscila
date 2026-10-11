from datetime import date
from decimal import Decimal

from app.commands.fusionar_clientes import fusionar
from app.models.cliente import Cliente, ClienteAlias, Finca
from app.models.comisionista import Comisionista, TipoTarifa
from app.models.orden import Orden, OrdenItem
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto

ORIGEN = "TESTEO PALO SANTO"
DESTINO = "INT ISL PALO SANTO"
FINAL = "INTEDECAM ISLA PALO SANTO"
ALIAS = "INT ISL PALO SANTO"


def _base(db_session):
    comisionista = Comisionista(nombre="ASOCIACION INTEDECAM")
    agua = Producto(nombre="AGUA", unidad_comision="kg")
    salud = Producto(nombre="SALUD", unidad_comision="kg")
    origen = Cliente(nombre=ORIGEN, tipo="individual")
    destino = Cliente(nombre=DESTINO, tipo="individual")
    db_session.add_all([comisionista, agua, salud, origen, destino])
    db_session.commit()
    for obj in (comisionista, agua, salud, origen, destino):
        db_session.refresh(obj)
    return comisionista, agua, salud, origen, destino


def test_fusion_mueve_todo_renombra_y_crea_alias(db_session):
    comisionista, agua, salud, origen, destino = _base(db_session)
    db_session.add(
        TarifaClienteProducto(
            comisionista_id=comisionista.id, cliente_id=destino.id,
            producto_id=agua.id, tipo=TipoTarifa.fijo_kg, valor=Decimal("9"),
        )
    )
    db_session.add(
        TarifaClienteProducto(
            comisionista_id=comisionista.id, cliente_id=origen.id,
            producto_id=salud.id, tipo=TipoTarifa.fijo_kg, valor=Decimal("9"),
        )
    )
    db_session.add(Finca(nombre="SECTOR NORTE", cliente_id=origen.id))
    db_session.add(ClienteAlias(cliente_id=origen.id, alias="TESTEO S.A."))
    orden = Orden(
        fecha=date(2026, 1, 5), numero_orden="OC-1", cliente_id=origen.id,
        origen="manual",
    )
    db_session.add(orden)
    db_session.flush()
    db_session.add(
        OrdenItem(
            orden_id=orden.id, fecha=date(2026, 1, 5), numero_orden="OC-1",
            finca="SECTOR NORTE", producto="SALUD", cantidad=Decimal("10"),
            unidad="kg", precio_unitario=Decimal("5"), total=Decimal("50"),
            cliente_id=origen.id,
        )
    )
    db_session.commit()

    resumen = fusionar(db_session, ORIGEN, DESTINO, FINAL, ALIAS, ejecutar=True)

    assert resumen["tarifas_movidas"] == 1
    assert resumen["tarifas_descartadas_por_conflicto"] == []
    assert resumen["fincas_movidas"] == 1
    assert resumen["alias_movidos"] == 1
    assert resumen["ordenes_movidas"] == 1
    assert resumen["items_movidos"] == 1
    assert resumen["destino_renombrado"] == f"{DESTINO} -> {FINAL}"
    assert resumen["alias_creado"] == ALIAS
    assert resumen["origen_eliminado"] == ORIGEN

    # El origen ya no existe y el destino quedó con el nombre completo.
    assert db_session.query(Cliente).filter(Cliente.nombre == ORIGEN).count() == 0
    canonico = db_session.query(Cliente).filter(Cliente.nombre == FINAL).one()
    assert db_session.query(TarifaClienteProducto).filter(
        TarifaClienteProducto.cliente_id == canonico.id
    ).count() == 2
    assert db_session.query(Orden).filter(Orden.cliente_id == canonico.id).count() == 1
    assert db_session.query(OrdenItem).filter(
        OrdenItem.cliente_id == canonico.id
    ).count() == 1
    assert db_session.query(ClienteAlias).filter(
        ClienteAlias.cliente_id == canonico.id,
        ClienteAlias.alias == ALIAS,
    ).count() == 1


def test_fusion_en_conflicto_gana_el_destino(db_session):
    comisionista, agua, _salud, origen, destino = _base(db_session)
    db_session.add(
        TarifaClienteProducto(
            comisionista_id=comisionista.id, cliente_id=destino.id,
            producto_id=agua.id, tipo=TipoTarifa.fijo_kg, valor=Decimal("9"),
        )
    )
    db_session.add(
        TarifaClienteProducto(
            comisionista_id=comisionista.id, cliente_id=origen.id,
            producto_id=agua.id, tipo=TipoTarifa.fijo_kg, valor=Decimal("7"),
        )
    )
    db_session.commit()

    resumen = fusionar(db_session, ORIGEN, DESTINO, FINAL, ALIAS, ejecutar=True)

    assert resumen["tarifas_movidas"] == 0
    assert len(resumen["tarifas_descartadas_por_conflicto"]) == 1
    canonico = db_session.query(Cliente).filter(Cliente.nombre == FINAL).one()
    tarifas = db_session.query(TarifaClienteProducto).filter(
        TarifaClienteProducto.cliente_id == canonico.id
    ).all()
    assert len(tarifas) == 1
    assert tarifas[0].valor == Decimal("9.0000")


def test_fusion_simulacro_no_escribe(db_session):
    _base(db_session)
    resumen = fusionar(db_session, ORIGEN, DESTINO, FINAL, ALIAS, ejecutar=False)

    assert resumen["origen_eliminado"] == ORIGEN
    # Rollback: ambos clientes siguen con sus nombres originales.
    assert db_session.query(Cliente).filter(Cliente.nombre == ORIGEN).count() == 1
    assert db_session.query(Cliente).filter(Cliente.nombre == DESTINO).count() == 1
    assert db_session.query(Cliente).filter(Cliente.nombre == FINAL).count() == 0


def test_fusion_reutiliza_finca_con_igual_nombre(db_session):
    comisionista, agua, _salud, origen, destino = _base(db_session)
    finca_origen = Finca(nombre="Sector Norte", cliente_id=origen.id)
    finca_destino = Finca(nombre="SECTOR NORTE", cliente_id=destino.id)
    db_session.add_all([finca_origen, finca_destino])
    db_session.flush()
    db_session.add(
        TarifaClienteProducto(
            comisionista_id=comisionista.id, cliente_id=origen.id,
            producto_id=agua.id, finca_id=finca_origen.id,
            tipo=TipoTarifa.fijo_kg, valor=Decimal("9"),
        )
    )
    db_session.add(
        OrdenItem(
            orden_id=None, fecha=date(2026, 2, 1), numero_orden="F-1",
            finca="Sector Norte", producto="AGUA", cantidad=Decimal("5"),
            unidad="kg", precio_unitario=Decimal("5"), total=Decimal("25"),
            cliente_id=origen.id, finca_id=finca_origen.id,
        )
    )
    db_session.commit()

    resumen = fusionar(db_session, ORIGEN, DESTINO, FINAL, ALIAS, ejecutar=True)

    assert resumen["fincas_movidas"] == 0
    assert resumen["fincas_reutilizadas"] == ["Sector Norte"]
    assert resumen["tarifas_movidas"] == 1
    canonico = db_session.query(Cliente).filter(Cliente.nombre == FINAL).one()
    # Una sola finca y todo reapuntalado a ella.
    fincas = db_session.query(Finca).filter(Finca.cliente_id == canonico.id).all()
    assert len(fincas) == 1
    tarifa = db_session.query(TarifaClienteProducto).filter(
        TarifaClienteProducto.cliente_id == canonico.id
    ).one()
    assert tarifa.finca_id == fincas[0].id
    item = db_session.query(OrdenItem).filter(
        OrdenItem.cliente_id == canonico.id
    ).one()
    assert item.finca_id == fincas[0].id
