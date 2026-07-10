from datetime import date
from decimal import Decimal

from app.models.cliente import Cliente, ClienteAlias, Finca
from app.models.comisionista import Comisionista, TipoTarifa
from app.models.producto import Producto, ProductoAlias
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.order_extraction_models import OrdenItemValidado, OrdenValidada
from app.services.order_extraction_normalizer import _buscar_cliente, normalizar_orden_extraida
from app.services.pdf_extractor import _debe_usar_extraccion_ia


def _crear_orden(cliente: str, finca: str, producto: str) -> OrdenValidada:
    return OrdenValidada(
        fecha=date(2026, 5, 14),
        numeroOrden="93133",
        proveedor="DINACUAMAR",
        cliente=cliente,
        finca=finca,
        semana="15",
        items=[
            OrdenItemValidado(
                fecha=date(2026, 5, 14),
                numeroOrden="93133",
                finca=finca,
                producto=producto,
                cantidad=Decimal("20"),
                unidad="kg",
                precioUnitario=Decimal("65"),
                total=Decimal("1300"),
                clienteTexto=cliente,
            )
        ],
    )


def _crear_tarifa(
    comisionista: Comisionista,
    cliente: Cliente,
    producto: Producto,
    finca: Finca | None = None,
    activo: bool = True,
) -> TarifaClienteProducto:
    return TarifaClienteProducto(
        comisionista_id=comisionista.id,
        cliente_id=cliente.id,
        producto_id=producto.id,
        finca_id=finca.id if finca else None,
        tipo=TipoTarifa.porcentaje,
        valor=Decimal("2.5"),
        activo=activo,
    )


def test_normaliza_cliente_finca_producto_por_match_exacto(db_session):
    cliente = Cliente(
        nombre="FILACAS SA",
        tipo="grupo",
        retencion_porcentaje=Decimal("1.75"),
    )
    db_session.add(cliente)
    db_session.commit()
    db_session.refresh(cliente)

    finca = Finca(nombre="EL MORRO", cliente_id=cliente.id)
    producto = Producto(nombre="ECUBACILLUS TH", unidad_comision="kg")
    db_session.add_all([finca, producto])
    db_session.commit()
    db_session.refresh(finca)
    db_session.refresh(producto)

    orden = OrdenValidada(
        fecha=date(2026, 5, 14),
        numeroOrden="2199",
        proveedor="DINACUAMAR",
        cliente="filacas sa",
        finca="el morro",
        semana="",
        items=[
            OrdenItemValidado(
                fecha=date(2026, 5, 14),
                numeroOrden="2199",
                finca="el morro",
                producto="ecubacillus th",
                cantidad=Decimal("20"),
                unidad="kg",
                precioUnitario=Decimal("65"),
                total=Decimal("1300"),
                clienteTexto="filacas sa",
            )
        ],
    )

    normalizada = normalizar_orden_extraida(db_session, orden)

    item = normalizada.items[0]
    assert item.clienteId == str(cliente.id)
    assert item.fincaId == str(finca.id)
    assert item.productoId == str(producto.id)
    assert item.finca == "EL MORRO"
    assert item.producto == "ECUBACILLUS TH"


def test_no_inventa_ids_si_no_hay_match(db_session):
    orden = OrdenValidada(
        fecha=date(2026, 5, 14),
        numeroOrden="2199",
        proveedor="DINACUAMAR",
        cliente="CLIENTE NUEVO",
        finca="FINCA NUEVA",
        semana="",
        items=[
            OrdenItemValidado(
                fecha=date(2026, 5, 14),
                numeroOrden="2199",
                finca="FINCA NUEVA",
                producto="PRODUCTO NUEVO",
                cantidad=Decimal("1"),
                unidad="kg",
                precioUnitario=Decimal("1"),
                total=Decimal("1"),
            )
        ],
    )

    normalizada = normalizar_orden_extraida(db_session, orden)

    item = normalizada.items[0]
    assert item.clienteId is None
    assert item.fincaId is None
    assert item.productoId is None
    # No inventamos un sector que no existe: la dirección extraída se descarta.
    assert item.finca == "-"


def test_descarta_sector_extraido_sin_match(db_session):
    """La factura trae la dirección como 'finca'; si el cliente no tiene ese sector
    registrado no debe quedar como sector del ítem."""
    cliente = Cliente(nombre="INTEDECAM", tipo="externo", retencion_porcentaje=Decimal("1.75"))
    db_session.add(cliente)
    db_session.commit()

    orden = _crear_orden(
        "INTEDECAM",
        "GUAYAS / DURAN / ELOY ALFARO (DURAN) / URB. LAS BRISAS SL.18A MZ A3",
        "PRODUCTO NUEVO",
    )

    normalizada = normalizar_orden_extraida(db_session, orden)

    item = normalizada.items[0]
    assert item.fincaId is None
    assert item.finca == "-"


