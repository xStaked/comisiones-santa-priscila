from datetime import datetime, timedelta, timezone

import pytest

from app.models.refresh_token import RefreshToken
from app.routers.auth import _datetime_utc, _hash_token


def test_login_success(client, test_user):
    response = client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "testpassword",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["username"] == "testuser"
    assert "refresh_token" in response.cookies


def test_login_failure_wrong_password(client, test_user):
    response = client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "wrongpassword",
    })
    assert response.status_code == 401


def test_login_failure_nonexistent_user(client):
    response = client.post("/api/v1/auth/login", json={
        "username": "nonexistent",
        "password": "password",
    })
    assert response.status_code == 401


def test_protected_endpoint_rejects_unauthenticated(client):
    response = client.get("/api/v1/auth/me")
    assert response.status_code in (401, 403)


def test_me_endpoint(authenticated_client, test_user):
    response = authenticated_client.get("/api/v1/auth/me")
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == test_user.username
    assert data["email"] == test_user.email


def test_refresh_token_rotation(client, test_user):
    # Login to obtain refresh token
    response = client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "testpassword",
    })
    assert response.status_code == 200
    old_refresh = response.cookies.get("refresh_token")
    assert old_refresh is not None

    # Refresh should succeed and rotate the token
    response = client.post("/api/v1/auth/refresh")
    assert response.status_code == 200
    assert "access_token" in response.json()
    new_refresh = response.cookies.get("refresh_token")
    assert new_refresh is not None
    assert new_refresh != old_refresh

    # Old refresh token should be invalid
    client.cookies.clear()
    response = client.post("/api/v1/auth/refresh", cookies={"refresh_token": old_refresh})
    assert response.status_code == 401


def test_refresh_accepts_timezone_aware_expiration(client, test_user, db_session):
    raw_refresh = "refresh-aware-token"
    db_session.add(
        RefreshToken(
            token_hash=_hash_token(raw_refresh),
            user_id=test_user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        )
    )
    db_session.commit()

    response = client.post(
        "/api/v1/auth/refresh",
        cookies={"refresh_token": raw_refresh},
    )

    assert response.status_code == 200
    assert "access_token" in response.json()


def test_datetime_utc_normaliza_naive_y_aware():
    naive = datetime(2026, 5, 26, 12, 0, 0)
    aware = datetime(2026, 5, 26, 12, 0, 0, tzinfo=timezone.utc)

    assert _datetime_utc(naive).tzinfo == timezone.utc
    assert _datetime_utc(aware).tzinfo == timezone.utc
    assert _datetime_utc(naive) == aware


def test_logout_invalidates_refresh(client, test_user):
    response = client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "testpassword",
    })
    assert response.status_code == 200
    refresh_token = response.cookies.get("refresh_token")
    assert refresh_token is not None

    # Logout
    response = client.post("/api/v1/auth/logout")
    assert response.status_code == 200

    # Old refresh token should be invalid after logout
    client.cookies.clear()
    response = client.post("/api/v1/auth/refresh", cookies={"refresh_token": refresh_token})
    assert response.status_code == 401
