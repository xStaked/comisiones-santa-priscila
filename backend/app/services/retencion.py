from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.retencion import Retencion

# Red de seguridad por si la tabla estuviera vacía. Con el tramo sembrado en
# 1900-01-01 no debería activarse nunca en producción.
RETENCION_POR_DEFECTO = Decimal("1.75")


def cargar_periodos(db: Session) -> list[Retencion]:
    """Periodos de retención, del más reciente al más antiguo.

    Se cargan una sola vez por liquidación y se reutilizan para todos los
    ítems, en vez de consultarlos por ítem.
    """
    return db.query(Retencion).order_by(Retencion.vigente_desde.desc()).all()


def retencion_para(periodos: list[Retencion], fecha: date) -> Decimal:
    """Retención vigente en la fecha de EMISIÓN de la factura.

    `periodos` debe venir ordenado descendente (tal como lo devuelve
    `cargar_periodos`), así el primero que empieza en o antes de `fecha` es el
    vigente.

    Ojo: esto NO usa `_fecha_efectiva()` de `services/liquidacion.py`, que
    resuelve la vigencia de las TARIFAS por fecha de pago. La retención se
    ancla a la fecha de la factura por pedido explícito del cliente. La
    divergencia es deliberada; ver la spec de retención por periodos.

    Debe mantenerse en paridad con `retencionPara()` de `src/lib/export-utils.ts`.
    """
    for periodo in periodos:
        if periodo.vigente_desde <= fecha:
            return periodo.porcentaje
    return RETENCION_POR_DEFECTO
