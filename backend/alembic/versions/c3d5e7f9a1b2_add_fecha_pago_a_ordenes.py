"""add_fecha_pago_a_ordenes

Revision ID: c3d5e7f9a1b2
Revises: d2f4a6b8c0e1
Create Date: 2026-07-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d5e7f9a1b2'
down_revision: Union[str, None] = 'd2f4a6b8c0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ordenes', sa.Column('fecha_pago', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('ordenes', 'fecha_pago')
