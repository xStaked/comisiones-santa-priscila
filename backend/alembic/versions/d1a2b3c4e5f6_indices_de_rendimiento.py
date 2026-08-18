"""Índices sobre las claves foráneas y filtros que usan los reportes.

La base no tenía ningún índice fuera de las PK y las restricciones UNIQUE, así
que cada consulta de los reportes hacía seq scan.

Revision ID: d1a2b3c4e5f6
Revises: c4f6a8b0d2e3
"""

from alembic import op

revision = "d1a2b3c4e5f6"
down_revision = "c4f6a8b0d2e3"
branch_labels = None
depends_on = None


# (nombre, tabla, columnas)
INDICES = [
    ("ix_orden_items_orden_id", "orden_items", ["orden_id"]),
    ("ix_orden_items_estado", "orden_items", ["estado"]),
    ("ix_orden_items_fecha", "orden_items", ["fecha"]),
    ("ix_asignaciones_orden_item_id", "asignaciones", ["orden_item_id"]),
    ("ix_asignaciones_comisionista_id", "asignaciones", ["comisionista_id"]),
    ("ix_asignaciones_liquidacion_id", "asignaciones", ["liquidacion_id"]),
    ("ix_liquidacion_items_liquidacion_id", "liquidacion_items", ["liquidacion_id"]),
    ("ix_liquidacion_item_tarifas_item_id", "liquidacion_item_tarifas", ["liquidacion_item_id"]),
    ("ix_liquidaciones_mes", "liquidaciones", ["mes"]),
    ("ix_fincas_cliente_id", "fincas", ["cliente_id"]),
    ("ix_producto_alias_producto_id", "producto_alias", ["producto_id"]),
    ("ix_tarifas_comisionista_id", "tarifas", ["comisionista_id"]),
    (
        "ix_tarifas_cp_busqueda",
        "tarifas_cliente_producto",
        ["comisionista_id", "cliente_id", "producto_id"],
    ),
]


def upgrade() -> None:
    for nombre, tabla, columnas in INDICES:
        op.create_index(nombre, tabla, columnas)


def downgrade() -> None:
    for nombre, tabla, _ in reversed(INDICES):
        op.drop_index(nombre, table_name=tabla)
