from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.retencion import Retencion
from app.models.user import User
from app.schemas.retencion import RetencionResponse

router = APIRouter()


@router.get("/", response_model=list[RetencionResponse])
def listar_retenciones(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Periodos de retención, del más reciente al más antiguo.

    Solo lectura: los tramos se cargan por migración, no desde la UI.
    """
    return db.query(Retencion).order_by(Retencion.vigente_desde.desc()).all()
