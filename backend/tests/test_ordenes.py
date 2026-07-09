from datetime import date
from decimal import Decimal

import pytest

from app.models.orden import EstadoOrden, Orden, OrdenItem


def test_list_ordenes_unauthenticated(client):
    response = client.get("/api/v1/ordenes/")
    assert response.status_code in (401, 403)


def test_list_ordenes(authenticated_client):
    response = authenticated_client.get("/api/v1/ordenes/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_create_orden(authenticated_client):
    payload = [{
        "fecha": str(date.today()),
        "numero_orden": "ORD-TEST-001",
        "finca": "Finca Test",
        "producto": "Camarón",
        "cantidad": "100.00",
        "unidad": "kg",
        "precio_unitario": "5.50",
        "total": "550.00",
        "sector": "Norte",
        "comisionista_ids": [],
    }]
    response = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert len(data) == 1
    assert data[0]["numero_orden"] == "ORD-TEST-001"
    assert data[0]["orden_id"] is not None


def test_create_orden_inicia_pendiente(authenticated_client):
    payload = [{
        "fecha": str(date.today()),
        "numero_orden": "ORD-ESTADO-001",
        "finca": "Finca Test",
        "producto": "Camarón",
        "cantidad": "100.00",
        "unidad": "kg",
        "precio_unitario": "5.50",
        "total": "550.00",
        "sector": "Norte",
        "comisionista_ids": [],
    }]

    response = authenticated_client.post("/api/v1/ordenes/", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data[0]["estado"] == "pendiente"


def test_list_ordenes_planas_no_serializa_relaciones_ciclicas(authenticated_client):
    payload = [{
        "fecha": str(date.today()),
        "numero_orden": "ORD-PLANA-001",
        "finca": "Finca Test",
        "producto": "Camarón",
        "cantidad": "100.00",
        "unidad": "kg",
        "precio_unitario": "5.50",
        "total": "550.00",
        "comisionista_ids": [],
    }]
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201

    response = authenticated_client.get("/api/v1/ordenes/")
    assert response.status_code == 200
    data = response.json()
    orden = next(o for o in data if o["numero_orden"] == "ORD-PLANA-001")
    assert orden["orden_id"] is not None
    assert "orden" not in orden
    assert "liquidacion_items" not in orden


def test_create_orden_agrupada_con_multiples_lineas(authenticated_client):
    payload = {
        "fecha": str(date.today()),
        "numero_orden": "ORD-GRUPO-001",
        "proveedor": "Proveedor Test",
        "semana": "15",
        "archivo_nombre": "orden-test.pdf",
        "origen": "pdf",
        "items": [
            {
                "finca": "Finca A",
                "producto": "Camarón",
                "cantidad": "100.00",
                "unidad": "kg",
                "precio_unitario": "5.00",
                "total": "500.00",
                "sector": "A",
                "comisionista_ids": [],
            },
            {
                "finca": "Finca B",
                "producto": "Tilapia",
                "cantidad": "50.00",
                "unidad": "kg",
                "precio_unitario": "3.00",
                "total": "150.00",
                "sector": "B",
                "comisionista_ids": [],
            },
        ],
    }

    response = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["numero_orden"] == "ORD-GRUPO-001"
    assert data["proveedor"] == "Proveedor Test"
    assert data["origen"] == "pdf"
    assert len(data["items"]) == 2
    assert {item["producto"] for item in data["items"]} == {"Camarón", "Tilapia"}
    assert {item["orden_id"] for item in data["items"]} == {data["id"]}


def test_create_orden_agrupada_inicia_pendiente(authenticated_client):
    payload = {
        "fecha": str(date.today()),
        "numero_orden": "ORD-ESTADO-GRUPO-001",
        "origen": "manual",
        "items": [
            {
                "finca": "Finca A",
                "producto": "Camarón",
                "cantidad": "10.00",
                "unidad": "kg",
                "precio_unitario": "5.00",
                "total": "50.00",
                "comisionista_ids": [],
            }
        ],
    }

    response = authenticated_client.post("/api/v1/ordenes/", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["estado"] == "pendiente"
    assert data["items"][0]["estado"] == "pendiente"


def test_list_ordenes_agrupadas(authenticated_client):
    payload = [
        {
            "fecha": str(date.today()),
            "numero_orden": "ORD-GRUPO-002",
            "finca": "Finca A",
            "producto": "Camarón",
            "cantidad": "10.00",
            "unidad": "kg",
            "precio_unitario": "5.00",
            "total": "50.00",
            "comisionista_ids": [],
        },
        {
            "fecha": str(date.today()),
            "numero_orden": "ORD-GRUPO-002",
            "finca": "Finca B",
            "producto": "Tilapia",
            "cantidad": "20.00",
            "unidad": "kg",
            "precio_unitario": "3.00",
            "total": "60.00",
            "comisionista_ids": [],
        },
    ]
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201

    response = authenticated_client.get("/api/v1/ordenes/", params={"agrupadas": True})
    assert response.status_code == 200
    ordenes = response.json()
    orden = next(o for o in ordenes if o["numero_orden"] == "ORD-GRUPO-002")
    assert len(orden["items"]) == 2
    assert orden["cantidad_productos"] == 2
    assert float(orden["total"]) == 110.0


def test_liquidacion_preserva_orden_id_en_snapshots(authenticated_client):
    payload = {
        "fecha": str(date.today()),
        "numero_orden": "ORD-LIQ-GRUPO-001",
        "origen": "manual",
        "items": [
            {
                "finca": "Finca A",
                "producto": "Camarón",
                "cantidad": "10.00",
                "unidad": "kg",
                "precio_unitario": "5.00",
                "total": "50.00",
                "comisionista_ids": [],
            },
            {
                "finca": "Finca B",
                "producto": "Tilapia",
                "cantidad": "20.00",
                "unidad": "kg",
                "precio_unitario": "3.00",
                "total": "60.00",
                "comisionista_ids": [],
            },
        ],
    }
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    orden = create_resp.json()
    item_ids = [item["id"] for item in orden["items"]]
    estado_resp = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{orden['id']}/estado",
        json={"estado": "pagada"},
    )
    assert estado_resp.status_code == 200

    liq_resp = authenticated_client.post(
        "/api/v1/liquidaciones/",
        json={"nombre": "Liquidación agrupada", "orden_item_ids": item_ids},
    )
    assert liq_resp.status_code == 201

    detail_resp = authenticated_client.get(f"/api/v1/liquidaciones/{liq_resp.json()['id']}")
    assert detail_resp.status_code == 200
    detalle = detail_resp.json()
    assert len(detalle["items"]) == 2
    assert {item["orden_id"] for item in detalle["items"]} == {orden["id"]}

    agrupadas_resp = authenticated_client.get("/api/v1/ordenes/", params={"agrupadas": True})
    orden_liquidada = next(
        o for o in agrupadas_resp.json() if o["numero_orden"] == "ORD-LIQ-GRUPO-001"
    )
    assert orden_liquidada["estado"] == "liquidada"
    assert {item["estado"] for item in orden_liquidada["items"]} == {"liquidada"}


def test_liquidacion_rechaza_orden_pendiente(authenticated_client):
    payload = {
        "fecha": str(date.today()),
        "numero_orden": "ORD-LIQ-PENDIENTE-001",
        "origen": "manual",
        "items": [
            {
                "finca": "Finca A",
                "producto": "Camarón",
                "cantidad": "10.00",
                "unidad": "kg",
                "precio_unitario": "5.00",
                "total": "50.00",
                "comisionista_ids": [],
            }
        ],
    }

    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    orden = create_resp.json()

    liq_resp = authenticated_client.post(
        "/api/v1/liquidaciones/",
        json={
            "nombre": "Liquidación rechazada",
            "orden_item_ids": [orden["items"][0]["id"]],
        },
    )

    assert liq_resp.status_code == 400
    assert "pagada" in liq_resp.json()["detail"]


def test_liquidacion_permite_orden_pagada_y_marca_liquidada(authenticated_client):
    payload = {
        "fecha": str(date.today()),
        "numero_orden": "ORD-LIQ-PAGADA-001",
        "origen": "manual",
        "items": [
            {
                "finca": "Finca A",
                "producto": "Camarón",
                "cantidad": "10.00",
                "unidad": "kg",
                "precio_unitario": "5.00",
                "total": "50.00",
                "comisionista_ids": [],
            },
            {
                "finca": "Finca B",
                "producto": "Tilapia",
                "cantidad": "20.00",
                "unidad": "kg",
                "precio_unitario": "3.00",
                "total": "60.00",
                "comisionista_ids": [],
            },
        ],
    }

    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    orden = create_resp.json()

    estado_resp = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{orden['id']}/estado",
        json={"estado": "pagada"},
    )
    assert estado_resp.status_code == 200

    liq_resp = authenticated_client.post(
        "/api/v1/liquidaciones/",
        json={
            "nombre": "Liquidación permitida",
            "orden_item_ids": [item["id"] for item in orden["items"]],
        },
    )

    assert liq_resp.status_code == 201

    agrupadas_resp = authenticated_client.get("/api/v1/ordenes/", params={"agrupadas": True})
    assert agrupadas_resp.status_code == 200
    orden_liquidada = next(
        o for o in agrupadas_resp.json() if o["id"] == orden["id"]
    )
    assert orden_liquidada["estado"] == "liquidada"
    assert {item["estado"] for item in orden_liquidada["items"]} == {"liquidada"}


def test_actualiza_estado_de_orden_agrupada_y_sus_items(authenticated_client):
    payload = {
        "fecha": str(date.today()),
        "numero_orden": "ORD-PAGO-001",
        "origen": "manual",
        "items": [
            {
                "finca": "Finca A",
                "producto": "Camarón",
                "cantidad": "10.00",
                "unidad": "kg",
                "precio_unitario": "5.00",
                "total": "50.00",
                "comisionista_ids": [],
            },
            {
                "finca": "Finca B",
                "producto": "Tilapia",
                "cantidad": "20.00",
                "unidad": "kg",
                "precio_unitario": "3.00",
                "total": "60.00",
                "comisionista_ids": [],
            },
        ],
    }
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    orden_id = create_resp.json()["id"]

    update_resp = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{orden_id}/estado",
        json={"estado": "pagada"},
    )

    assert update_resp.status_code == 200
    data = update_resp.json()
    assert data["estado"] == "pagada"
    assert {item["estado"] for item in data["items"]} == {"pagada"}

    list_resp = authenticated_client.get("/api/v1/ordenes/", params={"agrupadas": True})
    assert list_resp.status_code == 200
    orden_actualizada = next(
        o for o in list_resp.json() if o["id"] == orden_id
    )
    assert orden_actualizada["estado"] == "pagada"
    assert {item["estado"] for item in orden_actualizada["items"]} == {"pagada"}


