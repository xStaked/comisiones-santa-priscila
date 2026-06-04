"""add_fijo_unidad_to_tipo_tarifa

Revision ID: 10bb78dc763d
Revises: 991bbe37b7ef
Create Date: 2026-06-03 15:21:11.557315

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '10bb78dc763d'
down_revision: Union[str, None] = '991bbe37b7ef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE tipo_tarifa ADD VALUE 'fijo_unidad'")


def downgrade() -> None:
    # PostgreSQL no permite eliminar valores de un enum de forma sencilla.
    # Se requeriría recrear el enum, lo cual está fuera del alcance de esta migración.
    pass
