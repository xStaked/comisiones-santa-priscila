from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.comisionista import Comisionista
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.catalog_normalization import normalizar_proveedor_tarifa
from app.models.user import User
from app.schemas.tarifa_cliente_producto import (
    TarifaClienteProductoCreate,
    TarifaClienteProductoResponse,
    TarifaClienteProductoUpdate,
)

router = APIRouter()


def _enriquecer_respuesta(
    tarifa: TarifaClienteProducto,
) -> TarifaClienteProductoResponse:
    return TarifaClienteProductoResponse(
        id=tarifa.id,
        comisionistaId=tarifa.comisionista_id,
        clienteId=tarifa.cliente_id,
        productoId=tarifa.producto_id,
        fincaId=tarifa.finca_id,
        proveedor=tarifa.proveedor,
        proveedoresExcluidos=tarifa.proveedores_excluidos or [],
        tipo=tarifa.tipo.value if hasattr(tarifa.tipo, "value") else tarifa.tipo,
        valor=tarifa.valor,
        activo=tarifa.activo,
        comisionista=tarifa.comisionista.nombre if tarifa.comisionista else None,
        cliente=tarifa.cliente.nombre if tarifa.cliente else None,
        producto=tarifa.producto.nombre if tarifa.producto else None,
        finca=tarifa.finca.nombre if tarifa.finca else None,
    )


@router.get("/", response_model=list[TarifaClienteProductoResponse])
def listar_tarifas_cliente_producto(
    comisionista_id: uuid.UUID | None = Query(None, alias="comisionistaId"),
    cliente_id: uuid.UUID | None = Query(None, alias="clienteId"),
    producto_id: uuid.UUID | None = Query(None, alias="productoId"),
    finca_id: uuid.UUID | None = Query(None, alias="fincaId"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(TarifaClienteProducto)
        .options(
            selectinload(TarifaClienteProducto.comisionista),
            selectinload(TarifaClienteProducto.cliente),
            selectinload(TarifaClienteProducto.producto),
            selectinload(TarifaClienteProducto.finca),
        )
        .filter(TarifaClienteProducto.activo.is_(True))
    )

    if comisionista_id:
        query = query.filter(TarifaClienteProducto.comisionista_id == comisionista_id)
    if cliente_id:
        query = query.filter(TarifaClienteProducto.cliente_id == cliente_id)
    if producto_id:
        query = query.filter(TarifaClienteProducto.producto_id == producto_id)
    if finca_id:
        query = query.filter(TarifaClienteProducto.finca_id == finca_id)

    tarifas = query.all()
    return [_enriquecer_respuesta(t) for t in tarifas]


@router.post(
    "/",
    response_model=TarifaClienteProductoResponse,
    status_code=status.HTTP_201_CREATED,
)
def crear_tarifa_cliente_producto(
    data: TarifaClienteProductoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tarifa = TarifaClienteProducto(
        comisionista_id=data.comisionista_id,
        cliente_id=data.cliente_id,
        producto_id=data.producto_id,
        finca_id=data.finca_id,
        proveedor=normalizar_proveedor_tarifa(data.proveedor),
        proveedores_excluidos=data.proveedores_excluidos or [],
        tipo=data.tipo,
        valor=data.valor,
    )
    db.add(tarifa)
    try:
        db.commit()
        db.refresh(tarifa)
        # Cargar relaciones para la respuesta
        db.refresh(tarifa, ["comisionista", "cliente", "producto", "finca"])
        return _enriquecer_respuesta(tarifa)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una tarifa para esta combinación de comisionista, cliente, producto, finca y proveedor",
        ) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.put("/{id}", response_model=TarifaClienteProductoResponse)
def actualizar_tarifa_cliente_producto(
    id: uuid.UUID,
    data: TarifaClienteProductoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tarifa = (
        db.query(TarifaClienteProducto)
        .options(
            selectinload(TarifaClienteProducto.comisionista),
            selectinload(TarifaClienteProducto.cliente),
            selectinload(TarifaClienteProducto.producto),
            selectinload(TarifaClienteProducto.finca),
        )
        .filter(TarifaClienteProducto.id == id)
        .first()
    )
    if not tarifa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tarifa no encontrada",
        )

    tarifa.comisionista_id = data.comisionista_id
    tarifa.cliente_id = data.cliente_id
    tarifa.producto_id = data.producto_id
    tarifa.finca_id = data.finca_id
    tarifa.proveedor = normalizar_proveedor_tarifa(data.proveedor)
    tarifa.proveedores_excluidos = data.proveedores_excluidos or []
    tarifa.tipo = data.tipo
    tarifa.valor = data.valor

    try:
        db.commit()
        db.refresh(tarifa)
        return _enriquecer_respuesta(tarifa)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una tarifa para esta combinación de comisionista, cliente, producto, finca y proveedor",
        ) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_tarifa_cliente_producto(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tarifa = (
        db.query(TarifaClienteProducto)
        .filter(TarifaClienteProducto.id == id)
        .first()
    )
    if not tarifa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tarifa no encontrada",
        )

    try:
        db.delete(tarifa)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
