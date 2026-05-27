from sqlalchemy import Column, String, Numeric, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class Producto(BaseModel):
    __tablename__ = "productos"

    nombre = Column(String, nullable=False, unique=True)
    unidad_comision = Column(String(20), nullable=False, default="kg")
    tacho_kilos = Column(Numeric(5, 2), nullable=True)
    activo = Column(Boolean, nullable=False, default=True)

    alias = relationship("ProductoAlias", back_populates="producto", cascade="all, delete-orphan")


class ProductoAlias(BaseModel):
    __tablename__ = "producto_alias"

    producto_id = Column(ForeignKey("productos.id", ondelete="CASCADE"), nullable=False)
    alias = Column(String, nullable=False, unique=True)

    producto = relationship("Producto", back_populates="alias")
