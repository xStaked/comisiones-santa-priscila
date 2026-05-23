from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.user import User
from app.models.comisionista import Comisionista, Tarifa, TipoTarifa
from app.models.orden import Asignacion
from app.schemas.comisionista import (
    ComisionistaCreate,
    ComisionistaResponse,
    ComisionistaUpdate,
)
from app.dependencies import get_current_user

router = APIRouter()


@router.get("/", response_model=list[ComisionistaResponse])
def listar_comisionistas(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(Comisionista)
        .options(selectinload(Comisionista.tarifas))
        .all()
    )


@router.post(
    "/", response_model=ComisionistaResponse, status_code=status.HTTP_201_CREATED
)
def crear_comisionista(data: ComisionistaCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    comisionista = Comisionista(nombre=data.nombre)
    db.add(comisionista)
    db.flush()

    for t in data.tarifas:
        db.add(
            Tarifa(
                comisionista_id=comisionista.id,
                tipo=TipoTarifa(t.tipo),
                valor=t.valor,
            )
        )

    try:
        db.commit()
        db.refresh(comisionista)
        return comisionista
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.put("/{id}", response_model=ComisionistaResponse)
def actualizar_comisionista(
    id: uuid.UUID, data: ComisionistaUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    comisionista = (
        db.query(Comisionista).filter(Comisionista.id == id).first()
    )
    if not comisionista:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comisionista no encontrado",
        )

    comisionista.nombre = data.nombre

    db.query(Tarifa).filter(Tarifa.comisionista_id == id).delete(
        synchronize_session=False
    )

    for t in data.tarifas:
        db.add(
            Tarifa(
                comisionista_id=comisionista.id,
                tipo=TipoTarifa(t.tipo),
                valor=t.valor,
            )
        )

    try:
        db.commit()
        db.refresh(comisionista)
        return comisionista
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_comisionista(id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    comisionista = (
        db.query(Comisionista).filter(Comisionista.id == id).first()
    )
    if not comisionista:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comisionista no encontrado",
        )

    asignacion = (
        db.query(Asignacion)
        .filter(Asignacion.comisionista_id == id)
        .first()
    )
    if asignacion:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede eliminar: el comisionista tiene asignaciones activas",
        )

    try:
        db.delete(comisionista)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
