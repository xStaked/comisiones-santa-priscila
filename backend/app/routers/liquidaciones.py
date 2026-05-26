from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.user import User
from app.models.liquidacion import Liquidacion, LiquidacionItem, LiquidacionItemTarifa
from app.schemas.liquidacion import LiquidacionCreate
from app.services.liquidacion import (
    crear_liquidacion,
    eliminar_liquidacion,
    restaurar_liquidacion,
)
from app.dependencies import get_current_user

router = APIRouter()


@router.get("/")
def listar_liquidaciones(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    liquidaciones = db.query(Liquidacion).all()
    return [
        {
            "id": liq.id,
            "nombre": liq.nombre,
            "mes": liq.mes,
            "fecha_creacion": liq.fecha_creacion,
        }
        for liq in liquidaciones
    ]


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear(data: LiquidacionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        liquidacion = crear_liquidacion(
            db, data.nombre, data.orden_item_ids
        )
        return {
            "id": liquidacion.id,
            "nombre": liquidacion.nombre,
            "mes": liquidacion.mes,
            "fecha_creacion": liquidacion.fecha_creacion,
        }
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.get("/{id}")
def detalle(id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    liquidacion = (
        db.query(Liquidacion)
        .options(
            selectinload(Liquidacion.items).selectinload(
                LiquidacionItem.tarifas
            )
        )
        .filter(Liquidacion.id == id)
        .first()
    )
    if not liquidacion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Liquidación no encontrada",
        )

    items = []
    for li in liquidacion.items:
        tarifas = [
            {
                "id": t.id,
                "comisionista_id": t.comisionista_id,
                "comisionista_nombre_snapshot": t.comisionista_nombre_snapshot,
                "tipo_snapshot": t.tipo_snapshot,
                "valor_snapshot": t.valor_snapshot,
                "comision_calculada": t.comision_calculada,
            }
            for t in li.tarifas
        ]
        items.append(
            {
                "id": li.id,
                "orden_item_id": li.orden_item_id,
                "orden_id": li.orden_id,
                "fecha_snapshot": li.fecha_snapshot,
                "numero_orden_snapshot": li.numero_orden_snapshot,
                "finca_snapshot": li.finca_snapshot,
                "producto_snapshot": li.producto_snapshot,
                "cantidad_snapshot": li.cantidad_snapshot,
                "unidad_snapshot": li.unidad_snapshot,
                "precio_unitario_snapshot": li.precio_unitario_snapshot,
                "total_snapshot": li.total_snapshot,
                "sector_snapshot": li.sector_snapshot,
                "estado_snapshot": li.estado_snapshot,
                "cliente_snapshot": li.cliente_snapshot,
                "retencion_porcentaje_snapshot": li.retencion_porcentaje_snapshot,
                "tarifas": tarifas,
            }
        )

    return {
        "id": liquidacion.id,
        "nombre": liquidacion.nombre,
        "mes": liquidacion.mes,
        "fecha_creacion": liquidacion.fecha_creacion,
        "items": items,
    }


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        eliminar_liquidacion(db, id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.post("/{id}/restaurar")
def restaurar(id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        nuevos_ids = restaurar_liquidacion(db, id)
        return {"nuevos_orden_item_ids": nuevos_ids}
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
