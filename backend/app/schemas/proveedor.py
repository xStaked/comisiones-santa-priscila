from __future__ import annotations

from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class ProveedorResponse(BaseModel):
    id: UUID
    nombre: str
    grupo_id: Optional[UUID] = Field(default=None, alias="grupoId")
    grupo: Optional[str] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ProveedorUpdate(BaseModel):
    grupo_id: Optional[UUID] = None
