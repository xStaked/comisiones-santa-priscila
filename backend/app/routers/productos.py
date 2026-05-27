from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.producto import Producto, ProductoAlias
from app.models.user import User
from app.schemas.producto import (
    ProductoAliasCreate,
    ProductoAliasResponse,
    ProductoCreate,
    ProductoResponse,
    ProductoUpdate,
)

router = APIRouter()


def _producto_a_respuesta(producto: Producto) -> dict:
    """Convierte un modelo Producto al dict esperado por ProductoResponse."""
    return {
        "id": producto.id,
        "nombre": producto.nombre,
        "unidad_comision": producto.unidad_comision,
        "tacho_kilos": producto.tacho_kilos,
        "activo": producto.activo,
        "alias": [a.alias for a in producto.alias],
    }


@router.get("/", response_model=list[ProductoResponse])
def listar_productos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    productos = db.query(Producto).all()
    return [_producto_a_respuesta(p) for p in productos]


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
        # Crear alias si se proporcionaron
        for alias_texto in data.alias:
            alias_limpio = alias_texto.strip()
            if alias_limpio:
                db.add(ProductoAlias(producto_id=producto.id, alias=alias_limpio))
        if data.alias:
            db.commit()
            db.refresh(producto)
        return _producto_a_respuesta(producto)
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
        # Sincronizar alias: eliminar los actuales y recrear
        db.query(ProductoAlias).filter(ProductoAlias.producto_id == id).delete()
        for alias_texto in data.alias:
            alias_limpio = alias_texto.strip()
            if alias_limpio:
                db.add(ProductoAlias(producto_id=id, alias=alias_limpio))
        db.commit()
        db.refresh(producto)
        return _producto_a_respuesta(producto)
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


# ─── Endpoints de Alias ────────────────────────────────────────────────

@router.post("/{id}/alias", response_model=ProductoAliasResponse, status_code=status.HTTP_201_CREATED)
def crear_alias(
    id: uuid.UUID,
    data: ProductoAliasCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    producto = db.query(Producto).filter(Producto.id == id).first()
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    alias = ProductoAlias(producto_id=id, alias=data.alias.strip())
    db.add(alias)
    try:
        db.commit()
        db.refresh(alias)
        return alias
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.delete("/{id}/alias/{alias_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_alias(
    id: uuid.UUID,
    alias_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alias = (
        db.query(ProductoAlias)
        .filter(ProductoAlias.id == alias_id, ProductoAlias.producto_id == id)
        .first()
    )
    if not alias:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alias no encontrado",
        )

    try:
        db.delete(alias)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
