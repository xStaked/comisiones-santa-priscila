from __future__ import annotations

from datetime import date
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.comisionista import Comisionista
from app.models.orden import Asignacion, EstadoOrden, OrdenItem
from app.schemas.orden import OrdenItemCreate, OrdenItemResponse, OrdenItemUpdate

router = APIRouter()


class ComisionistaAsignacionBody(BaseModel):
    comisionista_id: UUID


class AsignarGlobalBody(BaseModel):
    orden_ids: List[UUID]
    comisionista_ids: List[UUID]


@router.get("/", response_model=list[OrdenItemResponse])
def listar_ordenes(
    finca: str | None = None,
    producto: str | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(OrdenItem)
        .options(selectinload(OrdenItem.asignaciones))
        .filter(OrdenItem.estado != EstadoOrden.anulado)
    )

    if finca:
        query = query.filter(OrdenItem.finca.ilike(f"%{finca}%"))
    if producto:
        query = query.filter(OrdenItem.producto.ilike(f"%{producto}%"))
    if fecha_desde:
        query = query.filter(OrdenItem.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.filter(OrdenItem.fecha <= fecha_hasta)

    return query.all()


@router.post(
    "/", response_model=list[OrdenItemResponse], status_code=status.HTTP_201_CREATED
)
def crear_ordenes(items: List[OrdenItemCreate], db: Session = Depends(get_db)):
    resultados: list[OrdenItem] = []

    try:
        for item in items:
            oi = OrdenItem(
                fecha=item.fecha,
                numero_orden=item.numero_orden,
                finca=item.finca,
                producto=item.producto,
                cantidad=item.cantidad,
                unidad=item.unidad,
                precio_unitario=item.precio_unitario,
                total=item.total,
                sector=item.sector,
                estado=EstadoOrden.activo,
            )
            db.add(oi)
            db.flush()

            for cid in item.comisionista_ids:
                db.add(Asignacion(orden_item_id=oi.id, comisionista_id=cid))

            resultados.append(oi)

        db.commit()
        for oi in resultados:
            db.refresh(oi)
        return resultados
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.put("/{id}", response_model=OrdenItemResponse)
def actualizar_orden(
    id: UUID, data: OrdenItemUpdate, db: Session = Depends(get_db)
):
    oi = db.query(OrdenItem).filter(OrdenItem.id == id).first()
    if not oi:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada"
        )

    update_data = data.model_dump(exclude_unset=True)
    if "estado" in update_data:
        update_data["estado"] = EstadoOrden(update_data["estado"])

    for field, value in update_data.items():
        setattr(oi, field, value)

    try:
        db.commit()
        db.refresh(oi)
        return oi
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_orden(id: UUID, db: Session = Depends(get_db)):
    oi = db.query(OrdenItem).filter(OrdenItem.id == id).first()
    if not oi:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada"
        )

    oi.estado = EstadoOrden.anulado
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.post("/{id}/comisionistas", status_code=status.HTTP_201_CREATED)
def agregar_comisionista(
    id: UUID,
    body: ComisionistaAsignacionBody,
    db: Session = Depends(get_db),
):
    oi = db.query(OrdenItem).filter(OrdenItem.id == id).first()
    if not oi:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada"
        )

    existe = (
        db.query(Asignacion)
        .filter(
            Asignacion.orden_item_id == id,
            Asignacion.comisionista_id == body.comisionista_id,
        )
        .first()
    )
    if existe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comisionista ya está asignado a esta orden",
        )

    db.add(
        Asignacion(orden_item_id=id, comisionista_id=body.comisionista_id)
    )
    try:
        db.commit()
        return {"message": "Comisionista asignado"}
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.delete(
    "/{id}/comisionistas/{comisionista_id}", status_code=status.HTTP_204_NO_CONTENT
)
def quitar_comisionista(
    id: UUID, comisionista_id: UUID, db: Session = Depends(get_db)
):
    asignacion = (
        db.query(Asignacion)
        .filter(
            Asignacion.orden_item_id == id,
            Asignacion.comisionista_id == comisionista_id,
        )
        .first()
    )
    if not asignacion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asignación no encontrada",
        )

    try:
        db.delete(asignacion)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.post("/asignar-global")
def asignar_global(body: AsignarGlobalBody, db: Session = Depends(get_db)):
    ordenes = (
        db.query(OrdenItem)
        .filter(OrdenItem.id.in_(body.orden_ids))
        .all()
    )
    found_ids = {o.id for o in ordenes}
    missing = set(body.orden_ids) - found_ids
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Órdenes no encontradas: {missing}",
        )

    try:
        for oi in ordenes:
            db.query(Asignacion).filter(
                Asignacion.orden_item_id == oi.id
            ).delete(synchronize_session=False)

            for cid in body.comisionista_ids:
                db.add(
                    Asignacion(
                        orden_item_id=oi.id, comisionista_id=cid
                    )
                )

        db.commit()
        return {"message": "Asignaciones actualizadas"}
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
