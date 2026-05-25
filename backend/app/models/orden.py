import enum
from sqlalchemy import (
    Column,
    String,
    Numeric,
    Date,
    ForeignKey,
    UniqueConstraint,
    Enum as SAEnum,
    Uuid,
)
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class EstadoOrden(str, enum.Enum):
    activo = "activo"
    liquidado = "liquidado"
    anulado = "anulado"


class Asignacion(BaseModel):
    __tablename__ = "asignaciones"
    __table_args__ = (
        UniqueConstraint(
            "orden_item_id", "comisionista_id", name="uq_asignacion_orden_comisionista"
        ),
    )

    orden_item_id = Column(
        Uuid,
        ForeignKey("orden_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    comisionista_id = Column(
        Uuid,
        ForeignKey("comisionistas.id", ondelete="CASCADE"),
        nullable=False,
    )

    orden_item = relationship("OrdenItem", back_populates="asignaciones")
    comisionista = relationship("Comisionista", back_populates="asignaciones")


class OrdenItem(BaseModel):
    __tablename__ = "orden_items"

    fecha = Column(Date, nullable=False)
    numero_orden = Column(String, nullable=False)
    finca = Column(String, nullable=False)
    producto = Column(String, nullable=False)
    cantidad = Column(Numeric(12, 2), nullable=False)
    unidad = Column(String, nullable=False)
    precio_unitario = Column(Numeric(12, 2), nullable=False)
    total = Column(Numeric(12, 2), nullable=False)
    sector = Column(String, nullable=True)
    estado = Column(
        SAEnum(EstadoOrden, name="estado_orden"),
        nullable=False,
        default=EstadoOrden.activo,
    )

    # Relaciones con entidades normalizadas (nullable para compatibilidad)
    cliente_id = Column(
        Uuid,
        ForeignKey("clientes.id", ondelete="SET NULL"),
        nullable=True,
    )
    producto_id = Column(
        Uuid,
        ForeignKey("productos.id", ondelete="SET NULL"),
        nullable=True,
    )
    finca_id = Column(
        Uuid,
        ForeignKey("fincas.id", ondelete="SET NULL"),
        nullable=True,
    )

    cliente = relationship("Cliente")
    producto_obj = relationship("Producto")
    finca_obj = relationship("Finca")

    asignaciones = relationship(
        "Asignacion", back_populates="orden_item", cascade="all, delete-orphan"
    )
    liquidacion_items = relationship(
        "LiquidacionItem", back_populates="orden_item"
    )

    @property
    def comisionistas(self):
        return self.asignaciones
