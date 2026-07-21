from datetime import date
from decimal import Decimal

from app.models.retencion import Retencion
from app.services.retencion import cargar_periodos, retencion_para


def _sembrar_periodos(db_session):
    """Los mismos tramos que siembra la migración."""
    db_session.add_all([
        Retencion(vigente_desde=date(1900, 1, 1), porcentaje=Decimal("1.75")),
        Retencion(vigente_desde=date(2026, 3, 1), porcentaje=Decimal("2.00")),
    ])
    db_session.commit()


def test_persiste_un_periodo_de_retencion(db_session):
    periodo = Retencion(vigente_desde=date(2026, 3, 1), porcentaje=Decimal("2.00"))
    db_session.add(periodo)
    db_session.commit()

    guardado = db_session.query(Retencion).one()

    assert guardado.vigente_desde == date(2026, 3, 1)
    assert guardado.porcentaje == Decimal("2.00")
    assert guardado.id is not None


def test_carga_periodos_del_mas_reciente_al_mas_antiguo(db_session):
    _sembrar_periodos(db_session)

    periodos = cargar_periodos(db_session)

    assert [p.vigente_desde for p in periodos] == [date(2026, 3, 1), date(1900, 1, 1)]


def test_factura_del_ultimo_dia_de_febrero_retiene_1_75(db_session):
    _sembrar_periodos(db_session)
    periodos = cargar_periodos(db_session)

    assert retencion_para(periodos, date(2026, 2, 28)) == Decimal("1.75")


def test_factura_del_primer_dia_de_marzo_retiene_2(db_session):
    """El borde exacto entre tramos: `vigente_desde` es inclusivo."""
    _sembrar_periodos(db_session)
    periodos = cargar_periodos(db_session)

    assert retencion_para(periodos, date(2026, 3, 1)) == Decimal("2.00")


def test_factura_posterior_al_ultimo_tramo_usa_ese_tramo(db_session):
    _sembrar_periodos(db_session)
    periodos = cargar_periodos(db_session)

    assert retencion_para(periodos, date(2027, 12, 31)) == Decimal("2.00")


def test_sin_periodos_registrados_cae_al_valor_por_defecto(db_session):
    assert retencion_para([], date(2026, 5, 1)) == Decimal("1.75")
