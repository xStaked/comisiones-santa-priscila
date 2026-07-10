import enum
from sqlalchemy import Column, String, Numeric, ForeignKey, Enum as SAEnum, Uuid, JSON
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class TipoTarifa(str, enum.Enum):
    porcentaje = "porcentaje"
    fijo_kg = "fijo_kg"
    fijo_unidad = "fijo_unidad"


class Comisionista(BaseModel):
    __tablename__ = "comisionistas"

    nombre = Column(String, nullable=False)
    # ponytail: String en vez de enum SQL — cambiar un valor no exige migración
    tipo = Column(String, nullable=False, server_default="externo")

    tarifas = relationship(
        "Tarifa", back_populates="comisionista", cascade="all, delete-orphan"
    )
    asignaciones = relationship(
        "Asignacion", back_populates="comisionista", cascade="all, delete-orphan"
    )


class Tarifa(BaseModel):
    __tablename__ = "tarifas"

    comisionista_id = Column(
        Uuid,
        ForeignKey("comisionistas.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo = Column(SAEnum(TipoTarifa, name="tipo_tarifa"), nullable=False)
    valor = Column(Numeric(10, 4), nullable=False)
    proveedores_excluidos = Column(JSON, nullable=False, default=list)
    # Regla por volumen: si el comisionista acumula >= umbral_kg en la liquidación,
    # la comisión pasa a fijo_kg con valor_sobre_umbral (caso Naranjo).
    umbral_kg = Column(Numeric(12, 2), nullable=True)
    valor_sobre_umbral = Column(Numeric(10, 4), nullable=True)

    comisionista = relationship("Comisionista", back_populates="tarifas")
