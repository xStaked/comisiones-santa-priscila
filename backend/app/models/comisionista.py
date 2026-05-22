import enum
from sqlalchemy import Column, String, Numeric, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class TipoTarifa(str, enum.Enum):
    porcentaje = "porcentaje"
    fijo_kg = "fijo_kg"


class Comisionista(BaseModel):
    __tablename__ = "comisionistas"

    nombre = Column(String, nullable=False)

    tarifas = relationship(
        "Tarifa", back_populates="comisionista", cascade="all, delete-orphan"
    )
    asignaciones = relationship(
        "Asignacion", back_populates="comisionista", cascade="all, delete-orphan"
    )


class Tarifa(BaseModel):
    __tablename__ = "tarifas"

    comisionista_id = Column(
        UUID(as_uuid=True),
        ForeignKey("comisionistas.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo = Column(SAEnum(TipoTarifa, name="tipo_tarifa"), nullable=False)
    valor = Column(Numeric(10, 4), nullable=False)

    comisionista = relationship("Comisionista", back_populates="tarifas")
