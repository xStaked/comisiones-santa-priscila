"""actualizar estados pago orden

Revision ID: aca4cb479a15
Revises: b7494b241946
Create Date: 2026-06-09 09:10:34.191090

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "aca4cb479a15"
down_revision: Union[str, None] = "b7494b241946"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE estado_orden RENAME TO estado_orden_old")
    op.execute(
        "CREATE TYPE estado_orden AS ENUM "
        "('pendiente', 'parcialmente_pagada', 'pagada', 'liquidada')"
    )
    op.execute(
        "ALTER TABLE ordenes ALTER COLUMN estado DROP DEFAULT"
    )
    op.execute(
        "ALTER TABLE orden_items ALTER COLUMN estado DROP DEFAULT"
    )
    op.execute(
        "ALTER TABLE ordenes ALTER COLUMN estado TYPE estado_orden "
        "USING CASE estado::text "
        "WHEN 'activo' THEN 'pendiente' "
        "WHEN 'liquidado' THEN 'liquidada' "
        "ELSE estado::text END::estado_orden"
    )
    op.execute(
        "ALTER TABLE orden_items ALTER COLUMN estado TYPE estado_orden "
        "USING CASE estado::text "
        "WHEN 'activo' THEN 'pendiente' "
        "WHEN 'liquidado' THEN 'liquidada' "
        "ELSE estado::text END::estado_orden"
    )
    op.execute(
        "ALTER TABLE ordenes ALTER COLUMN estado SET DEFAULT 'pendiente'"
    )
    op.execute(
        "ALTER TABLE orden_items ALTER COLUMN estado SET DEFAULT 'pendiente'"
    )
    op.execute("DROP TYPE estado_orden_old")


def downgrade() -> None:
    op.execute("ALTER TYPE estado_orden RENAME TO estado_orden_new")
    op.execute("CREATE TYPE estado_orden AS ENUM ('activo', 'liquidado')")
    op.execute("ALTER TABLE ordenes ALTER COLUMN estado DROP DEFAULT")
    op.execute("ALTER TABLE orden_items ALTER COLUMN estado DROP DEFAULT")
    op.execute(
        "ALTER TABLE ordenes ALTER COLUMN estado TYPE estado_orden "
        "USING CASE estado::text "
        "WHEN 'liquidada' THEN 'liquidado' "
        "ELSE 'activo' END::estado_orden"
    )
    op.execute(
        "ALTER TABLE orden_items ALTER COLUMN estado TYPE estado_orden "
        "USING CASE estado::text "
        "WHEN 'liquidada' THEN 'liquidado' "
        "ELSE 'activo' END::estado_orden"
    )
    op.execute("ALTER TABLE ordenes ALTER COLUMN estado SET DEFAULT 'activo'")
    op.execute("ALTER TABLE orden_items ALTER COLUMN estado SET DEFAULT 'activo'")
    op.execute("DROP TYPE estado_orden_new")
