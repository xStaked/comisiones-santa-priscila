"""reactivar tarifas AUGURTO del periodo junio-agosto 2026

Revision ID: b4e2f7a9c1d3
Revises: c3d9f1a2b7e4
Create Date: 2026-11-16

El cierre del periodo junio–agosto 2026 de AUGURTO MANUEL quedó con
`activo = false`, además de `vigente_hasta = 2026-08-31`. El resto de las
tarifas cerradas por fecha (CASTRO hasta 2026-07-31, MALAVE hasta 2026-05-31)
conservan `activo = true`, que es lo que permite liquidar facturas de su
periodo: la resolución exige vigencia Y activo.

Sin esta corrección, las facturas de TAURA A–D de junio a agosto quedan sin
comisionista para los productos de esa matriz (SALUD, AGUA, SUELO, PASTILLA
TH, CALCINIT, ...). Las tarifas del periodo siguiente (2026-09-01) no se
tocan y siguen mandando desde septiembre.
"""

from alembic import op

revision = "b4e2f7a9c1d3"
down_revision = "c3d9f1a2b7e4"
branch_labels = None
depends_on = None


def _actualizar(activo: bool) -> None:
    op.execute(
        f"""
        UPDATE tarifas_cliente_producto t
        SET activo = {str(activo).lower()}
        FROM comisionistas c
        WHERE c.id = t.comisionista_id
          AND c.nombre = 'AUGURTO MANUEL'
          AND t.vigente_hasta = DATE '2026-08-31'
          AND t.activo = {str(not activo).lower()}
        """
    )


def upgrade() -> None:
    _actualizar(True)


def downgrade() -> None:
    _actualizar(False)
