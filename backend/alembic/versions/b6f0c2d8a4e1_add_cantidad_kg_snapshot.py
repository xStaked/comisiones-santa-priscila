"""add cantidad_kg_snapshot a liquidacion_items

Revision ID: b6f0c2d8a4e1
Revises: a7b8c9d0e1f2
Create Date: 2026-11-10

La cantidad de una OC viene en envases (10 tachos) y la de una factura en kg
(100 kg). Los reportes mostraban la cantidad cruda, así que la columna "Cant"
no cuadraba con la comisión fijo_kg. Guardamos la cantidad base con la que se
liquidó (kg, o litros: 1 L ≈ 1 kg) para que la exportación histórica siga
cuadrando aunque cambie el tamaño del envase.
"""

from alembic import op
import sqlalchemy as sa


revision = "b6f0c2d8a4e1"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "liquidacion_items",
        sa.Column("cantidad_kg_snapshot", sa.Numeric(precision=12, scale=2), nullable=True),
    )

    # Backfill con la misma regla de _cantidad_para_tarifa_kg(): si la unidad
    # del documento es un envase, la cantidad base sale del producto (con los
    # defaults del servicio); si ya viene en kg/litros, la cantidad no cambia.
    op.execute(
        """
        UPDATE liquidacion_items AS li
        SET cantidad_kg_snapshot = CASE
            WHEN lower(coalesce(li.unidad_snapshot, '')) LIKE '%tacho%'
                THEN li.cantidad_snapshot * coalesce(p.tacho_kilos, 10)
            WHEN lower(coalesce(li.unidad_snapshot, '')) LIKE '%saco%'
                THEN li.cantidad_snapshot * coalesce(p.saco_kilos, 25)
            WHEN lower(coalesce(li.unidad_snapshot, '')) LIKE '%caneca%'
                THEN li.cantidad_snapshot * 20
            ELSE li.cantidad_snapshot
        END
        FROM orden_items AS oi
        LEFT JOIN productos AS p ON p.id = oi.producto_id
        WHERE oi.id = li.orden_item_id
        """
    )


def downgrade() -> None:
    op.drop_column("liquidacion_items", "cantidad_kg_snapshot")
