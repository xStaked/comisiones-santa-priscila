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
