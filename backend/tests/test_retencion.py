from datetime import date
from decimal import Decimal

from app.models.retencion import Retencion


def test_persiste_un_periodo_de_retencion(db_session):
    periodo = Retencion(vigente_desde=date(2026, 3, 1), porcentaje=Decimal("2.00"))
    db_session.add(periodo)
    db_session.commit()

    guardado = db_session.query(Retencion).one()

    assert guardado.vigente_desde == date(2026, 3, 1)
    assert guardado.porcentaje == Decimal("2.00")
    assert guardado.id is not None
