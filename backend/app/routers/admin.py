from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.dependencies import get_current_superuser
from app.commands.seed_demo import truncate_all, seed_comisionistas, seed_ordenes, seed_liquidaciones

router = APIRouter()


@router.post("/seed-demo")
def seed_demo(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    try:
        truncate_all(db)
        comisionistas = seed_comisionistas(db)
        ordenes = seed_ordenes(db, comisionistas)
        seed_liquidaciones(db, ordenes, comisionistas)
        return {"detail": "Datos de demo regenerados correctamente"}
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al regenerar datos de demo: {exc}",
        ) from exc