def test_rechaza_estado_de_orden_desconocido(authenticated_client):
    payload = [{
        "fecha": str(date.today()),
        "numero_orden": "ORD-PAGO-INVALIDO-001",
        "finca": "Finca Test",
        "producto": "Camarón",
        "cantidad": "100.00",
        "unidad": "kg",
        "precio_unitario": "5.50",
        "total": "550.00",
        "comisionista_ids": [],
    }]
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    orden_id = create_resp.json()[0]["orden_id"]

    update_resp = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{orden_id}/estado",
        json={"estado": "cobrada"},
    )

    assert update_resp.status_code == 400
    assert "Estado de orden inválido" in update_resp.json()["detail"]


def test_rechaza_marcar_orden_como_liquidada_manualmente(authenticated_client):
    payload = [{
        "fecha": str(date.today()),
        "numero_orden": "ORD-PAGO-LIQUIDADA-001",
        "finca": "Finca Test",
        "producto": "Camarón",
        "cantidad": "100.00",
        "unidad": "kg",
        "precio_unitario": "5.50",
        "total": "550.00",
        "comisionista_ids": [],
    }]
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    orden_id = create_resp.json()[0]["orden_id"]

    update_resp = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{orden_id}/estado",
        json={"estado": "liquidada"},
    )

    assert update_resp.status_code == 400
    assert (
        "El estado liquidada se asigna al guardar una liquidación"
        in update_resp.json()["detail"]
    )


