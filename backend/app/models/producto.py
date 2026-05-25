from sqlalchemy import Column, String, Numeric, Boolean
from app.models.base import BaseModel


class Producto(BaseModel):
    __tablename__ = "productos"

    nombre = Column(String, nullable=False, unique=True)
    unidad_comision = Column(String(20), nullable=False, default="kg")
    tacho_kilos = Column(Numeric(5, 2), nullable=True)
    activo = Column(Boolean, nullable=False, default=True)
