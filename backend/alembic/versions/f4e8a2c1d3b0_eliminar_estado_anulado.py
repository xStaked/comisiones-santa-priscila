"""eliminar_estado_anulado

Revision ID: f4e8a2c1d3b0
Revises: ed593a81519f
Create Date: 2026-06-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "f4e8a2c1d3b0"
down_revision: Union[str, None] = "ed593a81519f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Eliminar ítems anulados (cascade borra asignaciones automáticamente)
    op.execute("DELETE FROM orden_items WHERE estado = 'anulado'")
    # 2. Eliminar órdenes anuladas (cascade borra ítems restantes automáticamente)
    op.execute("DELETE FROM ordenes WHERE estado = 'anulado'")

    # 3. PostgreSQL no soporta DROP VALUE en enums.
    #    Workaround: crear nuevo enum, migrar columnas, eliminar viejo.
    op.execute("CREATE TYPE estado_orden_new AS ENUM ('activo', 'liquidado')")

    # Quitar defaults ligados al viejo enum para poder cambiar el tipo
    op.execute("ALTER TABLE ordenes ALTER COLUMN estado DROP DEFAULT")
    op.execute("ALTER TABLE orden_items ALTER COLUMN estado DROP DEFAULT")

    op.execute("ALTER TABLE orden_items ALTER COLUMN estado TYPE estado_orden_new USING estado::text::estado_orden_new")
    op.execute("ALTER TABLE ordenes ALTER COLUMN estado TYPE estado_orden_new USING estado::text::estado_orden_new")

    # Restaurar defaults con el nuevo enum
    op.execute("ALTER TABLE ordenes ALTER COLUMN estado SET DEFAULT 'activo'")
    op.execute("ALTER TABLE orden_items ALTER COLUMN estado SET DEFAULT 'activo'")

    op.execute("DROP TYPE estado_orden")
    op.execute("ALTER TYPE estado_orden_new RENAME TO estado_orden")


def downgrade() -> None:
    op.execute("CREATE TYPE estado_orden_new AS ENUM ('activo', 'liquidado', 'anulado')")

    op.execute("ALTER TABLE ordenes ALTER COLUMN estado DROP DEFAULT")
    op.execute("ALTER TABLE orden_items ALTER COLUMN estado DROP DEFAULT")

    op.execute("ALTER TABLE orden_items ALTER COLUMN estado TYPE estado_orden_new USING estado::text::estado_orden_new")
    op.execute("ALTER TABLE ordenes ALTER COLUMN estado TYPE estado_orden_new USING estado::text::estado_orden_new")

    op.execute("ALTER TABLE ordenes ALTER COLUMN estado SET DEFAULT 'activo'")
    op.execute("ALTER TABLE orden_items ALTER COLUMN estado SET DEFAULT 'activo'")

    op.execute("DROP TYPE estado_orden")
    op.execute("ALTER TYPE estado_orden_new RENAME TO estado_orden")