def test_rechaza_cambiar_estado_grupal_si_tiene_items_liquidados(authenticated_client):
    payload = {
        "fecha": str(date.today()),
        "numero_orden": "ORD-PAGO-PARCIAL-001",
        "origen": "manual",
        "items": [
            {
                "finca": "Finca A",
                "producto": "Camarón",
                "cantidad": "10.00",
                "unidad": "kg",
                "precio_unitario": "5.00",
                "total": "50.00",
                "comisionista_ids": [],
            },
            {
                "finca": "Finca B",
                "producto": "Tilapia",
                "cantidad": "20.00",
                "unidad": "kg",
                "precio_unitario": "3.00",
                "total": "60.00",
                "comisionista_ids": [],
            },
        ],
    }
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    orden = create_resp.json()

    estado_resp = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{orden['id']}/estado",
        json={"estado": "pagada"},
    )
    assert estado_resp.status_code == 200

    liq_resp = authenticated_client.post(
        "/api/v1/liquidaciones/",
        json={
            "nombre": "Liquidación parcial",
            "orden_item_ids": [orden["items"][0]["id"]],
        },
    )
    assert liq_resp.status_code == 201

    update_resp = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{orden['id']}/estado",
        json={"estado": "pendiente"},
    )

    assert update_resp.status_code == 400
    assert "No se puede cambiar el estado de una orden con ítems liquidados" in update_resp.json()["detail"]


