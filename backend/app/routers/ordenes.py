from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, List
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.user import User
from app.models.orden import Asignacion, EstadoOrden, Orden, OrdenItem
from app.schemas.orden import OrdenCreate, OrdenItemCreate, OrdenItemResponse, OrdenItemUpdate
from app.dependencies import get_current_user
from app.services.liquidacion import (
    _buscar_tarifa_especifica,
    _tiene_tarifas_especificas,
)

router = APIRouter()


def _comisionistas_aplicables(
    db: Session, oi: OrdenItem, comisionista_ids: list[UUID]
) -> list[UUID]:
    """Filtra los comisionistas que realmente cobran en este ítem.

    Un comisionista se asigna a un ítem solo si tiene una tarifa específica que
    aplica a su (cliente, producto, sector), o si no tiene ninguna tarifa
    específica configurada (en cuyo caso usa las globales). Esto refleja
    exactamente la lógica de pago de liquidacion.py y evita asignar comisionistas
    a sectores que no les corresponden (comisiones infladas).
    """
    aplicables: list[UUID] = []
    for cid in comisionista_ids:
        if _buscar_tarifa_especifica(db, oi, cid) is not None:
            aplicables.append(cid)
        elif not _tiene_tarifas_especificas(db, cid):
            aplicables.append(cid)
    return aplicables


class ComisionistaAsignacionBody(BaseModel):
    comisionista_id: UUID


class AsignarGlobalBody(BaseModel):
    orden_ids: List[UUID]
    comisionista_ids: List[UUID]


class ComisionistasOrdenBody(BaseModel):
    comisionista_ids: List[UUID]


class EstadoOrdenBody(BaseModel):
    estado: str


def _parse_estado_orden(value: str) -> EstadoOrden:
    try:
        return EstadoOrden(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Estado de orden inválido",
        ) from exc


def _item_o_grupo_tiene_items_liquidados(db: Session, item: OrdenItem) -> bool:
    if item.estado == EstadoOrden.liquidada:
        return True
    if not item.orden_id:
        return False
    return (
        db.query(OrdenItem.id)
        .filter(
            OrdenItem.orden_id == item.orden_id,
            OrdenItem.estado == EstadoOrden.liquidada,
        )
        .first()
        is not None
    )