def test_asigna_finca_global_unica_sin_cliente(db_session):
    cliente = Cliente(
        nombre="CLIENTE UNO",
        tipo="grupo",
        retencion_porcentaje=Decimal("1.75"),
    )
    db_session.add(cliente)
    db_session.commit()
    db_session.refresh(cliente)

    finca = Finca(nombre="EL MORRO", cliente_id=cliente.id)
    db_session.add(finca)
    db_session.commit()
    db_session.refresh(finca)

    orden = OrdenValidada(
        fecha=date(2026, 5, 14),
        numeroOrden="2199",
        proveedor="DINACUAMAR",
        cliente="CLIENTE DESCONOCIDO",
        finca="",
        semana="",
        items=[
            OrdenItemValidado(
                fecha=date(2026, 5, 14),
                numeroOrden="2199",
                finca="EL MORRO",
                producto="PRODUCTO NUEVO",
                cantidad=Decimal("1"),
                unidad="kg",
                precioUnitario=Decimal("1"),
                total=Decimal("1"),
            )
        ],
    )

    normalizada = normalizar_orden_extraida(db_session, orden)

    item = normalizada.items[0]
    assert item.fincaId == str(finca.id)
    assert item.clienteId == str(cliente.id)


def test_no_asigna_finca_global_ambigua_sin_cliente(db_session):
    cliente_uno = Cliente(
        nombre="CLIENTE UNO",
        tipo="grupo",
        retencion_porcentaje=Decimal("1.75"),
    )
    cliente_dos = Cliente(
        nombre="CLIENTE DOS",
        tipo="grupo",
        retencion_porcentaje=Decimal("1.75"),
    )
    db_session.add_all([cliente_uno, cliente_dos])
    db_session.commit()
    db_session.refresh(cliente_uno)
    db_session.refresh(cliente_dos)

    db_session.add_all(
        [
            Finca(nombre="EL MORRO", cliente_id=cliente_uno.id),
            Finca(nombre="EL MORRO", cliente_id=cliente_dos.id),
        ]
    )
    db_session.commit()

    orden = OrdenValidada(
        fecha=date(2026, 5, 14),
        numeroOrden="2199",
        proveedor="DINACUAMAR",
        cliente="CLIENTE DESCONOCIDO",
        finca="",
        semana="",
        items=[
            OrdenItemValidado(
                fecha=date(2026, 5, 14),
                numeroOrden="2199",
                finca="EL MORRO",
                producto="PRODUCTO NUEVO",
                cantidad=Decimal("1"),
                unidad="kg",
                precioUnitario=Decimal("1"),
                total=Decimal("1"),
            )
        ],
    )

    normalizada = normalizar_orden_extraida(db_session, orden)

    item = normalizada.items[0]
    assert item.fincaId is None
    assert item.clienteId is None


def test_normaliza_goldo_administracion_y_ecu_bacillus_pastilla_th(db_session):
    cliente = Cliente(nombre="Santa Priscila", tipo="grupo")
    db_session.add(cliente)
    db_session.flush()

    finca = Finca(nombre="GOLFO", cliente_id=cliente.id)
    producto = Producto(nombre="PAST TH", unidad_comision="kg")
    db_session.add_all([finca, producto])
    db_session.commit()

    orden = OrdenValidada(
        fecha=date(2026, 5, 14),
        numeroOrden="93188",
        proveedor="DINACUAMAR",
        cliente="Santa Priscila",
        finca="",
        semana="15",
        items=[
            OrdenItemValidado(
                fecha=date(2026, 5, 14),
                numeroOrden="93188",
                finca="goldo-administracion",
                producto="ECU-BACILLUS SUELO-PASTILLA TH",
                cantidad=Decimal("5"),
                unidad="kg",
                precioUnitario=Decimal("10"),
                total=Decimal("50"),
            )
        ],
    )

    normalizada = normalizar_orden_extraida(db_session, orden)

    item = normalizada.items[0]
    assert item.clienteId == str(cliente.id)
    assert item.fincaId == str(finca.id)
    assert item.productoId == str(producto.id)
    assert item.finca == "GOLFO"
    assert item.producto == "PAST TH"


