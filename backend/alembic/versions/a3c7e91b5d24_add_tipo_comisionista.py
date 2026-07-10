"""agregar tipo (interno/externo) a comisionistas

Revision ID: a3c7e91b5d24
Revises: c1a2b3d4e5f6
Create Date: 2026-07-09

"""
from alembic import op
import sqlalchemy as sa


revision = "a3c7e91b5d24"
down_revision = "c1a2b3d4e5f6"
branch_labels = None
depends_on = None

# Comisionistas del PDF de tarifas internas de Santa Priscila.
INTERNOS = ["ARROYO", "CASTRO", "PINEDA", "MALAVE"]


def upgrade() -> None:
    op.add_column(
        "comisionistas",
        sa.Column("tipo", sa.String(), nullable=False, server_default="externo"),
    )
    nombres = ", ".join(f"'{n}'" for n in INTERNOS)
    op.execute(
        f"UPDATE comisionistas SET tipo = 'interno' "
        f"WHERE upper(trim(nombre)) IN ({nombres})"
    )


def downgrade() -> None:
    op.drop_column("comisionistas", "tipo")
