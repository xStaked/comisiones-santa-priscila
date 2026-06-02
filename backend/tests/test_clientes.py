from app.models.cliente import Cliente, Finca


def test_actualiza_finca_solo_con_nombre(authenticated_client, db_session):
    cliente = Cliente(nombre="Grupo Test", tipo="grupo")
    db_session.add(cliente)
    db_session.commit()
    db_session.refresh(cliente)

    finca = Finca(nombre="Finca Original", cliente_id=cliente.id)
    db_session.add(finca)
    db_session.commit()
    db_session.refresh(finca)

    response = authenticated_client.put(
        f"/api/v1/clientes/{cliente.id}/fincas/{finca.id}",
        json={"nombre": "Finca Actualizada"},
    )

    assert response.status_code == 200
    assert response.json()["nombre"] == "Finca Actualizada"
