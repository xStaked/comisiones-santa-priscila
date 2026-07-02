from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.grupo import Grupo
from app.models.user import User
from app.schemas.grupo import GrupoCreate, GrupoResponse

router = APIRouter()


@router.get("/", response_model=list[GrupoResponse])
def listar_grupos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Grupo).order_by(Grupo.nombre).all()


@router.post("/", response_model=GrupoResponse, status_code=status.HTTP_201_CREATED)
def crear_grupo(
    data: GrupoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    grupo = Grupo(nombre=data.nombre.strip())
    db.add(grupo)
    try:
        db.commit()
        db.refresh(grupo)
        return grupo
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un grupo con ese nombre",
        ) from exc


@router.put("/{id}", response_model=GrupoResponse)
def actualizar_grupo(
    id: uuid.UUID,
    data: GrupoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    grupo = db.query(Grupo).filter(Grupo.id == id).first()
    if not grupo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grupo no encontrado")
    grupo.nombre = data.nombre.strip()
    try:
        db.commit()
        db.refresh(grupo)
        return grupo
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un grupo con ese nombre",
        ) from exc


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_grupo(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    grupo = db.query(Grupo).filter(Grupo.id == id).first()
    if not grupo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grupo no encontrado")
    db.delete(grupo)
    db.commit()
