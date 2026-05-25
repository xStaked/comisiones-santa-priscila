from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.producto import Producto
from app.models.user import User
from app.schemas.producto import (
    ProductoCreate,
    ProductoResponse,
    ProductoUpdate,
)

router = APIRouter()


@router.get("/", response_model=list[ProductoResponse])
def listar_productos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Producto).all()


@router.post(
    "/", response_model=ProductoResponse, status_code=status.HTTP_201_CREATED
)
def crear_producto(
    data: ProductoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    producto = Producto(
        nombre=data.nombre,
        unidad_comision=data.unidad_comision,
        tacho_kilos=data.tacho_kilos,
    )
    db.add(producto)
    try:
        db.commit()
        db.refresh(producto)
        return producto
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.put("/{id}", response_model=ProductoResponse)
def actualizar_producto(
    id: uuid.UUID,
    data: ProductoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    producto = db.query(Producto).filter(Producto.id == id).first()
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    producto.nombre = data.nombre
    producto.unidad_comision = data.unidad_comision
    producto.tacho_kilos = data.tacho_kilos

    try:
        db.commit()
        db.refresh(producto)
        return producto
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_producto(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    producto = db.query(Producto).filter(Producto.id == id).first()
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    try:
        db.delete(producto)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
