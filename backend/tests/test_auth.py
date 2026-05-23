def test_login_success(client, test_user):
    res = client.post("/api/v1/auth/login", json={"username": "testuser", "password": "testpass123"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["username"] == "testuser"


def test_login_failure(client):
    res = client.post("/api/v1/auth/login", json={"username": "bad", "password": "bad"})
    assert res.status_code == 401


def test_protected_endpoint_without_auth(client):
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 403


def test_me_endpoint(auth_client, test_user):
    res = auth_client.get("/api/v1/auth/me")
    assert res.status_code == 200
    assert res.json()["username"] == "testuser"


def test_logout(auth_client):
    res = auth_client.post("/api/v1/auth/logout")
    assert res.status_code == 200
