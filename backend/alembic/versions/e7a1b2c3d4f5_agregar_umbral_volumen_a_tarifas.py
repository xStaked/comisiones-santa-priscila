"""agregar umbral de volumen a tarifas

Revision ID: e7a1b2c3d4f5
Revises: aca4cb479a15
Create Date: 2026-07-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7a1b2c3d4f5"
down_revision: Union[str, None] = "aca4cb479a15"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tarifas", sa.Column("umbral_kg", sa.Numeric(12, 2), nullable=True))
    op.add_column("tarifas", sa.Column("valor_sobre_umbral", sa.Numeric(10, 4), nullable=True))
    op.add_column("tarifas_cliente_producto", sa.Column("umbral_kg", sa.Numeric(12, 2), nullable=True))
    op.add_column("tarifas_cliente_producto", sa.Column("valor_sobre_umbral", sa.Numeric(10, 4), nullable=True))


def downgrade() -> None:
    op.drop_column("tarifas_cliente_producto", "valor_sobre_umbral")
    op.drop_column("tarifas_cliente_producto", "umbral_kg")
    op.drop_column("tarifas", "valor_sobre_umbral")
    op.drop_column("tarifas", "umbral_kg")
