"""add_cliente_alias

Revision ID: d2f4a6b8c0e1
Revises: c1a2b3d4e5f6
Create Date: 2026-07-09 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d2f4a6b8c0e1"
down_revision: Union[str, None] = "a3c7e91b5d24"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cliente_alias",
        sa.Column("cliente_id", sa.Uuid(), nullable=False),
        sa.Column("alias", sa.String(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["cliente_id"], ["clientes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("alias"),
    )


def downgrade() -> None:
    op.drop_table("cliente_alias")
