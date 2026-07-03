from sqlalchemy import Column, String
from app.models.base import BaseModel


class Grupo(BaseModel):
    """Grupo empresarial al que pertenecen los clientes.

    ponytail: modelado plano; los "sectores" del grupo quedan fuera hasta que
    haya un caso de uso concreto (ver spec 2026-07-01).
    """

    __tablename__ = "grupos"

    nombre = Column(String, nullable=False, unique=True)
