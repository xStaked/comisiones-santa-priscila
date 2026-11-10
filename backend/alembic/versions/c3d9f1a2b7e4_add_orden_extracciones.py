"""add orden_extracciones

Revision ID: c3d9f1a2b7e4
Revises: b6f0c2d8a4e1
Create Date: 2026-11-10

Guarda la entrada reproducible del parser (palabras con coordenadas + texto,
comprimida) para poder reejecutar la extracción después de un cambio de parser
sin conservar el PDF completo.
"""

from alembic import op
import sqlalchemy as sa


revision = "c3d9f1a2b7e4"
down_revision = "b6f0c2d8a4e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "orden_extracciones",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column("orden_id", sa.Uuid(), nullable=True),
        sa.Column("numero_orden", sa.String(), nullable=False),
        sa.Column("fecha_orden", sa.Date(), nullable=False),
        sa.Column("parser_version", sa.Integer(), nullable=False),
        sa.Column("entrada", sa.LargeBinary(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["orden_id"], ["ordenes.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("orden_id", name="uq_orden_extracciones_orden_id"),
    )
    op.create_index(
        "ix_orden_extracciones_numero_orden",
        "orden_extracciones",
        ["numero_orden"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_orden_extracciones_numero_orden", table_name="orden_extracciones"
    )
    op.drop_table("orden_extracciones")
