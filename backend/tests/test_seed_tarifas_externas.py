from decimal import Decimal

from app.commands.seed_tarifas_externas import seed_tarifas_externas
from app.models.cliente import Cliente, Finca
from app.models.comisionista import Comisionista, TipoTarifa
from app.models.producto import Producto, ProductoAlias
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.models.user import User
from app.security import get_password_hash


def _seed_catalogo_base(db_session):
    santa = Cliente(
        nombre="Santa Priscila",
        tipo="grupo",
    )
    clientes = [
        santa,
        Cliente(nombre="FRIGOLANDIA", tipo="individual"),
        Cliente(nombre="CAMPONIO", tipo="individual"),
        Cliente(nombre="INTEDECAM", tipo="individual"),
        Cliente(nombre="INTEDECAM ISLA PALO SANTO", tipo="individual"),
        Cliente(nombre="GOLDENSHRIMP", tipo="individual"),
        Cliente(nombre="AQUALITORAL", tipo="individual"),
    ]
    db_session.add_all(clientes)
    db_session.flush()

    for nombre in [
        "AFRICA",
        "ASIA",
        "BAJEN A",
        "BAJEN B",
        "CALIFORNIA A",
        "CALIFORNIA B",
        "CORVINERO A",
        "CORVINERO B",
        "CHANDUY",
        "DAULAR",
        "DAULAR CURAZAO",
        "PAÑAMAO",
        "TAURA A",
        "TAURA B",
        "TAURA C",
        "TAURA D",
    ]:
        db_session.add(Finca(nombre=nombre, cliente_id=santa.id))

    db_session.add_all(
        [
            Producto(nombre="PAST TH", unidad_comision="kg"),
            Producto(
                nombre="ECU-BACILLUS AGUA",
                unidad_comision="tacho",
                tacho_kilos=Decimal("10"),
                peso_por_unidad=Decimal("10"),
            ),
            Producto(
                nombre="ECU-BACILLUS SALUD",
                unidad_comision="tacho",
                tacho_kilos=Decimal("10"),
                peso_por_unidad=Decimal("10"),
            ),
            Producto(
                nombre="ECU-BACILLUS SUELO",
                unidad_comision="tacho",
                tacho_kilos=Decimal("10"),
                peso_por_unidad=Decimal("10"),
            ),
            Producto(nombre="CITRIUS", unidad_comision="litro"),
            Producto(nombre="CALCINIT", unidad_comision="kg"),
            Producto(nombre="NATUXTRACT", unidad_comision="tacho", tacho_kilos=Decimal("15")),
            Producto(nombre="MORTAL C", unidad_comision="litro"),
            Producto(nombre="ECU BACILLUS SUELO PASTILLA", unidad_comision="kg"),
        ]
    )
    db_session.commit()


def test_seed_tarifas_externas_crea_catalogo_faltante_y_tarifas(db_session):
    _seed_catalogo_base(db_session)

    resumen = seed_tarifas_externas(db_session)

    assert resumen["clientes_creados"] == 4
    assert resumen["productos_creados"] == 1
    assert resumen["tarifas_creadas"] > 0
    assert db_session.query(Cliente).filter_by(nombre="EXPALSA").one()
    assert db_session.query(Cliente).filter_by(nombre="PINGUIMAR").one()
    assert db_session.query(Cliente).filter_by(nombre="CAMPROEX").one()
    assert db_session.query(Cliente).filter_by(nombre="PROMARISCO").one()
    assert db_session.query(Producto).filter_by(
        nombre="MORTAL SHELL",
        unidad_comision="litro",
    ).one()


def test_seed_tarifas_externas_crea_tarifas_para_alburquerque(db_session):
    _seed_catalogo_base(db_session)

    seed_tarifas_externas(db_session)

    comisionista = db_session.query(Comisionista).filter_by(nombre="ALBURQUERQUE EDGAR").one()
    producto = db_session.query(Producto).filter_by(nombre="PAST TH").one()
    tarifas = (
        db_session.query(TarifaClienteProducto)
        .filter(
            TarifaClienteProducto.comisionista_id == comisionista.id,
            TarifaClienteProducto.producto_id == producto.id,
        )
        .all()
    )

    assert tarifas
    assert {tarifa.tipo for tarifa in tarifas} == {TipoTarifa.fijo_kg}


def test_seed_tarifas_externas_es_idempotente(db_session):
    _seed_catalogo_base(db_session)

    primero = seed_tarifas_externas(db_session)
    total_primero = db_session.query(TarifaClienteProducto).count()
    segundo = seed_tarifas_externas(db_session)
    total_segundo = db_session.query(TarifaClienteProducto).count()

    assert primero["tarifas_creadas"] > 0
    assert segundo["tarifas_creadas"] == 0
    assert segundo["tarifas_actualizadas"] > 0
    assert total_segundo == total_primero


def test_seed_tarifas_externas_crea_alias_relevantes(db_session):
    _seed_catalogo_base(db_session)

    seed_tarifas_externas(db_session)

    aliases = {
        alias.alias: alias.producto.nombre
        for alias in db_session.query(ProductoAlias).all()
    }
    assert aliases["NATRUXTACT"] == "NATUXTRACT"
    assert aliases["MORTAL CONTROL"] == "MORTAL C"
    assert aliases["NITRATO DED CALCIO"] == "CALCINIT"
    assert aliases["ECU-BACILLUS SUELO-PASTILLA TH"] == "PAST TH"


def test_admin_seed_tarifas_externas_endpoint(client, db_session):
    _seed_catalogo_base(db_session)
    user = User(
        username="admin",
        email="admin@example.com",
        hashed_password=get_password_hash("password"),
        is_active=True,
        is_superuser=True,
    )
    db_session.add(user)
    db_session.commit()

    login = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "password"},
    )
    assert login.status_code == 200
    client.headers.update({"Authorization": f"Bearer {login.json()['access_token']}"})

    response = client.post("/api/v1/admin/seed-tarifas-externas")

    assert response.status_code == 200
    assert response.json()["detail"] == "Tarifas externas cargadas correctamente"
    assert response.json()["tarifas_creadas"] > 0


def test_seed_real_crea_alias_natruxtract_ecucitrius(client, db_session):
    user = User(
        username="admin",
        email="admin@example.com",
        hashed_password=get_password_hash("password"),
        is_active=True,
        is_superuser=True,
    )
    db_session.add(user)
    db_session.commit()

    login = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "password"},
    )
    assert login.status_code == 200
    client.headers.update({"Authorization": f"Bearer {login.json()['access_token']}"})

    response = client.post("/api/v1/admin/seed-real")

    assert response.status_code == 200
    alias = (
        db_session.query(ProductoAlias)
        .filter_by(alias="NATRUXTACT-ECUCITRIUS")
        .one()
    )
    assert alias.producto.nombre == "NATUXTRACT"