@router.get("/")
def listar_ordenes(
    agrupadas: bool = False,
    finca: str | None = None,
    producto: str | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(OrdenItem)
        .options(
            selectinload(OrdenItem.asignaciones),
            selectinload(OrdenItem.cliente),
            selectinload(OrdenItem.producto_obj),
            selectinload(OrdenItem.finca_obj),
            selectinload(OrdenItem.orden).selectinload(Orden.items),
        )
        # Se eliminan físicamente; no hay soft-delete
    )

    if finca:
        query = query.filter(OrdenItem.finca.ilike(f"%{finca}%"))
    if producto:
        query = query.filter(OrdenItem.producto.ilike(f"%{producto}%"))
    if fecha_desde:
        query = query.filter(OrdenItem.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.filter(OrdenItem.fecha <= fecha_hasta)

    items = query.all()
    if not agrupadas:
        return [_serializar_item(item) for item in items]

    return _serializar_ordenes_agrupadas(items)


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_ordenes(
    payload: Any = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resultados: list[OrdenItem] = []

    try:
        if isinstance(payload, list):
            ordenes_por_clave: dict[tuple[date, str, str | None], Orden] = {}
            for raw_item in payload:
                item = OrdenItemCreate.model_validate(raw_item)
                clave = (item.fecha, item.numero_orden, item.proveedor)
                orden = ordenes_por_clave.get(clave)
                if not orden:
                    orden = Orden(
                        fecha=item.fecha,
                        numero_orden=item.numero_orden,
                        cliente_id=None,
                        proveedor=item.proveedor,
                        origen="manual",
                        estado=EstadoOrden.pendiente,
                    )
                    db.add(orden)
                    db.flush()
                    ordenes_por_clave[clave] = orden
                oi = _crear_orden_item(db, item, orden.id)
                resultados.append(oi)

            db.commit()
            for oi in resultados:
                db.refresh(oi)
            return resultados

        orden_data = OrdenCreate.model_validate(payload)
        orden = Orden(
            fecha=orden_data.fecha,
            numero_orden=orden_data.numero_orden,
            cliente_id=orden_data.cliente_id,
            proveedor=orden_data.proveedor,
            semana=orden_data.semana,
            archivo_nombre=orden_data.archivo_nombre,
            origen=orden_data.origen,
            estado=EstadoOrden.pendiente,
        )
        db.add(orden)
        db.flush()

        for linea in orden_data.items:
            item = OrdenItemCreate(
                fecha=orden_data.fecha,
                numero_orden=orden_data.numero_orden,
                finca=linea.finca,
                producto=linea.producto,
                cantidad=linea.cantidad,
                unidad=linea.unidad,
                precio_unitario=linea.precio_unitario,
                total=linea.total,
                sector=linea.sector,
                estado=linea.estado,
                comisionista_ids=linea.comisionista_ids,
                cliente_id=linea.cliente_id or orden_data.cliente_id,
                producto_id=linea.producto_id,
                finca_id=linea.finca_id,
            )
            oi = _crear_orden_item(db, item, orden.id)
            resultados.append(oi)

        db.commit()
        db.refresh(orden)
        return _serializar_orden(orden)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


def _crear_orden_item(db: Session, item: OrdenItemCreate, orden_id: UUID) -> OrdenItem:
    oi = OrdenItem(
        orden_id=orden_id,
        fecha=item.fecha,
        numero_orden=item.numero_orden,
        finca=item.finca,
        producto=item.producto,
        cantidad=item.cantidad,
        unidad=item.unidad,
        precio_unitario=item.precio_unitario,
        total=item.total,
        sector=item.sector,
        estado=EstadoOrden.pendiente,
        cliente_id=item.cliente_id,
        producto_id=item.producto_id,
        finca_id=item.finca_id,
    )
    db.add(oi)
    db.flush()

    for cid in _comisionistas_aplicables(db, oi, item.comisionista_ids):
        db.add(Asignacion(orden_item_id=oi.id, comisionista_id=cid))

    return oi


def _serializar_item(item: OrdenItem) -> dict[str, Any]:
    data = OrdenItemResponse.model_validate(item).model_dump(by_alias=True)
    data["proveedor"] = item.orden.proveedor if item.orden else None
    return data


def _serializar_orden(orden: Orden) -> dict[str, Any]:
    items = orden.items
    return {
        "id": orden.id,
        "fecha": orden.fecha,
        "numero_orden": orden.numero_orden,
        "cliente_id": orden.cliente_id,
        "proveedor": orden.proveedor,
        "semana": orden.semana,
        "archivo_nombre": orden.archivo_nombre,
        "origen": orden.origen,
        "estado": orden.estado.value,
        "total": sum((item.total for item in items), Decimal("0")),
        "cantidad_productos": len(items),
        "items": [_serializar_item(item) for item in items],
    }


def _serializar_ordenes_agrupadas(items: list[OrdenItem]) -> list[dict[str, Any]]:
    ordenes: dict[UUID, Orden] = {}
    items_sin_cabecera: dict[tuple[date, str, UUID | None], list[OrdenItem]] = {}

    for item in items:
        if item.orden:
            ordenes[item.orden.id] = item.orden
        else:
            clave = (item.fecha, item.numero_orden, item.cliente_id)
            items_sin_cabecera.setdefault(clave, []).append(item)

    resultado = [_serializar_orden(orden) for orden in ordenes.values()]

    for (fecha, numero_orden, cliente_id), grupo_items in items_sin_cabecera.items():
        resultado.append(
            {
                "id": grupo_items[0].id,
                "fecha": fecha,
                "numero_orden": numero_orden,
                "cliente_id": cliente_id,
                "proveedor": None,
                "semana": None,
                "archivo_nombre": None,
                "origen": "manual",
                "estado": EstadoOrden.pendiente.value,
                "total": sum((item.total for item in grupo_items), Decimal("0")),
                "cantidad_productos": len(grupo_items),
                "items": [_serializar_item(item) for item in grupo_items],
            }
        )

    return resultado


@router.post("/limpiar")
def limpiar_ordenes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tiene_ordenes_liquidadas = (
        db.query(Orden.id).filter(Orden.estado == EstadoOrden.liquidada).first()
        is not None
    )
    tiene_items_liquidados = (
        db.query(OrdenItem.id).filter(OrdenItem.estado == EstadoOrden.liquidada).first()
        is not None
    )
    if tiene_ordenes_liquidadas or tiene_items_liquidados:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pueden limpiar órdenes con ítems liquidados",
        )

    try:
        # Eliminar ítems sueltos (sin orden padre)
        count_items = db.query(OrdenItem).filter(OrdenItem.orden_id.is_(None)).delete(synchronize_session=False)
        # Eliminar órdenes (cascade borra sus ítems automáticamente)
        count_ordenes = db.query(Orden).delete(synchronize_session=False)
        db.commit()
        return {"message": f"{count_ordenes} orden(es) y {count_items} ítem(s) eliminado(s)"}
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.put("/{id}", response_model=OrdenItemResponse)
def actualizar_orden(
    id: UUID, data: OrdenItemUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    oi = db.query(OrdenItem).filter(OrdenItem.id == id).first()
    if not oi:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada"
        )
    update_data = data.model_dump(exclude_unset=True)
    comisionista_ids = update_data.pop("comisionista_ids", None)
    if "estado" in update_data:
        nuevo_estado = _parse_estado_orden(update_data["estado"])
        if nuevo_estado == EstadoOrden.liquidada:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El estado liquidada se asigna al guardar una liquidación",
            )
        update_data["estado"] = nuevo_estado

    if _item_o_grupo_tiene_items_liquidados(db, oi):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede modificar un ítem liquidado",
        )

    for field, value in update_data.items():
        setattr(oi, field, value)

    try:
        if comisionista_ids is not None:
            db.query(Asignacion).filter(
                Asignacion.orden_item_id == oi.id
            ).delete(synchronize_session=False)
            for comisionista_id in _comisionistas_aplicables(db, oi, comisionista_ids):
                db.add(
                    Asignacion(
                        orden_item_id=oi.id,
                        comisionista_id=comisionista_id,
                    )
                )
        db.commit()
        db.refresh(oi)
        return _serializar_item(oi)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.post("/grupos/{id}/comisionistas")
