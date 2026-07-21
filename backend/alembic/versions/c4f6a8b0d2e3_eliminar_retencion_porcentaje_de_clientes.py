"""eliminar retencion_porcentaje de clientes

La retención ya no se guarda por cliente: vive en la tabla `retenciones`, por
periodo de vigencia.

Revision ID: c4f6a8b0d2e3
Revises: b2e4d6f8a0c1
Create Date: 2026-07-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4f6a8b0d2e3"
down_revision: Union[str, None] = "b2e4d6f8a0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("clientes", "retencion_porcentaje")


def downgrade() -> None:
    op.add_column(
        "clientes",
        sa.Column(
            "retencion_porcentaje",
            sa.Numeric(5, 2),
            nullable=False,
            server_default="1.75",
        ),
    )
