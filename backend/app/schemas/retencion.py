from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RetencionCreate(BaseModel):
    vigente_desde: date = Field(alias="vigenteDesde")
    porcentaje: Decimal = Field(ge=0, le=100)

    model_config = ConfigDict(populate_by_name=True)


class RetencionResponse(BaseModel):
    id: UUID
    vigente_desde: date
    porcentaje: Decimal

    model_config = ConfigDict(from_attributes=True)
