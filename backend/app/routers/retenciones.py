from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.retencion import Retencion
from app.models.user import User
from app.schemas.retencion import RetencionCreate, RetencionResponse

router = APIRouter()


@router.get("/", response_model=list[RetencionResponse])
def listar_retenciones(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Periodos de retención, del más reciente al más antiguo."""
    return db.query(Retencion).order_by(Retencion.vigente_desde.desc()).all()


@router.post(
    "/", response_model=RetencionResponse, status_code=status.HTTP_201_CREATED
)
def crear_retencion(
    data: RetencionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Agrega un tramo de retención.

    Se permiten fechas pasadas (el cliente puede avisar un cambio con meses de
    atraso) y futuras (programar un cambio anunciado). Un tramo retroactivo
    recalcula la vista previa de las facturas aún no liquidadas; lo ya
    liquidado conserva su snapshot.
    """
    existente = (
        db.query(Retencion)
        .filter(Retencion.vigente_desde == data.vigente_desde)
        .first()
    )
    if existente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un tramo con esa fecha de vigencia",
        )
    tramo = Retencion(
        vigente_desde=data.vigente_desde, porcentaje=data.porcentaje
    )
    db.add(tramo)
    db.commit()
    db.refresh(tramo)
    return tramo


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_retencion(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Elimina un tramo. No se permite borrar el último que queda, para que el
    sistema nunca calcule sin retención configurada."""
    tramo = db.query(Retencion).filter(Retencion.id == id).first()
    if not tramo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tramo de retención no encontrado",
        )
    if db.query(Retencion).count() <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede eliminar el último tramo de retención",
        )
    db.delete(tramo)
    db.commit()
