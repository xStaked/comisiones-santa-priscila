from app.services.catalog_normalization import normalizar_nombre_producto


def test_normaliza_agua_hacia_ecu_bacillus_agua():
    assert normalizar_nombre_producto("AGUA") == "ECU-BACILLUS AGUA"
    assert normalizar_nombre_producto("ECU-BACILLUS AGUA") == "ECU-BACILLUS AGUA"


def test_normaliza_salud_hacia_ecu_bacillus_salud():
    assert normalizar_nombre_producto("SALUD") == "ECU-BACILLUS SALUD"
    assert normalizar_nombre_producto("ECU-BACILLUS SALUD") == "ECU-BACILLUS SALUD"


def test_normaliza_suelo_polvo_hacia_ecu_bacillus_suelo():
    assert normalizar_nombre_producto("SUELO / POLVO") == "ECU-BACILLUS SUELO"
    assert normalizar_nombre_producto("ECU-BACILLUS SUELO POLVO") == "ECU-BACILLUS SUELO"


def test_normalizar_razon_social_ignora_sufijos_societarios():
    from app.services.catalog_normalization import normalizar_razon_social

    base = "INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR"
    assert normalizar_razon_social(base) == normalizar_razon_social(f"{base} CIA.LTDA.")
    assert normalizar_razon_social(base) == normalizar_razon_social(f"{base} CIA. LTDA.")
    assert normalizar_razon_social("EMPRESA X S.A.") == normalizar_razon_social("Empresa X")
    assert normalizar_razon_social(None) == ""


def test_normaliza_pastillas_en_plural_como_en_las_facturas():
    """Las facturas escriben PASTILLAS; el catálogo, PASTILLA."""
    from app.services.catalog_normalization import normalizar_nombre_producto as n

    # Cada código de factura cae en un producto distinto del catálogo.
    assert n("C1TH - ECU-BACILLUS (suelo) PASTILLAS TH") == n("ECU-BACILLUS SUELO PASTILLA TH")
    assert n("C1PA - ECU-BACILLUS (suelo) PASTILLAS ALIMENTADOR") == n(
        "ECU BACILLUS SUELO PASTILLA ALIMENTADOR"
    )
    # PASTILLAS GRANDES y SUELO PASTILLA son el mismo producto con dos nombres.
    assert n("ECU-BACILLUS PASTILLAS GRANDES") == n("ECU BACILLUS SUELO PASTILLA")
    assert n("PAST GRAN") == n("ECU BACILLUS SUELO PASTILLA")
    assert n("C1PG - ECU-BACILLUS (suelo) PASTILLAS") == n("ECU-BACILLUS PASTILLAS GRANDES")

    # Ninguno debe colapsar al polvo, que es otro producto con otra tarifa.
    suelo = n("ECU-BACILLUS (suelo) POLVO")
    assert n("C1TH - ECU-BACILLUS (suelo) PASTILLAS TH") != suelo
    assert n("C1PG - ECU-BACILLUS (suelo) PASTILLAS") != suelo

    # ...ni entre sí: PASTILLA a secas != PASTILLA ALIMENTADOR != PASTILLA TH.
    assert n("ECU BACILLUS SUELO PASTILLA") != n("ECU BACILLUS SUELO PASTILLA ALIMENTADOR")
    assert n("ECU BACILLUS SUELO PASTILLA") != n("ECU-BACILLUS SUELO PASTILLA TH")
