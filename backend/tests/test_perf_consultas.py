"""Mide cuántas consultas SQL dispara el dashboard según el volumen de órdenes.

No es un test de tiempo (SQLite en memoria no mide latencia de red): cuenta
sentencias. En producción cada sentencia es un round-trip a Postgres, así que
el conteo ES el tiempo de carga.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import event

from app.models.cliente import Cliente, Finca
from app.models.comisionista import Comisionista
from app.models.orden import Asignacion, EstadoOrden, Orden, OrdenItem
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.models.comisionista import TipoTarifa


def _sembrar(db, n_items: int, n_comisionistas: int = 2) -> None:
    cliente = Cliente(nombre="Cliente Perf", tipo="grupo")
    db.add(cliente)
    db.flush()
    finca = Finca(nombre="Finca Perf", cliente_id=cliente.id)
    productos = [Producto(nombre=f"PROD-{i}", unidad_comision="kg") for i in range(5)]
    comisionistas = [Comisionista(nombre=f"COM-{i}") for i in range(n_comisionistas)]
    db.add_all([finca, *productos, *comisionistas])
    db.flush()

    for c in comisionistas:
        for p in productos:
            db.add(
                TarifaClienteProducto(
                    comisionista_id=c.id,
                    cliente_id=cliente.id,
                    producto_id=p.id,
                    finca_id=finca.id,
                    tipo=TipoTarifa.fijo_kg,
                    valor=Decimal("0.05"),
                )
            )

    for i in range(n_items):
        orden = Orden(
            fecha=date(2026, 1, 1),
            numero_orden=f"F-{i}",
            cliente_id=cliente.id,
            proveedor="PROVEEDOR PERF",
            estado=EstadoOrden.pagada,
            fecha_pago=date(2026, 1, 15),
        )
        db.add(orden)
        db.flush()
        item = OrdenItem(
            orden_id=orden.id,
            fecha=date(2026, 1, 1),
            numero_orden=orden.numero_orden,
            cliente_id=cliente.id,
            finca=finca.nombre,
            finca_id=finca.id,
            producto=productos[i % 5].nombre,
            producto_id=productos[i % 5].id,
            cantidad=Decimal("100"),
            unidad="kg",
            precio_unitario=Decimal("2"),
            total=Decimal("200"),
            estado=EstadoOrden.pagada,
        )
        db.add(item)
        db.flush()
        for c in comisionistas:
            db.add(Asignacion(orden_item_id=item.id, comisionista_id=c.id))
    db.commit()


@pytest.mark.parametrize("n_items", [10, 40])
def test_consultas_del_dashboard_crecen_con_las_ordenes(authenticated_client, db_session, n_items):
    _sembrar(db_session, n_items)

    consultas: list[str] = []

    def _contar(conn, cursor, statement, params, context, executemany):
        consultas.append(statement)

    from tests.conftest import TEST_ENGINE

    event.listen(TEST_ENGINE, "before_cursor_execute", _contar)
    try:
        for ruta in ("/api/v1/reportes/global", "/api/v1/reportes/tendencias", "/api/v1/reportes/por-comisionista"):
            r = authenticated_client.get(ruta)
            assert r.status_code == 200, r.text
    finally:
        event.remove(TEST_ENGINE, "before_cursor_execute", _contar)

    productos_full_scan = sum(1 for s in consultas if "FROM productos" in s and "WHERE" not in s)
    print(f"\n[perf] items={n_items} → consultas SQL del dashboard: {len(consultas)}")
    print(f"[perf] items={n_items} → SELECT * FROM productos (tabla completa): {productos_full_scan}")

    # El conteo debe ser plano: si vuelve a crecer con las órdenes, alguien
    # reintrodujo una consulta dentro del bucle por ítem.
    assert len(consultas) < 100, f"{len(consultas)} consultas para {n_items} ítems"


@pytest.mark.parametrize("n_items", [10, 40])
def test_peso_del_arranque_de_la_app(authenticated_client, db_session, n_items):
    """Las 7 llamadas que AppContext dispara al montar."""
    _sembrar(db_session, n_items)

    consultas: list[str] = []

    def _contar(conn, cursor, statement, params, context, executemany):
        consultas.append(statement)

    from tests.conftest import TEST_ENGINE

    event.listen(TEST_ENGINE, "before_cursor_execute", _contar)
    bytes_por_ruta = {}
    try:
        for ruta in (
            "/api/v1/comisionistas/",
            "/api/v1/ordenes/",
            "/api/v1/liquidaciones/",
            "/api/v1/clientes/",
            "/api/v1/productos/",
            "/api/v1/tarifas-cliente-producto/",
            "/api/v1/retenciones/",
        ):
            r = authenticated_client.get(ruta)
            assert r.status_code == 200, f"{ruta}: {r.text}"
            bytes_por_ruta[ruta] = len(r.content)
    finally:
        event.remove(TEST_ENGINE, "before_cursor_execute", _contar)

    total = sum(bytes_por_ruta.values())
    print(f"\n[perf] items={n_items} → consultas SQL del arranque: {len(consultas)}")
    print(f"[perf] items={n_items} → payload total: {total / 1024:.1f} KB")
    for ruta, n in sorted(bytes_por_ruta.items(), key=lambda kv: -kv[1])[:3]:
        print(f"[perf]     {ruta}: {n / 1024:.1f} KB")