def test_rechaza_editar_y_eliminar_item_liquidado(authenticated_client):
    payload = [{
        "fecha": str(date.today()),
        "numero_orden": "ORD-ITEM-LIQUIDADO-001",
        "finca": "Finca Test",
        "producto": "Camarón",
        "cantidad": "100.00",
        "unidad": "kg",
        "precio_unitario": "5.50",
        "total": "550.00",
        "comisionista_ids": [],
    }]
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    item = create_resp.json()[0]

    estado_resp = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{item['orden_id']}/estado",
        json={"estado": "pagada"},
    )
    assert estado_resp.status_code == 200

    liq_resp = authenticated_client.post(
        "/api/v1/liquidaciones/",
        json={"nombre": "Liquidación ítem", "orden_item_ids": [item["id"]]},
    )
    assert liq_resp.status_code == 201

    update_resp = authenticated_client.put(
        f"/api/v1/ordenes/{item['id']}",
        json={"finca": "Finca Editada"},
    )
    assert update_resp.status_code == 400
    assert "No se puede modificar un ítem liquidado" in update_resp.json()["detail"]

    delete_resp = authenticated_client.delete(f"/api/v1/ordenes/{item['id']}")
    assert delete_resp.status_code == 400
    assert "No se puede eliminar un ítem liquidado" in delete_resp.json()["detail"]


def test_rechaza_limpiar_ordenes_con_items_liquidados(authenticated_client):
    payload = [{
        "fecha": str(date.today()),
        "numero_orden": "ORD-LIMPIAR-LIQUIDADO-001",
        "finca": "Finca Test",
        "producto": "Camarón",
        "cantidad": "100.00",
        "unidad": "kg",
        "precio_unitario": "5.50",
        "total": "550.00",
        "comisionista_ids": [],
    }]
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    item = create_resp.json()[0]

    estado_resp = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{item['orden_id']}/estado",
        json={"estado": "pagada"},
    )
    assert estado_resp.status_code == 200

    liq_resp = authenticated_client.post(
        "/api/v1/liquidaciones/",
        json={"nombre": "Liquidación limpiar", "orden_item_ids": [item["id"]]},
    )
    assert liq_resp.status_code == 201

    limpiar_resp = authenticated_client.post("/api/v1/ordenes/limpiar")

    assert limpiar_resp.status_code == 400
    assert "No se pueden limpiar órdenes con ítems liquidados" in limpiar_resp.json()["detail"]


