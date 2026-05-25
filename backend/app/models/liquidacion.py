from sqlalchemy import Column, String, Numeric, Date, DateTime, ForeignKey, Uuid
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class Liquidacion(BaseModel):
    __tablename__ = "liquidaciones"

    nombre = Column(String, nullable=False)
    mes = Column(String, nullable=False)
    fecha_creacion = Column(DateTime(timezone=True), nullable=False)

    items = relationship(
        "LiquidacionItem", back_populates="liquidacion", cascade="all, delete-orphan"
    )


class LiquidacionItem(BaseModel):
    __tablename__ = "liquidacion_items"

    liquidacion_id = Column(
        Uuid,
        ForeignKey("liquidaciones.id", ondelete="CASCADE"),
        nullable=False,
    )
    orden_item_id = Column(
        Uuid,
        ForeignKey("orden_items.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Snapshot fields from OrdenItem
    fecha_snapshot = Column(Date, nullable=False)
    numero_orden_snapshot = Column(String, nullable=False)
    finca_snapshot = Column(String, nullable=False)
    producto_snapshot = Column(String, nullable=False)
    cantidad_snapshot = Column(Numeric(12, 2), nullable=False)
    unidad_snapshot = Column(String, nullable=False)
    precio_unitario_snapshot = Column(Numeric(12, 2), nullable=False)
    total_snapshot = Column(Numeric(12, 2), nullable=False)
    sector_snapshot = Column(String, nullable=True)
    estado_snapshot = Column(String, nullable=False)

    # Nuevos snapshots de entidades normalizadas
    cliente_snapshot = Column(String, nullable=True)
    retencion_porcentaje_snapshot = Column(Numeric(5, 2), nullable=True)

    liquidacion = relationship("Liquidacion", back_populates="items")
    orden_item = relationship("OrdenItem", back_populates="liquidacion_items")
    tarifas = relationship(
        "LiquidacionItemTarifa",
        back_populates="liquidacion_item",
        cascade="all, delete-orphan",
    )


class LiquidacionItemTarifa(BaseModel):
    __tablename__ = "liquidacion_item_tarifas"

    liquidacion_item_id = Column(
        Uuid,
        ForeignKey("liquidacion_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    comisionista_id = Column(
        Uuid,
        ForeignKey("comisionistas.id", ondelete="CASCADE"),
        nullable=False,
    )

    comisionista_nombre_snapshot = Column(String, nullable=False)
    tipo_snapshot = Column(String, nullable=False)
    valor_snapshot = Column(Numeric(10, 4), nullable=False)
    comision_calculada = Column(Numeric(12, 2), nullable=False)

    liquidacion_item = relationship(
        "LiquidacionItem", back_populates="tarifas"
    )
