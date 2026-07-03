"""crear grupos y grupo_id en clientes

Revision ID: f8b2c3d4e5a6
Revises: e7a1b2c3d4f5
Create Date: 2026-07-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f8b2c3d4e5a6"
down_revision: Union[str, None] = "e7a1b2c3d4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "grupos",
        sa.Column("nombre", sa.String(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("nombre"),
    )
    op.add_column("clientes", sa.Column("grupo_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_clientes_grupo_id", "clientes", "grupos", ["grupo_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_clientes_grupo_id", "clientes", type_="foreignkey")
    op.drop_column("clientes", "grupo_id")
    op.drop_table("grupos")
