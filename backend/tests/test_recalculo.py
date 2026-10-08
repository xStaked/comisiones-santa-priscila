"""Recálculo de comisiones: reparar asignaciones sin borrar ni resubir la factura."""

from datetime import date
from decimal import Decimal

from app.models.cliente import Cliente
from app.models.comisionista import Comisionista
from app.models.orden import Asignacion, EstadoOrden, Orden, OrdenItem
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto, TipoTarifa
from app.services.liquidacion import crear_liquidacion


def _catalogo(db_session, cliente="Cliente Recalc", producto="Producto Recalc",
              comisionista="Comisionista Recalc"):
    """Cliente, producto y comisionista sin tarifa entre ellos todavía."""
    cli = Cliente(nombre=cliente, tipo="individual")
    prod = Producto(nombre=producto, unidad_comision="kg")
    com = Comisionista(nombre=comisionista)
    db_session.add_all([cli, prod, com])
    db_session.commit()
    for obj in (cli, prod, com):
        db_session.refresh(obj)
    return cli, prod, com


def _tarifa(db_session, comisionista, cliente, producto, valor="2.0000"):
    tarifa = TarifaClienteProducto(
        comisionista_id=comisionista.id,
        cliente_id=cliente.id,
        producto_id=producto.id,
        tipo=TipoTarifa.porcentaje,
        valor=Decimal(valor),
    )
    db_session.add(tarifa)
    db_session.commit()
    db_session.refresh(tarifa)
    return tarifa


def _orden_con_item(db_session, numero, cliente=None, producto=None,
                    estado=EstadoOrden.pendiente, producto_texto=None):
    orden = Orden(
        fecha=date.today(), numero_orden=numero, origen="manual", estado=estado,
    )
    db_session.add(orden)
    db_session.flush()
    item = OrdenItem(
        orden_id=orden.id, fecha=date.today(), numero_orden=numero,
        finca="-", producto=producto_texto or (producto.nombre if producto else "Sin Producto"),
        cantidad=Decimal("100"), unidad="kg",
        precio_unitario=Decimal("5"), total=Decimal("500"),
        estado=estado,
        cliente_id=cliente.id if cliente else None,
        producto_id=producto.id if producto else None,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(orden)
    db_session.refresh(item)
    return orden, item


def _asignaciones_de(db_session, item_id):
    return (
        db_session.query(Asignacion)
        .filter(Asignacion.orden_item_id == item_id)
        .all()
    )


def test_recalculo_agrega_asignacion_y_liquida_con_comision(authenticated_client, db_session):
    """Ítem manual sin tarifa → se crea la tarifa → recalc asigna → al liquidar
    la comisión es mayor a cero (cierra el loop del reporte)."""
    cliente, producto, comisionista = _catalogo(db_session)
    orden, item = _orden_con_item(db_session, "REC-001", cliente, producto)
    assert _asignaciones_de(db_session, item.id) == []

    # Sin tarifa no hay candidatos: nada para agregar.
    resp = authenticated_client.post(
        "/api/v1/ordenes/recalcular",
        json={"ordenItemIds": [str(item.id)]},
    )
    assert resp.status_code == 200
    assert resp.json()["agregadas"] == 0

    _tarifa(db_session, comisionista, cliente, producto)

    resp = authenticated_client.post(
        "/api/v1/ordenes/recalcular",
        json={"ordenItemIds": [str(item.id)], "modo": "agregar"},
    )
    assert resp.status_code == 200
    datos = resp.json()
    assert datos["actualizados"] == 1
    assert datos["agregadas"] == 1
    assert datos["quitadas"] == 0
    assert datos["omitidas"] == []

    asignaciones = _asignaciones_de(db_session, item.id)
    assert [a.comisionista_id for a in asignaciones] == [comisionista.id]

    # El recálculo es idempotente: segunda pasada no duplica.
    resp = authenticated_client.post(
        "/api/v1/ordenes/recalcular",
        json={"ordenItemIds": [str(item.id)]},
    )
    assert resp.json()["agregadas"] == 0
    assert resp.json()["actualizados"] == 0

    # Al liquidar, la comisión es mayor a cero.
    pagada = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{orden.id}/estado", json={"estado": "pagada"}
    )
    assert pagada.status_code == 200
    liquidacion, _ = crear_liquidacion(db_session, "Liq recalc", [item.id], mes="2026-06")
    tarifas = [t for li in liquidacion.items for t in li.tarifas]
    assert len(tarifas) == 1
    assert tarifas[0].comision_calculada > 0


