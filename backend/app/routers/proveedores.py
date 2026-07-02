from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.grupo import Grupo
from app.models.proveedor import Proveedor
from app.models.user import User
from app.schemas.proveedor import ProveedorResponse, ProveedorUpdate

router = APIRouter()


def _serializar(p: Proveedor) -> ProveedorResponse:
    return ProveedorResponse(
        id=p.id,
        nombre=p.nombre,
        grupoId=p.grupo_id,
        grupo=p.grupo.nombre if p.grupo else None,
    )


@router.get("/", response_model=list[ProveedorResponse])
def listar_proveedores(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    proveedores = (
        db.query(Proveedor)
        .options(selectinload(Proveedor.grupo))
        .order_by(Proveedor.nombre)
        .all()
    )
    return [_serializar(p) for p in proveedores]


@router.put("/{id}", response_model=ProveedorResponse)
def actualizar_proveedor(
    id: uuid.UUID,
    data: ProveedorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    proveedor = db.query(Proveedor).filter(Proveedor.id == id).first()
    if not proveedor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado"
        )
    if data.grupo_id is not None:
        grupo = db.query(Grupo).filter(Grupo.id == data.grupo_id).first()
        if not grupo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Grupo no encontrado"
            )
    proveedor.grupo_id = data.grupo_id
    db.commit()
    db.refresh(proveedor)
    return _serializar(proveedor)