def test_rechaza_marcar_item_como_liquidado_manualmente(authenticated_client):
    payload = [{
        "fecha": str(date.today()),
        "numero_orden": "ORD-ITEM-ESTADO-LIQUIDADO-001",
        "finca": "Finca Test",
        "producto": "Camarón",
        "cantidad": "100.00",
        "unidad": "kg",
        "precio_unitario": "5.50",
        "total": "550.00",
        "comisionista_ids": [],
    }]
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    item = create_resp.json()[0]

    update_resp = authenticated_client.put(
        f"/api/v1/ordenes/{item['id']}",
        json={"estado": "liquidada"},
    )

    assert update_resp.status_code == 400
    assert "El estado liquidada se asigna al guardar una liquidación" in update_resp.json()["detail"]


def test_rechaza_modificar_items_de_grupo_parcialmente_liquidado(authenticated_client):
    comisionista_resp = authenticated_client.post("/api/v1/comisionistas/", json={
        "nombre": "Comisionista Hermano Bloqueado",
        "tarifas": [],
    })
    assert comisionista_resp.status_code == 201
    comisionista_id = comisionista_resp.json()["id"]

    payload = {
        "fecha": str(date.today()),
        "numero_orden": "ORD-GRUPO-PARCIAL-LIQUIDADO-001",
        "origen": "manual",
        "items": [
            {
                "finca": "Finca A",
                "producto": "Camarón",
                "cantidad": "10.00",
                "unidad": "kg",
                "precio_unitario": "5.00",
                "total": "50.00",
                "comisionista_ids": [],
            },
            {
                "finca": "Finca B",
                "producto": "Tilapia",
                "cantidad": "20.00",
                "unidad": "kg",
                "precio_unitario": "3.00",
                "total": "60.00",
                "comisionista_ids": [comisionista_id],
            },
        ],
    }
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    orden = create_resp.json()
    item_liquidado = orden["items"][0]
    item_hermano = orden["items"][1]

    estado_resp = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{orden['id']}/estado",
        json={"estado": "pagada"},
    )
    assert estado_resp.status_code == 200

    liq_resp = authenticated_client.post(
        "/api/v1/liquidaciones/",
        json={
            "nombre": "Liquidación parcial con hermano",
            "orden_item_ids": [item_liquidado["id"]],
        },
    )
    assert liq_resp.status_code == 201

    update_resp = authenticated_client.put(
        f"/api/v1/ordenes/{item_hermano['id']}",
        json={"finca": "Finca Editada"},
    )
    assert update_resp.status_code == 400
    assert "No se puede modificar un ítem liquidado" in update_resp.json()["detail"]

    agregar_resp = authenticated_client.post(
        f"/api/v1/ordenes/{item_hermano['id']}/comisionistas",
        json={"comisionista_id": comisionista_id},
    )
    assert agregar_resp.status_code == 400
    assert "No se puede modificar un ítem liquidado" in agregar_resp.json()["detail"]

    # La liquidación es por persona: este comisionista aún no cobró, se puede quitar.
    quitar_resp = authenticated_client.delete(
        f"/api/v1/ordenes/{item_hermano['id']}/comisionistas/{comisionista_id}",
    )
    assert quitar_resp.status_code == 204

    asignar_global_resp = authenticated_client.post(
        "/api/v1/ordenes/asignar-global",
        json={"orden_ids": [item_hermano["id"]], "comisionista_ids": [comisionista_id]},
    )
    assert asignar_global_resp.status_code == 400
    assert "No se puede modificar un ítem liquidado" in asignar_global_resp.json()["detail"]

    delete_resp = authenticated_client.delete(f"/api/v1/ordenes/{item_hermano['id']}")
    assert delete_resp.status_code == 400
    assert "No se puede eliminar un ítem liquidado" in delete_resp.json()["detail"]