def test_asigna_varios_comisionistas_activos_por_cliente_producto_y_finca(db_session):
    cliente = Cliente(nombre="SANTA PRISCILA", tipo="grupo")
    finca = Finca(nombre="GOLFO", cliente=cliente)
    producto = Producto(nombre="ECU-BACILLUS", unidad_comision="kg")
    comisionista_uno = Comisionista(nombre="COMISIONISTA UNO")
    comisionista_dos = Comisionista(nombre="COMISIONISTA DOS")
    db_session.add_all([cliente, finca, producto, comisionista_uno, comisionista_dos])
    db_session.flush()
    db_session.add_all(
        [
            _crear_tarifa(comisionista_uno, cliente, producto, finca),
            _crear_tarifa(comisionista_dos, cliente, producto, finca),
        ]
    )
    db_session.commit()

    normalizada = normalizar_orden_extraida(
        db_session,
        _crear_orden("SANTA PRISCILA", "GOLFO", "ECU-BACILLUS"),
    )

    assert {
        comisionista["comisionistaId"]
        for comisionista in normalizada.items[0].comisionistas
    } == {
        str(comisionista_uno.id),
        str(comisionista_dos.id),
    }


def test_asigna_comisionista_cuando_tarifa_tiene_cualquier_proveedor(db_session):
    cliente = Cliente(nombre="SANTA PRISCILA", tipo="grupo")
    finca = Finca(nombre="TAURA D", cliente=cliente)
    producto_canonico = Producto(
        nombre="NATUXTRACT",
        unidad_comision="tacho",
        tacho_kilos=Decimal("15"),
    )
    producto_legado = Producto(
        nombre="NATUXTRACT-ECUCITRIUS",
        unidad_comision="tacho",
        tacho_kilos=Decimal("15"),
    )
    comisionista = Comisionista(nombre="AUGURTO MANUEL")
    db_session.add_all([cliente, finca, producto_canonico, producto_legado, comisionista])
    db_session.flush()
    db_session.add(ProductoAlias(producto_id=producto_canonico.id, alias="NATRUXTACT-ECUCITRIUS"))

    tarifa = _crear_tarifa(comisionista, cliente, producto_legado, finca)
    tarifa.proveedor = "Cualquier proveedor"
    db_session.add(tarifa)
    db_session.commit()

    normalizada = normalizar_orden_extraida(
        db_session,
        _crear_orden("SANTA PRISCILA", "TAURA D", "NATRUXTACT-ECUCITRIUS"),
    )

    assert normalizada.items[0].comisionistas == [
        {"comisionistaId": str(comisionista.id)}
    ]
    assert normalizada.items[0].productoId in {
        str(producto_canonico.id),
        str(producto_legado.id),
    }


def test_no_asigna_comisionista_si_la_finca_es_distinta(db_session):
    cliente = Cliente(nombre="SANTA PRISCILA", tipo="grupo")
    finca_tarifa = Finca(nombre="GOLFO", cliente=cliente)
    finca_orden = Finca(nombre="MARFRISCO", cliente=cliente)
    producto = Producto(nombre="ECU-BACILLUS", unidad_comision="kg")
    comisionista = Comisionista(nombre="COMISIONISTA UNO")
    db_session.add_all([cliente, finca_tarifa, finca_orden, producto, comisionista])
    db_session.flush()
    db_session.add(_crear_tarifa(comisionista, cliente, producto, finca_tarifa))
    db_session.commit()

    normalizada = normalizar_orden_extraida(
        db_session,
        _crear_orden("SANTA PRISCILA", "MARFRISCO", "ECU-BACILLUS"),
    )

    assert normalizada.items[0].comisionistas == []


def test_asigna_comisionista_por_cliente_y_producto_si_cliente_no_tiene_fincas(db_session):
    cliente = Cliente(nombre="CLIENTE INDIVIDUAL", tipo="individual")
    producto = Producto(nombre="ECU-BACILLUS", unidad_comision="kg")
    comisionista = Comisionista(nombre="COMISIONISTA UNO")
    db_session.add_all([cliente, producto, comisionista])
    db_session.flush()
    db_session.add(_crear_tarifa(comisionista, cliente, producto))
    db_session.commit()

    normalizada = normalizar_orden_extraida(
        db_session,
        _crear_orden("CLIENTE INDIVIDUAL", "", "ECU-BACILLUS"),
    )

    assert normalizada.items[0].comisionistas == [
        {"comisionistaId": str(comisionista.id)}
    ]


def test_no_asigna_comisionista_con_tarifa_inactiva(db_session):
    cliente = Cliente(nombre="CLIENTE INDIVIDUAL", tipo="individual")
    producto = Producto(nombre="ECU-BACILLUS", unidad_comision="kg")
    comisionista = Comisionista(nombre="COMISIONISTA UNO")
    db_session.add_all([cliente, producto, comisionista])
    db_session.flush()
    db_session.add(_crear_tarifa(comisionista, cliente, producto, activo=False))
    db_session.commit()

    normalizada = normalizar_orden_extraida(
        db_session,
        _crear_orden("CLIENTE INDIVIDUAL", "", "ECU-BACILLUS"),
    )

    assert normalizada.items[0].comisionistas == []


