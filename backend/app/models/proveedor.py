from sqlalchemy import Column, ForeignKey, String, Uuid
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class Proveedor(BaseModel):
    __tablename__ = "proveedores"

    nombre = Column(String, nullable=False, unique=True)
    grupo_id = Column(
        Uuid, ForeignKey("grupos.id", ondelete="SET NULL"), nullable=True
    )

    grupo = relationship("Grupo")
