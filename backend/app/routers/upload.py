from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.services.ocr_extractor import extraer_orden_de_imagen
from app.services.pdf_extractor import extraer_orden_de_pdf

router = APIRouter()


class ItemExtraido(BaseModel):
    fecha: date
    numeroOrden: str
    finca: str
    fincaId: Optional[UUID] = None
    clienteId: Optional[UUID] = None
    productoId: Optional[UUID] = None
    producto: str
    cantidad: Decimal
    unidad: str
    precioUnitario: Decimal
    total: Decimal
    comisionistas: list[Any] = []


class ExtraccionPDFResponse(BaseModel):
    fecha: date
    numeroOrden: str
    proveedor: str
    semana: str
    items: list[ItemExtraido]


@router.post("/pdf", response_model=ExtraccionPDFResponse)
async def subir_pdf(
    file: UploadFile = File(...),
    cliente_id: UUID | None = Query(None, description="ID del cliente para vincular fincas"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser un PDF",
        )

    contenido = await file.read()
    if not contenido:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo está vacío",
        )

    try:
        resultado = extraer_orden_de_pdf(contenido, nombre_archivo=file.filename, db=db, cliente_id=str(cliente_id) if cliente_id else None)
    except Exception as exc:
        mensaje = str(exc)
        if len(mensaje) > 160:
            mensaje = mensaje[:147] + " [recortado]"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error al procesar el PDF: {mensaje}",
        ) from exc

    return resultado


@router.post("/imagen", response_model=ExtraccionPDFResponse)
async def subir_imagen(
    file: UploadFile = File(...),
    cliente_id: UUID | None = Query(None, description="ID del cliente para vincular fincas"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith((".jpg", ".jpeg", ".png")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser una imagen JPG o PNG",
        )

    contenido = await file.read()
    if not contenido:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo está vacío",
        )

    try:
        resultado = extraer_orden_de_imagen(contenido, nombre_archivo=file.filename, db=db, cliente_id=str(cliente_id) if cliente_id else None)
    except Exception as exc:
        mensaje = str(exc)
        if len(mensaje) > 160:
            mensaje = mensaje[:147] + " [recortado]"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error al procesar la imagen: {mensaje}",
        ) from exc

    return resultado