def test_rechaza_asignar_comisionistas_a_grupo_con_items_liquidados(authenticated_client):
    comisionista_resp = authenticated_client.post("/api/v1/comisionistas/", json={
        "nombre": "Comisionista Grupo Bloqueado",
        "tarifas": [],
    })
    assert comisionista_resp.status_code == 201
    comisionista_id = comisionista_resp.json()["id"]

    payload = {
        "fecha": str(date.today()),
        "numero_orden": "ORD-GRUPO-LIQUIDADO-001",
        "origen": "manual",
        "items": [
            {
                "finca": "Finca A",
                "producto": "Camarón",
                "cantidad": "10.00",
                "unidad": "kg",
                "precio_unitario": "5.00",
                "total": "50.00",
                "comisionista_ids": [],
            },
            {
                "finca": "Finca B",
                "producto": "Tilapia",
                "cantidad": "20.00",
                "unidad": "kg",
                "precio_unitario": "3.00",
                "total": "60.00",
                "comisionista_ids": [],
            },
        ],
    }
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    orden = create_resp.json()

    estado_resp = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{orden['id']}/estado",
        json={"estado": "pagada"},
    )
    assert estado_resp.status_code == 200

    liq_resp = authenticated_client.post(
        "/api/v1/liquidaciones/",
        json={
            "nombre": "Liquidación grupo parcial",
            "orden_item_ids": [orden["items"][0]["id"]],
        },
    )
    assert liq_resp.status_code == 201

    asignar_resp = authenticated_client.post(
        f"/api/v1/ordenes/grupos/{orden['id']}/comisionistas",
        json={"comisionista_ids": [comisionista_id]},
    )

    assert asignar_resp.status_code == 400
    assert "No se puede modificar un ítem liquidado" in asignar_resp.json()["detail"]


def test_update_orden(authenticated_client):
    payload = [{
        "fecha": str(date.today()),
        "numero_orden": "ORD-TEST-002",
        "finca": "Finca A",
        "producto": "Tilapia",
        "cantidad": "50.00",
        "unidad": "kg",
        "precio_unitario": "3.00",
        "total": "150.00",
        "sector": "Sur",
        "comisionista_ids": [],
    }]
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    oid = create_resp.json()[0]["id"]

    update_resp = authenticated_client.put(f"/api/v1/ordenes/{oid}", json={
        "finca": "Finca B",
    })
    assert update_resp.status_code == 200
    assert update_resp.json()["finca"] == "Finca B"


def test_update_orden_reemplaza_comisionistas(authenticated_client):
    comisionista_ids = []
    for nombre in ("Comisionista Uno", "Comisionista Dos"):
        response = authenticated_client.post("/api/v1/comisionistas/", json={
            "nombre": nombre,
            "tarifas": [],
        })
        assert response.status_code == 201
        comisionista_ids.append(response.json()["id"])

    create_resp = authenticated_client.post("/api/v1/ordenes/", json=[{
        "fecha": str(date.today()),
        "numero_orden": "ORD-COMISIONISTAS-001",
        "finca": "Finca A",
        "producto": "Camarón",
        "cantidad": "20.00",
        "unidad": "kg",
        "precio_unitario": "10.00",
        "total": "200.00",
        "comisionista_ids": [],
    }])
    assert create_resp.status_code == 201
    oid = create_resp.json()[0]["id"]

    update_resp = authenticated_client.put(f"/api/v1/ordenes/{oid}", json={
        "comisionista_ids": comisionista_ids,
    })
    assert update_resp.status_code == 200
    assert {
        asignacion["comisionista_id"]
        for asignacion in update_resp.json()["comisionistas"]
    } == set(comisionista_ids)

    list_resp = authenticated_client.get("/api/v1/ordenes/")
    assert list_resp.status_code == 200
    orden = next(o for o in list_resp.json() if o["id"] == oid)
    assert {
        asignacion["comisionista_id"]
        for asignacion in orden["comisionistas"]
    } == set(comisionista_ids)


