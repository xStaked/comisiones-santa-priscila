from __future__ import annotations

import hashlib
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.extraccion import OrdenExtraccion
from app.models.orden import Orden
from app.services.pdf_extractor import PARSER_VERSION, serializar_entrada

logger = logging.getLogger(__name__)


def guardar_extraccion_pendiente(
    db: Session,
    entrada: dict[str, Any],
    numero_orden: str,
    fecha_orden: date,
) -> None:
    """Guarda la entrada de una vista previa, a la espera de que se confirme.

    Un preview descartado deja una fila pendiente que limpia
    app.commands.limpiar_extracciones. Nunca se loguea el contenido.
    """
    try:
        comprimida = serializar_entrada(entrada)
        db.query(OrdenExtraccion).filter(
            OrdenExtraccion.orden_id.is_(None),
            OrdenExtraccion.numero_orden == numero_orden,
            OrdenExtraccion.fecha_orden == fecha_orden,
        ).delete(synchronize_session=False)
        db.add(
            OrdenExtraccion(
                numero_orden=numero_orden,
                fecha_orden=fecha_orden,
                parser_version=PARSER_VERSION,
                entrada=comprimida,
                sha256=hashlib.sha256(comprimida).hexdigest(),
                creado_en=datetime.now(timezone.utc),
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("No se pudo guardar la entrada de extracción")


def vincular_extraccion(db: Session, orden: Orden) -> None:
    """Ata la entrada pendiente a la orden recién creada.

    Se busca por número de orden + fecha porque la vista previa no viaja al
    backend: el upload corre antes de confirmar y el alta llega después.
    """
    pendiente = (
        db.query(OrdenExtraccion)
        .filter(
            OrdenExtraccion.orden_id.is_(None),
            OrdenExtraccion.numero_orden == orden.numero_orden,
            OrdenExtraccion.fecha_orden == orden.fecha,
        )
        .order_by(OrdenExtraccion.creado_en.desc())
        .first()
    )
    if pendiente is None:
        return

    existente = (
        db.query(OrdenExtraccion)
        .filter(OrdenExtraccion.orden_id == orden.id)
        .first()
    )
    if existente is not None:
        existente.entrada = pendiente.entrada
        existente.parser_version = pendiente.parser_version
        existente.sha256 = pendiente.sha256
        existente.creado_en = pendiente.creado_en
        db.delete(pendiente)
    else:
        pendiente.orden_id = orden.id

    # Copias pendientes del mismo documento (subidas repetidas) ya no sirven.
    db.query(OrdenExtraccion).filter(
        OrdenExtraccion.id != pendiente.id,
        OrdenExtraccion.orden_id.is_(None),
        OrdenExtraccion.numero_orden == orden.numero_orden,
        OrdenExtraccion.fecha_orden == orden.fecha,
    ).delete(synchronize_session=False)


def limpiar_pendientes(db: Session, dias: int = 30) -> int:
    """Borra previews descartados; las entradas vinculadas no se tocan."""
    corte = datetime.now(timezone.utc) - timedelta(days=dias)
    eliminadas = (
        db.query(OrdenExtraccion)
        .filter(
            OrdenExtraccion.orden_id.is_(None),
            OrdenExtraccion.creado_en < corte,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return eliminadas
