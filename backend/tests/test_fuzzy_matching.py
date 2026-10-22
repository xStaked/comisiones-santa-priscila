from types import SimpleNamespace

from app.services.fuzzy_matching import (
    UMBRAL_FINCA,
    UMBRAL_PRODUCTO,
    buscar_finca_cercana,
    buscar_producto_cercano,
    es_coincidencia_segura,
)


def _producto(nombre: str):
    return SimpleNamespace(nombre=nombre, alias=[])


def _finca(nombre: str):
    return SimpleNamespace(nombre=nombre)


def test_agua_no_coincide_con_salud():
    assert not es_coincidencia_segura(
        "ECU-BACILLUS AGUA", "ECU-BACILLUS SALUD", UMBRAL_PRODUCTO
    )


def test_typo_dentro_de_la_palabra_si_coincide():
    # "AGU" es un typo de "AGUA"; el resto del nombre es igual.
    assert es_coincidencia_segura(
        "ECU-BACILLUS AGUA", "ECU BACILLUS AGU", UMBRAL_PRODUCTO
    )


def test_pastillas_th_no_coincide_con_pastillas_grandes():
    assert not es_coincidencia_segura(
        "PAST TH", "ECU BACILLUS SUELO PASTILLA", UMBRAL_PRODUCTO
    )


def test_corvinero_a_no_coincide_con_corvinero_c():
    assert not es_coincidencia_segura("CORVINERO A", "CORVINERO C", UMBRAL_FINCA)


def test_typo_de_finca_si_coincide():
    assert es_coincidencia_segura("CALIFRONIA", "CALIFORNIA", UMBRAL_FINCA)


def test_productos_parecidos_de_otra_familia_no_coinciden():
    # CALCIUM y CALCINIT comparten casi todo el nombre, pero son productos
    # distintos: no deben resolverse por parecido.
    assert not es_coincidencia_segura("CALCIUM", "CALCINIT", UMBRAL_PRODUCTO)


def test_buscar_producto_agua_no_devuelve_salud():
    agua = _producto("ECU-BACILLUS AGUA")
    salud = _producto("ECU-BACILLUS SALUD")

    encontrado, r, _ = buscar_producto_cercano("ECU-BACILLUS AGUA", [agua, salud])

    assert encontrado is agua
    assert r == 1.0


def test_buscar_producto_con_typo_agua_no_devuelve_salud():
    agua = _producto("ECU-BACILLUS AGUA")
    salud = _producto("ECU-BACILLUS SALUD")

    encontrado, r, _ = buscar_producto_cercano("ECU BACILLUS AGU", [agua, salud])

    assert encontrado is agua
    assert r > 0.85


def test_buscar_producto_pastillas_th_no_devuelve_grandes():
    th = _producto("PAST TH")
    grandes = _producto("ECU BACILLUS SUELO PASTILLA")

    encontrado, _, _ = buscar_producto_cercano("PASTILLAS TH", [th, grandes])

    assert encontrado is th


def test_buscar_producto_pastillas_grandes_no_devuelve_th():
    th = _producto("PAST TH")
    grandes = _producto("ECU BACILLUS SUELO PASTILLA")

    encontrado, _, _ = buscar_producto_cercano("PASTILLAS GRANDES", [th, grandes])

    assert encontrado is grandes


def test_buscar_finca_corvinero_a_no_devuelve_c():
    a = _finca("CORVINERO A")
    c = _finca("CORVINERO C")

    encontrada, _, _ = buscar_finca_cercana("CORVINERO A", [a, c])

    assert encontrada is a


def test_buscar_finca_sin_sufijo_no_elige_una_hermana():
    a = _finca("CORVINERO A")
    c = _finca("CORVINERO C")

    encontrada, _, _ = buscar_finca_cercana("CORVINERO", [a, c])

    assert encontrada is None
