from __future__ import annotations

from pydantic import BaseModel


class ResponseBase(BaseModel):
    message: str
