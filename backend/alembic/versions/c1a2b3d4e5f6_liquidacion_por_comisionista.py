"""liquidacion por comisionista: liquidacion_id en asignaciones

Revision ID: c1a2b3d4e5f6
Revises: f8b2c3d4e5a6
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c1a2b3d4e5f6"
down_revision: Union[str, None] = "f8b2c3d4e5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column(
        "asignaciones", sa.Column("liquidacion_id", sa.Uuid(), nullable=True)
    )
    op.create_foreign_key(
        "fk_asignaciones_liquidacion",
        "asignaciones",
        "liquidaciones",
        ["liquidacion_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # Backfill: antes de este cambio una liquidación pagaba a TODOS los comisionistas
    # del ítem a la vez, así que toda asignación de un ítem liquidado ya cobró.
    # Si un ítem aparece en varias liquidaciones (no debería), gana la más antigua.
    op.execute(
        """
        UPDATE asignaciones a
        SET liquidacion_id = elegida.liquidacion_id
        FROM (
            SELECT DISTINCT ON (li.orden_item_id)
                   li.orden_item_id, li.liquidacion_id
            FROM liquidacion_items li
            JOIN liquidaciones l ON l.id = li.liquidacion_id
            WHERE li.orden_item_id IS NOT NULL
            ORDER BY li.orden_item_id, l.fecha_creacion
        ) AS elegida
        WHERE a.orden_item_id = elegida.orden_item_id
          AND a.liquidacion_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_constraint("fk_asignaciones_liquidacion", "asignaciones", type_="foreignkey")
    op.drop_column("asignaciones", "liquidacion_id")
