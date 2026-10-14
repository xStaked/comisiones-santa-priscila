from datetime import date
from decimal import Decimal

from app.commands.seed_reglas_comision import aplicar_reglas_comision
from app.models.cliente import Cliente
from app.models.comisionista import Comisionista, Tarifa, TipoTarifa
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto


def test_copia_tarifas_de_luis_con_vigencia_y_cinco_por_ciento(db_session):
    luis = Comisionista(nombre="CASTRO")
    tarifa = Tarifa(comisionista=luis, tipo=TipoTarifa.porcentaje, valor=Decimal("2"))
    db_session.add_all([luis, tarifa])
    db_session.commit()

    resultado = aplicar_reglas_comision(db_session)
    tarifas = db_session.query(Tarifa).filter(Tarifa.comisionista_id == luis.id).all()

    assert resultado["tarifas_luis_creadas"] == 1
    assert len(tarifas) == 2
    original = next(t for t in tarifas if t.vigente_desde is None)
    externa = next(t for t in tarifas if t.vigente_desde == date(2026, 8, 1))
    assert original.valor == Decimal("2")
    assert original.vigente_hasta == date(2026, 7, 31)
    assert externa.valor == Decimal("5")
    assert externa.vigente_hasta is None

    segunda_ejecucion = aplicar_reglas_comision(db_session)
    tarifas_despues = db_session.query(Tarifa).filter(Tarifa.comisionista_id == luis.id).all()

    assert segunda_ejecucion["tarifas_luis_creadas"] == 0
    assert len(tarifas_despues) == 2



def test_copia_tarifa_especifica_conserva_alcance_y_exclusiones(db_session):
    cliente = Cliente(nombre="Cliente Específico", tipo="individual")
    luis = Comisionista(nombre="LUIS CASTRO")
    producto = Producto(nombre="Producto Específico", unidad_comision="kg")
    tarifa = TarifaClienteProducto(
        comisionista=luis,
        cliente=cliente,
        producto=producto,
        proveedor="Proveedor A",
        proveedores_excluidos=["Proveedor B"],
        tipo=TipoTarifa.porcentaje,
        valor=Decimal("2"),
    )
    db_session.add_all([cliente, luis, producto, tarifa])
    db_session.commit()

    aplicar_reglas_comision(db_session)
    copia = db_session.query(TarifaClienteProducto).filter(
        TarifaClienteProducto.comisionista_id == luis.id,
        TarifaClienteProducto.vigente_desde == date(2026, 8, 1),
    ).one()

    assert copia.cliente_id == tarifa.cliente_id
    assert copia.producto_id == tarifa.producto_id
    assert copia.proveedor == "Proveedor A"
    assert copia.proveedores_excluidos == ["Proveedor B"]
    assert copia.valor == Decimal("5")


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
