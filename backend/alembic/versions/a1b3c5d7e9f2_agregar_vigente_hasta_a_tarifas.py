"""agregar vigente_hasta a tarifas_cliente_producto

Revision ID: a1b3c5d7e9f2
Revises: c3d5e7f9a1b2
Create Date: 2026-07-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b3c5d7e9f2"
down_revision: Union[str, None] = "c3d5e7f9a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tarifas_cliente_producto",
        sa.Column("vigente_hasta", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tarifas_cliente_producto", "vigente_hasta")
