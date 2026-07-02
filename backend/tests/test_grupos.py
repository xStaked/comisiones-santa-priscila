from app.models.proveedor import Proveedor


def test_crud_grupos_y_asignacion_a_proveedor(authenticated_client, db_session):
    proveedor = Proveedor(nombre="PROVEEDOR TEST GRUPO")
    db_session.add(proveedor)
    db_session.commit()

    # Crear grupo
    resp = authenticated_client.post("/api/v1/grupos/", json={"nombre": "Grupo Santa Priscila"})
    assert resp.status_code == 201
    grupo_id = resp.json()["id"]

    # Listar
    resp = authenticated_client.get("/api/v1/grupos/")
    assert resp.status_code == 200
    assert any(g["nombre"] == "Grupo Santa Priscila" for g in resp.json())

    # Asignar a proveedor
    resp = authenticated_client.put(
        f"/api/v1/proveedores/{proveedor.id}", json={"grupo_id": grupo_id}
    )
    assert resp.status_code == 200
    assert resp.json()["grupoId"] == grupo_id
    assert resp.json()["grupo"] == "Grupo Santa Priscila"

    # El listado de proveedores incluye el grupo
    resp = authenticated_client.get("/api/v1/proveedores/")
    encontrado = next(p for p in resp.json() if p["nombre"] == "PROVEEDOR TEST GRUPO")
    assert encontrado["grupo"] == "Grupo Santa Priscila"

    # Desasignar
    resp = authenticated_client.put(
        f"/api/v1/proveedores/{proveedor.id}", json={"grupo_id": None}
    )
    assert resp.status_code == 200
    assert resp.json()["grupoId"] is None

    # Eliminar grupo
    resp = authenticated_client.delete(f"/api/v1/grupos/{grupo_id}")
    assert resp.status_code == 204


def test_grupo_nombre_duplicado(authenticated_client):
    resp = authenticated_client.post("/api/v1/grupos/", json={"nombre": "Repetido"})
    assert resp.status_code == 201
    resp = authenticated_client.post("/api/v1/grupos/", json={"nombre": "Repetido"})
    assert resp.status_code == 409
