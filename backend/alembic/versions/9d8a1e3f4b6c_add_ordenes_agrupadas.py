"""add_ordenes_agrupadas

Revision ID: 9d8a1e3f4b6c
Revises: 4c97285a3b6c
Create Date: 2026-05-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "9d8a1e3f4b6c"
down_revision: Union[str, None] = "4c97285a3b6c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    estado_orden = postgresql.ENUM(
        "activo",
        "liquidado",
        "anulado",
        name="estado_orden",
        create_type=False,
    )

    op.create_table(
        "ordenes",
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("numero_orden", sa.String(), nullable=False),
        sa.Column("cliente_id", sa.Uuid(), nullable=True),
        sa.Column("proveedor", sa.String(), nullable=True),
        sa.Column("semana", sa.String(), nullable=True),
        sa.Column("archivo_nombre", sa.String(), nullable=True),
        sa.Column("origen", sa.String(), nullable=False, server_default="manual"),
        sa.Column("estado", estado_orden, nullable=False, server_default="activo"),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["cliente_id"], ["clientes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.add_column("orden_items", sa.Column("orden_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_orden_items_orden_id_ordenes",
        "orden_items",
        "ordenes",
        ["orden_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.add_column("liquidacion_items", sa.Column("orden_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_liquidacion_items_orden_id_ordenes",
        "liquidacion_items",
        "ordenes",
        ["orden_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute(
        """
        INSERT INTO ordenes (id, fecha, numero_orden, cliente_id, origen, estado, created_at)
        SELECT gen_random_uuid(), fecha, numero_orden, cliente_id, 'manual', estado, now()
        FROM (
            SELECT fecha, numero_orden, cliente_id, min(estado::text)::estado_orden AS estado
            FROM orden_items
            GROUP BY fecha, numero_orden, cliente_id
        ) grupos
        """
    )
    op.execute(
        """
        UPDATE orden_items oi
        SET orden_id = o.id
        FROM ordenes o
        WHERE oi.fecha = o.fecha
          AND oi.numero_orden = o.numero_orden
          AND (
            oi.cliente_id = o.cliente_id
            OR (oi.cliente_id IS NULL AND o.cliente_id IS NULL)
          )
        """
    )
    op.execute(
        """
        UPDATE liquidacion_items li
        SET orden_id = oi.orden_id
        FROM orden_items oi
        WHERE li.orden_item_id = oi.id
        """
    )


def downgrade() -> None:
    op.drop_constraint("fk_liquidacion_items_orden_id_ordenes", "liquidacion_items", type_="foreignkey")
    op.drop_column("liquidacion_items", "orden_id")
    op.drop_constraint("fk_orden_items_orden_id_ordenes", "orden_items", type_="foreignkey")
    op.drop_column("orden_items", "orden_id")
    op.drop_table("ordenes")
