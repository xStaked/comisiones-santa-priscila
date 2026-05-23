def test_list_comisionistas_empty(auth_client):
    res = auth_client.get("/api/v1/comisionistas")
    assert res.status_code == 200
    assert res.json() == []


def test_create_comisionista(auth_client):
    payload = {
        "nombre": "Carlos Test",
        "tarifas": [{"tipo": "porcentaje", "valor": 2.5}],
    }
    res = auth_client.post("/api/v1/comisionistas", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["nombre"] == "Carlos Test"
    assert len(data["tarifas"]) == 1


def test_create_comisionista_unauthorized(client):
    payload = {"nombre": "Hack", "tarifas": []}
    res = client.post("/api/v1/comisionistas", json=payload)
    assert res.status_code == 403
