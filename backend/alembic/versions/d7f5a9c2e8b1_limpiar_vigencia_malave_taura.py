"""limpiar vigencia vencida de MALAVE en TAURA A-D (SALUD y AGUA)

Revision ID: d7f5a9c2e8b1
Revises: b4e2f7a9c1d3
Create Date: 2026-11-16

La matriz vigente (COMISIONES INTERNAS SANTA PRISCILA AL 12/10/2026) define
MALAVE con $1/kg y sin caducidad en todos los sectores de TAURA. Pero ocho
filas (TAURA A–D × AGUA/SALUD) conservaron `vigente_hasta = 2026-05-31` de la
matriz anterior. La migración a7b8 las reactivó (`activo = true`) sin limpiar
esa fecha, así que no aplican a ninguna factura posterior a mayo. El caso que
reportó el cliente es TAURA D + ECU-BACILLUS SALUD.

Desde ahora a7b8 limpia `vigente_hasta` al reactivar una fila de la matriz;
este UPDATE corrige las bases donde a7b8 ya corrió.
"""

from alembic import op

revision = "d7f5a9c2e8b1"
down_revision = "b4e2f7a9c1d3"
branch_labels = None
depends_on = None

_FILTRO = """
    FROM comisionistas co, clientes cl, productos p, fincas f
    WHERE co.id = t.comisionista_id AND co.nombre = 'MALAVE'
      AND cl.id = t.cliente_id AND cl.nombre = 'Santa Priscila'
      AND p.id = t.producto_id
      AND p.nombre IN ('ECU-BACILLUS AGUA', 'ECU-BACILLUS SALUD')
      AND f.id = t.finca_id
      AND f.nombre IN ('TAURA A', 'TAURA B', 'TAURA C', 'TAURA D')
      AND t.proveedor = ''
      AND t.vigente_desde IS NULL
"""


def upgrade() -> None:
    op.execute(
        f"UPDATE tarifas_cliente_producto t SET vigente_hasta = NULL "
        f"{_FILTRO} AND t.vigente_hasta IS NOT NULL"
    )


def downgrade() -> None:
    op.execute(
        f"UPDATE tarifas_cliente_producto t SET vigente_hasta = DATE '2026-05-31' "
        f"{_FILTRO} AND t.vigente_hasta IS NULL"
    )