def test_asigna_comisionista_con_cliente_inferido_desde_finca_global_unica(db_session):
    cliente = Cliente(nombre="CLIENTE UNO", tipo="grupo")
    finca = Finca(nombre="EL MORRO", cliente=cliente)
    producto = Producto(nombre="ECU-BACILLUS", unidad_comision="kg")
    comisionista = Comisionista(nombre="COMISIONISTA UNO")
    db_session.add_all([cliente, finca, producto, comisionista])
    db_session.flush()
    db_session.add(_crear_tarifa(comisionista, cliente, producto, finca))
    db_session.commit()

    normalizada = normalizar_orden_extraida(
        db_session,
        _crear_orden("CLIENTE DESCONOCIDO", "EL MORRO", "ECU-BACILLUS"),
    )

    assert normalizada.items[0].comisionistas == [
        {"comisionistaId": str(comisionista.id)}
    ]


def test_no_duplica_comisionista_con_varias_tarifas_activas_aplicables(db_session):
    cliente = Cliente(nombre="CLIENTE INDIVIDUAL", tipo="individual")
    producto = Producto(nombre="ECU-BACILLUS", unidad_comision="kg")
    comisionista = Comisionista(nombre="COMISIONISTA UNO")
    db_session.add_all([cliente, producto, comisionista])
    db_session.flush()
    db_session.add_all(
        [
            _crear_tarifa(comisionista, cliente, producto),
            _crear_tarifa(comisionista, cliente, producto),
        ]
    )
    db_session.commit()

    normalizada = normalizar_orden_extraida(
        db_session,
        _crear_orden("CLIENTE INDIVIDUAL", "", "ECU-BACILLUS"),
    )

    assert normalizada.items[0].comisionistas == [
        {"comisionistaId": str(comisionista.id)}
    ]


def test_busca_cliente_por_razon_social_de_factura(db_session):
    """Los PDFs traen la razón social completa; el catálogo guarda alias cortos."""
    for nombre in (
        "AQUALITORAL",
        "PLUMONT - EXPALSA",
        "FAGUILL",
        "CAMPONIO",
        "INTEDECAM",
        "INTEDECAM ISLA PALO SANTO",
    ):
        db_session.add(Cliente(nombre=nombre, tipo="externo", retencion_porcentaje=Decimal("1.75")))
    db_session.commit()

    casos = {
        "AQUALITORAL S.A.S.": "AQUALITORAL",           # sufijo societario
        "PLUMONT S.A.": "PLUMONT - EXPALSA",           # el catálogo agrega el grupo
        "CAMARONERA FAGUILL S.A.": "FAGUILL",          # el alias va dentro de la razón social
        "ASOCIACION INTEDECAM - CAMPONIO": "CAMPONIO", # ambiguo: gana el token final
        "INTEDECAM S.A.": "INTEDECAM",                 # no debe ganar ISLA PALO SANTO
        "INTEDECAM - ISLA PALO SANTO": "INTEDECAM ISLA PALO SANTO",
    }
    for razon_social, esperado in casos.items():
        encontrado = _buscar_cliente(db_session, razon_social)
        assert encontrado is not None, razon_social
        assert encontrado.nombre == esperado, razon_social

    assert _buscar_cliente(db_session, "CAMELMAR S.A.S.") is None


def test_facturas_de_terceros_usan_extraccion_ia():
    # OC de DINACUAMAR: parser posicional.
    assert not _debe_usar_extraccion_ia("ORDEN DE COMPRA No. 2199 PROVEEDOR : SANTA PRISCILA")
    # Factura emitida a un cliente: no hay tabla posicional que parsear.
    assert _debe_usar_extraccion_ia("FACTURA No.001-002-000002209 Razón Social: AQUALITORAL S.A.S.")


def test_alias_de_cliente_manda_sobre_la_heuristica(db_session):
    """La heurística elegiría CAMPONIO; el alias configurado a mano gana."""
    camponio = Cliente(nombre="CAMPONIO", tipo="externo", retencion_porcentaje=Decimal("1.75"))
    asoc = Cliente(nombre="ASOC INT CAMPONIO", tipo="externo", retencion_porcentaje=Decimal("1.75"))
    db_session.add_all([camponio, asoc])
    db_session.commit()

    assert _buscar_cliente(db_session, "ASOCIACION INTEDECAM - CAMPONIO").nombre == "CAMPONIO"

    db_session.add(ClienteAlias(cliente_id=asoc.id, alias="ASOCIACION INTEDECAM - CAMPONIO"))
    db_session.commit()

    assert _buscar_cliente(db_session, "ASOCIACION INTEDECAM - CAMPONIO").nombre == "ASOC INT CAMPONIO"
    # El alias también tolera variantes de sufijo societario y puntuación.
    assert _buscar_cliente(db_session, "Asociacion Intedecam Camponio S.A.").nombre == "ASOC INT CAMPONIO"
