from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.cliente import Cliente, Finca
from app.models.grupo import Grupo
from app.models.user import User
from app.schemas.cliente import (
    ClienteCreate,
    ClienteResponse,
    ClienteUpdate,
    FincaCreate,
    FincaResponse,
    FincaUpdate,
)

router = APIRouter()


def _validar_grupo(db: Session, grupo_id: uuid.UUID | None) -> None:
    if grupo_id is not None:
        grupo = db.query(Grupo).filter(Grupo.id == grupo_id).first()
        if not grupo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Grupo no encontrado",
            )


@router.get("/", response_model=list[ClienteResponse])
def listar_clientes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Cliente)
        .options(selectinload(Cliente.fincas), selectinload(Cliente.grupo))
        .all()
    )


@router.post(
    "/", response_model=ClienteResponse, status_code=status.HTTP_201_CREATED
)
def crear_cliente(
    data: ClienteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validar_grupo(db, data.grupo_id)
    cliente = Cliente(
        nombre=data.nombre,
        tipo=data.tipo,
        retencion_porcentaje=data.retencion_porcentaje,
        grupo_id=data.grupo_id,
    )
    db.add(cliente)
    try:
        db.commit()
        db.refresh(cliente)
        return cliente
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.put("/{id}", response_model=ClienteResponse)
def actualizar_cliente(
    id: uuid.UUID,
    data: ClienteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cliente = db.query(Cliente).filter(Cliente.id == id).first()
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado",
        )

    _validar_grupo(db, data.grupo_id)
    cliente.nombre = data.nombre
    cliente.tipo = data.tipo
    cliente.retencion_porcentaje = data.retencion_porcentaje
    cliente.grupo_id = data.grupo_id

    try:
        db.commit()
        db.refresh(cliente)
        return cliente
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_cliente(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cliente = db.query(Cliente).filter(Cliente.id == id).first()
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado",
        )

    # TODO: verificar que no tenga órdenes asociadas cuando se implemente la relación
    try:
        db.delete(cliente)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.get("/{id}/fincas", response_model=list[FincaResponse])
def listar_fincas_cliente(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cliente = db.query(Cliente).filter(Cliente.id == id).first()
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado",
        )
    return cliente.fincas


@router.post(
    "/{id}/fincas",
    response_model=FincaResponse,
    status_code=status.HTTP_201_CREATED,
)
def crear_finca(
    id: uuid.UUID,
    data: FincaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cliente = db.query(Cliente).filter(Cliente.id == id).first()
    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado",
        )

    finca = Finca(nombre=data.nombre, cliente_id=id)
    db.add(finca)
    try:
        db.commit()
        db.refresh(finca)
        return finca
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.put("/{id}/fincas/{finca_id}", response_model=FincaResponse)
def actualizar_finca(
    id: uuid.UUID,
    finca_id: uuid.UUID,
    data: FincaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    finca = (
        db.query(Finca)
        .filter(Finca.id == finca_id, Finca.cliente_id == id)
        .first()
    )
    if not finca:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Finca no encontrada",
        )

    finca.nombre = data.nombre

    try:
        db.commit()
        db.refresh(finca)
        return finca
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.delete(
    "/{id}/fincas/{finca_id}", status_code=status.HTTP_204_NO_CONTENT
)
def eliminar_finca(
    id: uuid.UUID,
    finca_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    finca = (
        db.query(Finca)
        .filter(Finca.id == finca_id, Finca.cliente_id == id)
        .first()
    )
    if not finca:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Finca no encontrada",
        )

    try:
        db.delete(finca)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
