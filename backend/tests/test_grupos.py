from app.models.cliente import Cliente


def test_crud_grupos_y_asignacion_a_cliente(authenticated_client, db_session):
    cliente = Cliente(nombre="CLIENTE TEST GRUPO")
    db_session.add(cliente)
    db_session.commit()

    # Crear grupo
    resp = authenticated_client.post("/api/v1/grupos/", json={"nombre": "Grupo Santa Priscila"})
    assert resp.status_code == 201
    grupo_id = resp.json()["id"]

    # Listar
    resp = authenticated_client.get("/api/v1/grupos/")
    assert resp.status_code == 200
    assert any(g["nombre"] == "Grupo Santa Priscila" for g in resp.json())

    # Asignar a cliente
    resp = authenticated_client.put(
        f"/api/v1/clientes/{cliente.id}",
        json={"nombre": "CLIENTE TEST GRUPO", "grupoId": grupo_id},
    )
    assert resp.status_code == 200
    assert resp.json()["grupoId"] == grupo_id
    assert resp.json()["grupo"]["nombre"] == "Grupo Santa Priscila"

    # El listado de clientes incluye el grupo
    resp = authenticated_client.get("/api/v1/clientes/")
    encontrado = next(c for c in resp.json() if c["nombre"] == "CLIENTE TEST GRUPO")
    assert encontrado["grupo"]["nombre"] == "Grupo Santa Priscila"

    # Desasignar
    resp = authenticated_client.put(
        f"/api/v1/clientes/{cliente.id}",
        json={"nombre": "CLIENTE TEST GRUPO", "grupoId": None},
    )
    assert resp.status_code == 200
    assert resp.json()["grupoId"] is None

    # Eliminar grupo
    resp = authenticated_client.delete(f"/api/v1/grupos/{grupo_id}")
    assert resp.status_code == 204


def test_asignar_grupo_inexistente_a_cliente(authenticated_client, db_session):
    cliente = Cliente(nombre="CLIENTE GRUPO INEXISTENTE")
    db_session.add(cliente)
    db_session.commit()

    resp = authenticated_client.put(
        f"/api/v1/clientes/{cliente.id}",
        json={"nombre": "CLIENTE GRUPO INEXISTENTE", "grupoId": "00000000-0000-0000-0000-000000000000"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Grupo no encontrado"


def test_crear_cliente_con_grupo(authenticated_client):
    resp = authenticated_client.post("/api/v1/grupos/", json={"nombre": "Grupo Alta Mar"})
    grupo_id = resp.json()["id"]

    resp = authenticated_client.post(
        "/api/v1/clientes/",
        json={"nombre": "CLIENTE CON GRUPO", "grupoId": grupo_id},
    )
    assert resp.status_code == 201
    assert resp.json()["grupoId"] == grupo_id


def test_grupo_nombre_duplicado(authenticated_client):
    resp = authenticated_client.post("/api/v1/grupos/", json={"nombre": "Repetido"})
    assert resp.status_code == 201
    resp = authenticated_client.post("/api/v1/grupos/", json={"nombre": "Repetido"})
    assert resp.status_code == 409
