from datetime import date
from decimal import Decimal

from app.commands.seed_reglas_comision import aplicar_reglas_comision
from app.models.cliente import Cliente
from app.models.comisionista import Comisionista, Tarifa, TipoTarifa
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto


CLIENTES_LUIS = [
    "FRIGOLANDIA",
    "PLUMONT - EXPALSA",
    "FILACAS - EXPALSA",
    "CALIMMO - EXPALSA",
]
PRODUCTOS_LUIS = [
    "PAST TH",
    "ECU BACILLUS SUELO PASTILLA",
    "PAST ALIM",
    "ECU-BACILLUS SALUD",
    "ECU-BACILLUS AGUA",
    "ECU-BACILLUS SUELO",
]


def _crear_catalogo_luis(db_session):
    clientes = [Cliente(nombre=nombre, tipo="individual") for nombre in CLIENTES_LUIS]
    productos = [Producto(nombre=nombre, unidad_comision="kg") for nombre in PRODUCTOS_LUIS]
    db_session.add_all(clientes + productos)
    db_session.flush()
    return clientes, productos


def test_carga_tarifas_externas_de_luis_y_cierra_las_antiguas(db_session):
    luis = Comisionista(nombre="CASTRO")
    tarifa_antigua = Tarifa(comisionista=luis, tipo=TipoTarifa.porcentaje, valor=Decimal("2"))
    clientes, productos = _crear_catalogo_luis(db_session)
    db_session.add_all([luis, tarifa_antigua])
    db_session.commit()

    resultado = aplicar_reglas_comision(db_session)
    tarifas = db_session.query(TarifaClienteProducto).filter(
        TarifaClienteProducto.comisionista_id == luis.id
    ).all()

    assert resultado["tarifas_luis_creadas"] == 24
    assert len(tarifas) == 24
    assert tarifa_antigua.vigente_hasta == date(2026, 7, 31)
    assert {tarifa.valor for tarifa in tarifas} == {Decimal("5")}
    assert {tarifa.cliente_id for tarifa in tarifas} == {cliente.id for cliente in clientes}
    assert {tarifa.producto_id for tarifa in tarifas} == {producto.id for producto in productos}
    assert all(tarifa.vigente_desde == date(2026, 8, 1) for tarifa in tarifas)


def test_carga_externa_de_luis_es_idempotente(db_session):
    luis = Comisionista(nombre="LUIS CASTRO")
    clientes, productos = _crear_catalogo_luis(db_session)
    db_session.add(luis)
    db_session.commit()

    aplicar_reglas_comision(db_session)
    segunda_ejecucion = aplicar_reglas_comision(db_session)
    tarifas = db_session.query(TarifaClienteProducto).filter(
        TarifaClienteProducto.comisionista_id == luis.id
    ).all()

    assert segunda_ejecucion["tarifas_luis_creadas"] == 0
    assert len(tarifas) == 24


def test_configura_umbral_de_junior_en_productos_bacterias(db_session):
    cliente = Cliente(nombre="Cliente Junior", tipo="individual")
    junior = Comisionista(nombre="NARANJO JUNIOR")
    producto = Producto(nombre="ECU-BACILLUS PASTILLAS TH", unidad_comision="kg")
    tarifa = TarifaClienteProducto(
        comisionista=junior,
        cliente=cliente,
        producto=producto,
        tipo=TipoTarifa.fijo_kg,
        valor=Decimal("3"),
    )
    db_session.add_all([cliente, junior, producto, tarifa])
    db_session.commit()

    resultado = aplicar_reglas_comision(db_session)

    assert resultado["tarifas_junior_actualizadas"] == 1
    assert tarifa.umbral_kg == Decimal("1000")
    assert tarifa.valor_sobre_umbral == Decimal("3.50")
