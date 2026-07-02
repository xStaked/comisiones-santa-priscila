from __future__ import annotations

from uuid import UUID
from pydantic import BaseModel, ConfigDict


class GrupoCreate(BaseModel):
    nombre: str


class GrupoResponse(BaseModel):
    id: UUID
    nombre: str

    model_config = ConfigDict(from_attributes=True)