def test_recalculo_grupo_rellena_producto_y_asigna(authenticated_client, db_session):
    """Backfill: ítem con texto de producto sin `producto_id` → se crea el
    producto con ese nombre → recalc rellena `producto_id` y asigna."""
    cliente, _, comisionista = _catalogo(db_session)
    orden, item = _orden_con_item(
        db_session, "REC-002", cliente, None, producto_texto="MITOX NUEVO"
    )
    assert item.producto_id is None

    producto = Producto(nombre="MITOX NUEVO", unidad_comision="kg")
    db_session.add(producto)
    db_session.commit()
    db_session.refresh(producto)
    _tarifa(db_session, comisionista, cliente, producto)

    resp = authenticated_client.post(
        f"/api/v1/ordenes/grupos/{orden.id}/recalcular", json={"modo": "agregar"}
    )
    assert resp.status_code == 200
    datos = resp.json()
    assert datos["agregadas"] == 1
    assert datos["omitidas"] == []

    db_session.refresh(item)
    assert item.producto_id == producto.id
    assert [a.comisionista_id for a in _asignaciones_de(db_session, item.id)] == [
        comisionista.id
    ]


def test_recalculo_no_sobrescribe_fks_existentes(authenticated_client, db_session):
    """El backfill solo rellena NULLs: un `producto_id` ya fijado no cambia
    aunque el texto coincida con otro producto."""
    cliente, producto_viejo, _ = _catalogo(db_session)
    otro = Producto(nombre="OTRO PRODUCTO", unidad_comision="kg")
    db_session.add(otro)
    db_session.commit()
    db_session.refresh(otro)

    _, item = _orden_con_item(
        db_session, "REC-003", cliente, producto_viejo,
        producto_texto="OTRO PRODUCTO",
    )

    resp = authenticated_client.post(
        "/api/v1/ordenes/recalcular",
        json={"ordenItemIds": [str(item.id)]},
    )
    assert resp.status_code == 200

    db_session.refresh(item)
    assert item.producto_id == producto_viejo.id


def test_agregar_respeta_manual_y_sincronizar_la_quita(authenticated_client, db_session):
    """Una asignación manual cuya tarifa ya no aplica sobrevive a `agregar`
    pero `sincronizar` la quita (con advertencia en la UI)."""
    cliente, producto, comisionista = _catalogo(db_session)
    otro_producto = Producto(nombre="Producto Ajeno", unidad_comision="kg")
    db_session.add(otro_producto)
    db_session.commit()
    db_session.refresh(otro_producto)
    # La tarifa del comisionista es para otro producto: no aplica al ítem.
    _tarifa(db_session, comisionista, cliente, otro_producto)

    _, item_uno = _orden_con_item(db_session, "REC-004", cliente, producto)
    _, item_dos = _orden_con_item(db_session, "REC-005", cliente, producto)
    for item in (item_uno, item_dos):
        db_session.add(
            Asignacion(orden_item_id=item.id, comisionista_id=comisionista.id)
        )
    db_session.commit()

    resp = authenticated_client.post(
        "/api/v1/ordenes/recalcular",
        json={"ordenItemIds": [str(item_uno.id)], "modo": "agregar"},
    )
    assert resp.status_code == 200
    assert resp.json()["quitadas"] == 0
    assert len(_asignaciones_de(db_session, item_uno.id)) == 1

    resp = authenticated_client.post(
        "/api/v1/ordenes/recalcular",
        json={"ordenItemIds": [str(item_dos.id)], "modo": "sincronizar"},
    )
    assert resp.status_code == 200
    datos = resp.json()
    assert datos["quitadas"] == 1
    assert datos["actualizados"] == 1
    assert _asignaciones_de(db_session, item_dos.id) == []


def test_recalculo_omite_item_liquidado(authenticated_client, db_session):
    """Un ítem liquidado se informa en `omitidas` y no cambia, aunque ahora
    tendría tarifa."""
    cliente, producto, comisionista = _catalogo(db_session)
    orden, item = _orden_con_item(
        db_session, "REC-006", cliente, producto, estado=EstadoOrden.liquidada
    )
    db_session.query(Orden).filter(Orden.id == orden.id).update(
        {Orden.estado: EstadoOrden.liquidada}
    )
    _tarifa(db_session, comisionista, cliente, producto)
    db_session.commit()

    resp = authenticated_client.post(
        f"/api/v1/ordenes/grupos/{orden.id}/recalcular", json={}
    )
    assert resp.status_code == 200
    datos = resp.json()
    assert datos["agregadas"] == 0
    assert datos["actualizados"] == 0
    assert len(datos["omitidas"]) == 1
    assert datos["omitidas"][0]["id"] == str(item.id)
    assert _asignaciones_de(db_session, item.id) == []


