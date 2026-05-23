import uuid as uuid_mod

import pytest


def test_list_comisionistas_unauthenticated(client):
    response = client.get("/api/v1/comisionistas/")
    assert response.status_code in (401, 403)


def test_list_comisionistas(authenticated_client):
    response = authenticated_client.get("/api/v1/comisionistas/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_create_comisionista(authenticated_client):
    payload = {
        "nombre": "Comisionista Test",
        "tarifas": [{"tipo": "porcentaje", "valor": "5.5"}],
    }
    response = authenticated_client.post("/api/v1/comisionistas/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["nombre"] == "Comisionista Test"
    assert len(data["tarifas"]) == 1
    assert data["tarifas"][0]["tipo"] == "porcentaje"


def test_update_comisionista(authenticated_client):
    create_resp = authenticated_client.post("/api/v1/comisionistas/", json={
        "nombre": "Original",
        "tarifas": [{"tipo": "porcentaje", "valor": "3.0"}],
    })
    cid = create_resp.json()["id"]

    update_resp = authenticated_client.put(f"/api/v1/comisionistas/{cid}", json={
        "nombre": "Actualizado",
        "tarifas": [{"tipo": "fijo_kg", "valor": "1.25"}],
    })
    assert update_resp.status_code == 200
    data = update_resp.json()
    assert data["nombre"] == "Actualizado"
    assert data["tarifas"][0]["tipo"] == "fijo_kg"


def test_delete_comisionista(authenticated_client):
    create_resp = authenticated_client.post("/api/v1/comisionistas/", json={
        "nombre": "Para Eliminar",
        "tarifas": [],
    })
    cid = create_resp.json()["id"]

    del_resp = authenticated_client.delete(f"/api/v1/comisionistas/{cid}")
    assert del_resp.status_code == 204

    list_resp = authenticated_client.get("/api/v1/comisionistas/")
    comisionistas = list_resp.json()
    assert all(c["id"] != cid for c in comisionistas)


def test_delete_comisionista_not_found(authenticated_client):
    fake_id = str(uuid_mod.uuid4())
    response = authenticated_client.delete(f"/api/v1/comisionistas/{fake_id}")
    assert response.status_code == 404
