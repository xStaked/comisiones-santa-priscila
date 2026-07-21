from sqlalchemy import Column, String, ForeignKey, Boolean, UniqueConstraint, Uuid
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class Cliente(BaseModel):
    __tablename__ = "clientes"

    nombre = Column(String, nullable=False, unique=True)
    tipo = Column(String(20), nullable=False, default="individual")
    activo = Column(Boolean, nullable=False, default=True)
    grupo_id = Column(
        Uuid, ForeignKey("grupos.id", ondelete="SET NULL"), nullable=True
    )

    grupo = relationship("Grupo")
    fincas = relationship(
        "Finca", back_populates="cliente", cascade="all, delete-orphan"
    )
    alias = relationship(
        "ClienteAlias", back_populates="cliente", cascade="all, delete-orphan"
    )


class ClienteAlias(BaseModel):
    """Razones sociales tal como aparecen en las facturas (CAMARONERA FAGUILL
    S.A.), que no coinciden con el alias corto del catálogo (FAGUILL)."""

    __tablename__ = "cliente_alias"

    cliente_id = Column(ForeignKey("clientes.id", ondelete="CASCADE"), nullable=False)
    alias = Column(String, nullable=False, unique=True)

    cliente = relationship("Cliente", back_populates="alias")


class Finca(BaseModel):
    __tablename__ = "fincas"

    nombre = Column(String, nullable=False)
    cliente_id = Column(
        ForeignKey("clientes.id", ondelete="CASCADE"),
        nullable=False,
    )
    activo = Column(Boolean, nullable=False, default=True)

    cliente = relationship("Cliente", back_populates="fincas")

    __table_args__ = (
        UniqueConstraint("cliente_id", "nombre", name="uq_finca_cliente_nombre"),
    )
