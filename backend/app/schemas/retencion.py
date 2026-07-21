from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class RetencionResponse(BaseModel):
    id: UUID
    vigente_desde: date
    porcentaje: Decimal

    model_config = ConfigDict(from_attributes=True)
