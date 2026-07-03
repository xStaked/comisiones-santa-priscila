from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.proveedor import Proveedor
from app.models.user import User
from app.schemas.proveedor import ProveedorResponse

router = APIRouter()


@router.get("/", response_model=list[ProveedorResponse])
def listar_proveedores(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Proveedor).order_by(Proveedor.nombre).all()