def test_delete_orden(authenticated_client):
    payload = [{
        "fecha": str(date.today()),
        "numero_orden": "ORD-TEST-003",
        "finca": "Finca C",
        "producto": "Camarón",
        "cantidad": "20.00",
        "unidad": "kg",
        "precio_unitario": "10.00",
        "total": "200.00",
        "comisionista_ids": [],
    }]
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    oid = create_resp.json()[0]["id"]

    del_resp = authenticated_client.delete(f"/api/v1/ordenes/{oid}")
    assert del_resp.status_code == 204

    list_resp = authenticated_client.get("/api/v1/ordenes/")
    ordenes = list_resp.json()
    assert all(o["id"] != oid for o in ordenes)


def test_estado_masivo_marca_pagadas_y_omite_liquidadas(authenticated_client, db_session):
    o1 = Orden(fecha=date.today(), numero_orden="MAS-1", origen="manual", estado=EstadoOrden.pendiente)
    o2 = Orden(fecha=date.today(), numero_orden="MAS-2", origen="manual", estado=EstadoOrden.liquidada)
    db_session.add_all([o1, o2])
    db_session.flush()
    i1 = OrdenItem(
        orden_id=o1.id, fecha=date.today(), numero_orden="MAS-1", finca="F", producto="P",
        cantidad=Decimal("1"), unidad="kg", precio_unitario=Decimal("1"), total=Decimal("1"),
        estado=EstadoOrden.pendiente,
    )
    i2 = OrdenItem(
        orden_id=o2.id, fecha=date.today(), numero_orden="MAS-2", finca="F", producto="P",
        cantidad=Decimal("1"), unidad="kg", precio_unitario=Decimal("1"), total=Decimal("1"),
        estado=EstadoOrden.liquidada,
    )
    db_session.add_all([i1, i2])
    db_session.commit()

    resp = authenticated_client.put(
        "/api/v1/ordenes/grupos/estado-masivo",
        json={"orden_ids": [str(o1.id), str(o2.id)], "estado": "pagada"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["actualizadas"] == 1
    assert str(o2.id) in data["omitidas"]
    db_session.refresh(o1)
    db_session.refresh(i1)
    assert o1.estado == EstadoOrden.pagada
    assert i1.estado == EstadoOrden.pagada


def test_estado_masivo_rechaza_liquidada_como_destino(authenticated_client):
    resp = authenticated_client.put(
        "/api/v1/ordenes/grupos/estado-masivo",
        json={"orden_ids": [], "estado": "liquidada"},
    )
    assert resp.status_code == 400


def test_proveedor_se_canonicaliza_contra_variantes(authenticated_client):
    def payload(numero, proveedor):
        return [{
            "fecha": str(date.today()),
            "numero_orden": numero,
            "finca": "Finca Test",
            "producto": "Camarón",
            "cantidad": "100.00",
            "unidad": "kg",
            "precio_unitario": "5.50",
            "total": "550.00",
            "comisionista_ids": [],
            "proveedor": proveedor,
        }]

    r1 = authenticated_client.post(
        "/api/v1/ordenes/", json=payload("ORD-PROV-1", "ACME DEL MAR CIA.LTDA.")
    )
    r2 = authenticated_client.post(
        "/api/v1/ordenes/", json=payload("ORD-PROV-2", "ACME  DEL MAR CIA. LTDA.")
    )
    r3 = authenticated_client.post(
        "/api/v1/ordenes/", json=payload("ORD-PROV-3", "ACME DEL MAR")
    )
    assert r1.status_code == r2.status_code == r3.status_code == 201

    ordenes = authenticated_client.get("/api/v1/ordenes/?agrupadas=true").json()
    proveedores = {
        o["proveedor"] for o in ordenes if o["numero_orden"].startswith("ORD-PROV-")
    }
    # Las tres variantes tipográficas quedan con la razón social registrada primero
    assert proveedores == {"ACME DEL MAR CIA.LTDA."}
