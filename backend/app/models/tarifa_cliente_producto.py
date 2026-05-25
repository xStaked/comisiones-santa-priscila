from sqlalchemy import (
    Column,
    ForeignKey,
    Boolean,
    Numeric,
    UniqueConstraint,
    Uuid,
    Enum as SAEnum,
)
from sqlalchemy.orm import relationship
from app.models.base import BaseModel
from app.models.comisionista import TipoTarifa


class TarifaClienteProducto(BaseModel):
    __tablename__ = "tarifas_cliente_producto"

    comisionista_id = Column(
        Uuid,
        ForeignKey("comisionistas.id", ondelete="CASCADE"),
        nullable=False,
    )
    cliente_id = Column(
        Uuid,
        ForeignKey("clientes.id", ondelete="CASCADE"),
        nullable=False,
    )
    producto_id = Column(
        Uuid,
        ForeignKey("productos.id", ondelete="CASCADE"),
        nullable=False,
    )
    finca_id = Column(
        Uuid,
        ForeignKey("fincas.id", ondelete="CASCADE"),
        nullable=True,
    )
    tipo = Column(
        SAEnum(TipoTarifa, name="tipo_tarifa"),
        nullable=False,
    )
    valor = Column(Numeric(10, 4), nullable=False)
    activo = Column(Boolean, nullable=False, default=True)

    comisionista = relationship("Comisionista")
    cliente = relationship("Cliente")
    producto = relationship("Producto")
    finca = relationship("Finca")

    __table_args__ = (
        UniqueConstraint(
            "comisionista_id",
            "cliente_id",
            "producto_id",
            "finca_id",
            name="uq_tarifa_com_cli_prod_finca",
        ),
    )
