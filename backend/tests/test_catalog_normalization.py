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