def test_recalculo_omite_grupo_con_hermano_liquidado(authenticated_client, db_session):
    """Si un hermano de la factura ya se liquidó, el resto se omite."""
    cliente, producto, comisionista = _catalogo(db_session)
    _tarifa(db_session, comisionista, cliente, producto)
    orden = Orden(
        fecha=date.today(), numero_orden="REC-007", origen="manual",
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden)
    db_session.flush()
    liquidado = OrdenItem(
        orden_id=orden.id, fecha=date.today(), numero_orden="REC-007",
        finca="-", producto=producto.nombre,
        cantidad=Decimal("10"), unidad="kg",
        precio_unitario=Decimal("5"), total=Decimal("50"),
        estado=EstadoOrden.liquidada,
        cliente_id=cliente.id, producto_id=producto.id,
    )
    pendiente = OrdenItem(
        orden_id=orden.id, fecha=date.today(), numero_orden="REC-007",
        finca="-", producto=producto.nombre,
        cantidad=Decimal("10"), unidad="kg",
        precio_unitario=Decimal("5"), total=Decimal("50"),
        estado=EstadoOrden.pagada,
        cliente_id=cliente.id, producto_id=producto.id,
    )
    db_session.add_all([liquidado, pendiente])
    db_session.commit()

    resp = authenticated_client.post(
        "/api/v1/ordenes/recalcular",
        json={"ordenItemIds": [str(pendiente.id)]},
    )
    assert resp.status_code == 200
    datos = resp.json()
    assert datos["agregadas"] == 0
    assert len(datos["omitidas"]) == 1
    assert _asignaciones_de(db_session, pendiente.id) == []


def test_recalculo_omite_liquidacion_parcial_por_persona(authenticated_client, db_session):
    """Si el ítem ya le pagó a un comisionista, no se reabre: se omite."""
    _, _, ana = _catalogo(db_session, comisionista="ANA REC")
    beto = Comisionista(nombre="BETO REC")
    db_session.add(beto)
    db_session.commit()
    db_session.refresh(beto)

    orden = Orden(
        fecha=date.today(), numero_orden="REC-008", origen="manual",
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden)
    db_session.flush()
    item = OrdenItem(
        orden_id=orden.id, fecha=date.today(), numero_orden="REC-008",
        finca="-", producto="Producto X",
        cantidad=Decimal("10"), unidad="kg",
        precio_unitario=Decimal("5"), total=Decimal("50"),
        estado=EstadoOrden.pagada,
    )
    db_session.add(item)
    db_session.flush()
    db_session.add_all([
        Asignacion(orden_item_id=item.id, comisionista_id=ana.id),
        Asignacion(orden_item_id=item.id, comisionista_id=beto.id),
    ])
    db_session.commit()

    # Junio: cobra ANA; el ítem sigue pagado porque BETO queda pendiente.
    crear_liquidacion(db_session, "Parcial ANA", [item.id], [ana.id], mes="2026-06")

    resp = authenticated_client.post(
        "/api/v1/ordenes/recalcular",
        json={"ordenIds": [str(orden.id)]},
    )
    assert resp.status_code == 200
    datos = resp.json()
    assert datos["agregadas"] == 0
    assert datos["quitadas"] == 0
    assert len(datos["omitidas"]) == 1
    assert datos["omitidas"][0]["id"] == str(item.id)
    # Nada cambió: las dos asignaciones siguen como estaban.
    asignaciones = _asignaciones_de(db_session, item.id)
    assert len(asignaciones) == 2
    por_comisionista = {a.comisionista_id: a for a in asignaciones}
    assert por_comisionista[ana.id].liquidacion_id is not None
    assert por_comisionista[beto.id].liquidacion_id is None


def test_recalculo_masivo_sin_ids_recorre_lo_no_liquidado(authenticated_client, db_session):
    """Sin ids recorre todo lo pendiente: útil en beta con catálogos al día."""
    cliente, producto, comisionista = _catalogo(db_session)
    _tarifa(db_session, comisionista, cliente, producto)
    _, item_uno = _orden_con_item(db_session, "REC-009", cliente, producto)
    _, item_dos = _orden_con_item(db_session, "REC-010", cliente, producto)

    resp = authenticated_client.post("/api/v1/ordenes/recalcular", json={})
    assert resp.status_code == 200
    datos = resp.json()
    assert datos["agregadas"] == 2
    assert datos["actualizados"] == 2
    assert len(_asignaciones_de(db_session, item_uno.id)) == 1
    assert len(_asignaciones_de(db_session, item_dos.id)) == 1


def test_recalculo_grupo_inexistente_da_404(authenticated_client):
    import uuid

    resp = authenticated_client.post(
        f"/api/v1/ordenes/grupos/{uuid.uuid4()}/recalcular", json={}
    )
    assert resp.status_code == 404


def test_recalculo_sin_token_da_401(client):
    import uuid

    masivo = client.post("/api/v1/ordenes/recalcular", json={})
    assert masivo.status_code in (401, 403)
    grupo = client.post(
        f"/api/v1/ordenes/grupos/{uuid.uuid4()}/recalcular", json={}
    )
    assert grupo.status_code in (401, 403)