def asignar_comisionistas_a_orden(
    id: UUID,
    body: ComisionistasOrdenBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    orden = (
        db.query(Orden)
        .options(selectinload(Orden.items))
        .filter(Orden.id == id)
        .first()
    )
    if not orden:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada"
        )
    if any(item.estado == EstadoOrden.liquidada for item in orden.items):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede modificar un ítem liquidado",
        )

    try:
        for item in orden.items:
            db.query(Asignacion).filter(
                Asignacion.orden_item_id == item.id
            ).delete(synchronize_session=False)
            for cid in _comisionistas_aplicables(db, item, body.comisionista_ids):
                db.add(Asignacion(orden_item_id=item.id, comisionista_id=cid))
        db.commit()
        return {"message": "Comisionistas asignados a la orden"}
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.put("/grupos/{id}/estado")
def actualizar_estado_orden_grupo(
    id: UUID,
    body: EstadoOrdenBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    orden = (
        db.query(Orden)
        .options(selectinload(Orden.items))
        .filter(Orden.id == id)
        .first()
    )
    if not orden:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada"
        )

    nuevo_estado = _parse_estado_orden(body.estado)
    if nuevo_estado == EstadoOrden.liquidada:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El estado liquidada se asigna al guardar una liquidación",
        )
    if any(item.estado == EstadoOrden.liquidada for item in orden.items):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede cambiar el estado de una orden con ítems liquidados",
        )

    try:
        orden.estado = nuevo_estado
        for item in orden.items:
            item.estado = nuevo_estado

        db.commit()
        db.refresh(orden)
        return _serializar_orden(orden)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_orden(id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    oi = db.query(OrdenItem).filter(OrdenItem.id == id).first()
    if not oi:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada"
        )
    if _item_o_grupo_tiene_items_liquidados(db, oi):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede eliminar un ítem liquidado",
        )

    try:
        orden_id = oi.orden_id
        db.delete(oi)
        db.flush()
        if orden_id:
            quedan = db.query(OrdenItem).filter(OrdenItem.orden_id == orden_id).count()
            if quedan == 0:
                orden = db.query(Orden).filter(Orden.id == orden_id).first()
                if orden:
                    db.delete(orden)
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
    current_user: User = Depends(get_current_user),
):
    oi = db.query(OrdenItem).filter(OrdenItem.id == id).first()
    if not oi:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada"
        )
    if _item_o_grupo_tiene_items_liquidados(db, oi):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede modificar un ítem liquidado",
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
    id: UUID, comisionista_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
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
    if asignacion.orden_item and _item_o_grupo_tiene_items_liquidados(db, asignacion.orden_item):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede modificar un ítem liquidado",
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
def asignar_global(body: AsignarGlobalBody, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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
    orden_ids = [oi.orden_id for oi in ordenes if oi.orden_id]
    tiene_grupos_liquidados = bool(
        orden_ids
        and db.query(OrdenItem.id)
        .filter(
            OrdenItem.orden_id.in_(orden_ids),
            OrdenItem.estado == EstadoOrden.liquidada,
        )
        .first()
    )
    if any(oi.estado == EstadoOrden.liquidada for oi in ordenes) or tiene_grupos_liquidados:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede modificar un ítem liquidado",
        )

    try:
        for oi in ordenes:
            db.query(Asignacion).filter(
                Asignacion.orden_item_id == oi.id
            ).delete(synchronize_session=False)

            for cid in _comisionistas_aplicables(db, oi, body.comisionista_ids):
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
