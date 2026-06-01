from datetime import date

import pytest


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
    assert orden_liquidada["estado"] == "liquidado"


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
