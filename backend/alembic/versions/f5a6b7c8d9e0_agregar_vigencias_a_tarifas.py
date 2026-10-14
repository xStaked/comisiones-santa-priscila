"""agregar vigencias de inicio y fin a las tarifas

Revision ID: f5a6b7c8d9e0
Revises: d1a2b3c4e5f6
Create Date: 2026-10-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f5a6b7c8d9e0"
down_revision: Union[str, None] = "d1a2b3c4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NOMBRE_UNIQUE_ANTERIOR = "uq_tarifa_com_cli_prod_finca_prov"
NOMBRE_UNIQUE_NUEVO = "uq_tarifa_com_cli_prod_finca_prov_desde"
NOMBRE_INDICE_SIN_INICIO = "uq_tarifa_com_cli_prod_finca_prov_sin_inicio"
COLUMNAS_UNIQUE = [
    "comisionista_id",
    "cliente_id",
    "producto_id",
    "finca_id",
    "proveedor",
    "vigente_desde",
]


def upgrade() -> None:
    op.add_column("tarifas", sa.Column("vigente_desde", sa.Date(), nullable=True))
    op.add_column("tarifas", sa.Column("vigente_hasta", sa.Date(), nullable=True))
    op.add_column(
        "tarifas_cliente_producto",
        sa.Column("vigente_desde", sa.Date(), nullable=True),
    )
    op.drop_constraint(
        NOMBRE_UNIQUE_ANTERIOR,
        "tarifas_cliente_producto",
        type_="unique",
    )
    op.create_unique_constraint(
        NOMBRE_UNIQUE_NUEVO,
        "tarifas_cliente_producto",
        COLUMNAS_UNIQUE,
    )
    op.create_index(
        NOMBRE_INDICE_SIN_INICIO,
        "tarifas_cliente_producto",
        ["comisionista_id", "cliente_id", "producto_id", "finca_id", "proveedor"],
        unique=True,
        postgresql_where=sa.text("vigente_desde IS NULL"),
        sqlite_where=sa.text("vigente_desde IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(NOMBRE_INDICE_SIN_INICIO, table_name="tarifas_cliente_producto")
    op.drop_constraint(
        NOMBRE_UNIQUE_NUEVO,
        "tarifas_cliente_producto",
        type_="unique",
    )
    op.create_unique_constraint(
        NOMBRE_UNIQUE_ANTERIOR,
        "tarifas_cliente_producto",
        COLUMNAS_UNIQUE[:-1],
    )
    op.drop_column("tarifas_cliente_producto", "vigente_desde")
    op.drop_column("tarifas", "vigente_hasta")
    op.drop_column("tarifas", "vigente_desde")
