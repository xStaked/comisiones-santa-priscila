import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, get_db
from app.models.user import User
from app.security import get_password_hash

SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db):
    yield TestClient(app)


@pytest.fixture(scope="function")
def test_user(db):
    user = User(
        username="testuser",
        email="test@example.com",
        hashed_password=get_password_hash("testpass123"),
        is_active=True,
        is_superuser=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="function")
def auth_client(client, test_user):
    res = client.post("/api/v1/auth/login", json={"username": "testuser", "password": "testpass123"})
    token = res.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    yield client
    del client.headers["Authorization"]
