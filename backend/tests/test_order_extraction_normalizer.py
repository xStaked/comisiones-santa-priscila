from datetime import date
from decimal import Decimal

from app.models.cliente import Cliente, Finca
from app.models.producto import Producto
from app.services.order_extraction_models import OrdenItemValidado, OrdenValidada
from app.services.order_extraction_normalizer import normalizar_orden_extraida


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
