from sqlalchemy import Column, String
from app.models.base import BaseModel


class Proveedor(BaseModel):
    __tablename__ = "proveedores"

    nombre = Column(String, nullable=False, unique=True)
