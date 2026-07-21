"""crear tabla retenciones con sus periodos de vigencia

Revision ID: b2e4d6f8a0c1
Revises: a1b3c5d7e9f2
Create Date: 2026-07-21

"""
import uuid
from datetime import date
from decimal import Decimal
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2e4d6f8a0c1"
down_revision: Union[str, None] = "a1b3c5d7e9f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    retenciones = op.create_table(
        "retenciones",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column("vigente_desde", sa.Date(), nullable=False, unique=True),
        sa.Column("porcentaje", sa.Numeric(5, 2), nullable=False),
    )
    # Tramos comunicados por el cliente: 1.75% hasta el 28-feb-2026 y 2% desde
    # el 1-mar-2026. El tramo de 1900 cubre todo el histórico anterior.
    op.bulk_insert(
        retenciones,
        [
            {
                "id": uuid.uuid4(),
                "vigente_desde": date(1900, 1, 1),
                "porcentaje": Decimal("1.75"),
            },
            {
                "id": uuid.uuid4(),
                "vigente_desde": date(2026, 3, 1),
                "porcentaje": Decimal("2.00"),
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("retenciones")
