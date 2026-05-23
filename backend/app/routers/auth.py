from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.schemas.auth import LoginRequest, LoginResponse, RefreshResponse, RegisterRequest, UserResponse
from app.security import verify_password, get_password_hash, create_access_token
from app.dependencies import get_current_user, get_current_superuser
from app.rate_limit import rate_limit

router = APIRouter()

REFRESH_COOKIE_NAME = "refresh_token"


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _create_refresh_cookie(response: Response, db: Session, user_id: uuid.UUID) -> str:
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    refresh = RefreshToken(token_hash=token_hash, user_id=user_id, expires_at=expires_at)
    db.add(refresh)
    db.commit()

    max_age = int(timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS).total_seconds())
    secure = settings.ENV == "production"
    samesite = "strict" if settings.ENV == "production" else "lax"

    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_token,
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=max_age,
        # Common path for /refresh and /logout (both under /api/v1/auth)
        path="/api/v1/auth",
    )
    return raw_token


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/api/v1/auth")


@router.post("/login", response_model=LoginResponse)
def login(
    request: Request,
    response: Response,
    data: LoginRequest,
    db: Session = Depends(get_db),
    _rate: None = Depends(rate_limit),
):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo")

    access_token = create_access_token({"sub": str(user.id)})
    _create_refresh_cookie(response, db, user.id)

    return LoginResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/refresh", response_model=RefreshResponse)
def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    _rate: None = Depends(rate_limit),
):
    raw_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    token_hash = _hash_token(raw_token)
    refresh_record = (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == token_hash)
        .first()
    )

    if not refresh_record or refresh_record.expires_at < datetime.utcnow():
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido o expirado")

    user = db.query(User).filter(User.id == refresh_record.user_id).first()
    if not user or not user.is_active:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado o inactivo")

    # Rotate refresh token
    db.delete(refresh_record)
    db.commit()

    access_token = create_access_token({"sub": str(user.id)})
    _create_refresh_cookie(response, db, user.id)

    return RefreshResponse(access_token=access_token)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    _rate: None = Depends(rate_limit),
):
    raw_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if raw_token:
        token_hash = _hash_token(raw_token)
        db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).delete(synchronize_session=False)
        db.commit()

    _clear_refresh_cookie(response)
    return {"detail": "Sesión cerrada"}


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(
    data: RegisterRequest,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_superuser),
    _rate: None = Depends(rate_limit),
):
    existing = db.query(User).filter(
        (User.username == data.username) | (User.email == data.email)
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuario o email ya existe")

    user = User(
        username=data.username,
        email=data.email,
        hashed_password=get_password_hash(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)
