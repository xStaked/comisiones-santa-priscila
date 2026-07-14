from decimal import Decimal

from app.services.info_adicional_fincas import asignar_fincas_desde_info_adicional
from app.services.order_extraction_models import OrdenItemValidado, OrdenValidada


# Bloque tal cual lo devuelve PyMuPDF para "DIN 001-002-000002257 SP.pdf":
# el PDF corta "PASTILLAS" a la mitad entre celdas (PASTIL / LAS TH).
TEXTO_FACTURA = """Información Adicional
Descripción
VENTA DE PRODUCTOS SEG. F/ # 2257 O/C
# 95007 - SEMANA 21 - AFRICA : 200KG
PASTILLAS TH. ASIA : 200KG PASTILLAS TH.
CALIFORNIA ADM A : 130KG PASTILLAS.
CALIFORNIA ADM B : 370KG PASTILLAS TH.
CHANDUY : 100KG PASTILLAS TH.
CORVINERO ADM A : 50KG ECUBACILLUS
AGUA. CORVINERO ADM B : 200KG
PASTILLAS TH.
Descripción
DAULAR : 80KG ECUB. AGUA, 40KG
ECUBACILLUS SUELO, 80KG PASTILLAS TH.
DAULAR CURAZAO : 20KG ECUB. AGUA,
40KG ECUB. SUELO Y 40KG PASTILLAS TH.
GOLFO : 60KG ECUB. PASTILLAS GRANDES
Y 310KG ECUBACILLUS SALUD. TAURA ADM
A : 200KG PASTILLAS TH. TAURA ADM B :
500KG PASTILLAS TH. TAURA ADM C :
600KG PASTIL
Descripción
LAS TH. TAURA ADM D : 300KG PASTILLAS
TH Y 100KG ECUBACILLUS SALUD.
Formas de pago
Otros con Utilización del Sistema
Financiero
"""

# (cantidad, producto) de la tabla, en el orden del PDF.
LINEAS = [
    (100, "B1 - ECU-BACILLUS (salud)"),
    (310, "B1 - ECU-BACILLUS (salud)"),
    (40, "C1 - ECU-BACILLUS (suelo)"),
    (40, "C1 - ECU-BACILLUS (suelo)"),
    (60, "C1PG - ECU-BACILLUS (suelo) PASTILLAS"),
    (200, "C1TH - ECU-BACILLUS (suelo) PASTILLAS TH"),
    (300, "C1TH - ECU-BACILLUS (suelo) PASTILLAS TH"),
    (600, "C1TH - ECU-BACILLUS (suelo) PASTILLAS TH"),
    (500, "C1TH - ECU-BACILLUS (suelo) PASTILLAS TH"),
    (200, "C1TH - ECU-BACILLUS (suelo) PASTILLAS TH"),
    (40, "C1TH - ECU-BACILLUS (suelo) PASTILLAS TH"),
    (80, "C1TH - ECU-BACILLUS (suelo) PASTILLAS TH"),
    (100, "C1TH - ECU-BACILLUS (suelo) PASTILLAS TH"),
    (370, "C1TH - ECU-BACILLUS (suelo) PASTILLAS TH"),
    (130, "C1TH - ECU-BACILLUS (suelo) PASTILLAS TH"),
    (200, "C1TH - ECU-BACILLUS (suelo) PASTILLAS TH"),
    (200, "C1TH - ECU-BACILLUS (suelo) PASTILLAS TH"),
    (50, "E1 - ECU-BACILLUS (AGUA)"),
    (80, "E1 - ECU-BACILLUS (AGUA)"),
    (20, "E1 - ECU-BACILLUS (AGUA)"),
]


def _orden() -> OrdenValidada:
    return OrdenValidada(
        fecha="2026-05-22",
        numeroOrden="001-002-000002257",
        proveedor="DINACUAMAR",
        cliente="INDUSTRIAL PESQUERA SANTA PRISCILA S.A.",
        semana="21",
        items=[
            OrdenItemValidado(
                fecha="2026-05-22",
                numeroOrden="001-002-000002257",
                finca="-",
                producto=producto,
                cantidad=Decimal(cantidad),
                unidad="kg",
                precioUnitario=Decimal("50"),
                total=Decimal(cantidad) * Decimal("50"),
            )
            for cantidad, producto in LINEAS
        ],
    )


def test_asigna_finca_a_todos_los_items():
    orden = _orden()
    asignar_fincas_desde_info_adicional(TEXTO_FACTURA, orden)

    assert all(item.finca != "-" for item in orden.items)

    por_finca = {}
    for item in orden.items:
        por_finca.setdefault(item.finca, []).append((int(item.cantidad), item.producto))

    # Los dos sectores que la IA se saltaba, incluido el partido a la mitad.
    assert por_finca["ASIA"] == [(200, LINEAS[5][1])]
    assert sorted(c for c, _ in por_finca["TAURA ADM C"]) == [600]
    assert sorted(c for c, _ in por_finca["TAURA ADM D"]) == [100, 300]

    # Familias distintas con la misma cantidad no se cruzan.
    assert sorted(por_finca["DAULAR"]) == sorted(
        [(80, LINEAS[18][1]), (40, LINEAS[2][1]), (80, LINEAS[11][1])]
    )
    assert sorted(c for c, _ in por_finca["GOLFO"]) == [60, 310]


def test_factura_sin_sectores_no_toca_nada():
    orden = _orden()
    asignar_fincas_desde_info_adicional(
        "Información Adicional\nDescripción\n"
        "VENTA DE PRODUCTOS SEG. F/ # 2043 O/C # 0001365 DE 32 CANECAS DE 20LITS.\n"
        "Formas de pago\n",
        orden,
    )
    assert all(item.finca == "-" for item in orden.items)


# "EO 001-002-000002059 SP.pdf": la glosa va dentro de la tabla, el sector va
# ANTES de la cantidad y las unidades son litros.
TEXTO_FACTURA_OCHOA = """P000000007
CITRIUS
VENTA DE PRODUCTOS SEG. F/ # 2059 O/C # 94564  SEMANA 20
A SANTA PRISCILA - CHANDUY. 100 LITS DE CITRIUS, GOLFO.
300 LITS CITRIUS Y TAURA ADM D. 800 LITS CITRIUS.
Litros
800,00
5,500000
0,00
4.400,00
6.600,00
   VALOR TOTAL
"""


def _orden_ochoa() -> OrdenValidada:
    return OrdenValidada(
        fecha="2026-05-15",
        numeroOrden="001-002-000002059",
        proveedor="OCHOA RECALDE ELIZABETH MERCEDES",
        cliente="INDUSTRIAL PESQUERA SANTA PRISCILA S.A.",
        semana="20",
        items=[
            OrdenItemValidado(
                fecha="2026-05-15",
                numeroOrden="001-002-000002059",
                finca="-",
                producto="CITRIUS",
                cantidad=Decimal(cantidad),
                unidad="litros",
                precioUnitario=Decimal("5.5"),
                total=Decimal(cantidad) * Decimal("5.5"),
            )
            for cantidad in (100, 300, 800)
        ],
    )


def test_glosa_sin_dos_puntos_y_pegada_al_encabezado():
    """DIN 2250/2247: 'CALIFORNIA ADM A 90KG' sin dos puntos y 'SEMANA 19 AFRICA'."""
    orden = OrdenValidada(
        fecha="2026-05-08",
        numeroOrden="001-002-000002247",
        proveedor="DINACUAMAR",
        semana="19",
        items=[
            OrdenItemValidado(
                fecha="2026-05-08",
                numeroOrden="001-002-000002247",
                finca="-",
                producto=producto,
                cantidad=Decimal(cantidad),
                unidad="kg",
                precioUnitario=Decimal("50"),
                total=Decimal(cantidad) * Decimal("50"),
            )
            for cantidad, producto in [
                (100, "C1TH - ECU-BACILLUS (suelo) PASTILLAS TH"),
                (90, "C1TH - ECU-BACILLUS (suelo) PASTILLAS TH"),
                (100, "C1PG - ECU-BACILLUS (suelo) PASTILLAS"),
            ]
        ],
    )
    asignar_fincas_desde_info_adicional(
        "VENTA DE PRODUCTOS SEG. F/ # 2250 O/C # 94561 - SEMANA 19 AFRICA : 100KG "
        "PAST. TH. CALIFORNIA ADM A 90KG PAST. TH. GOLFO : 100KG ECUB. PAST. GRANDES.\n"
        "Formas de pago\n",
        orden,
    )
    assert [i.finca for i in orden.items] == ["AFRICA", "CALIFORNIA ADM A", "GOLFO"]


def test_un_solo_item_y_un_solo_sector_aunque_la_cantidad_no_cruce():
    """EO 2066: la glosa cuenta sacos (600) y la tabla kilos (15.000)."""
    orden = OrdenValidada(
        fecha="2026-05-22",
        numeroOrden="001-002-000002066",
        proveedor="OCHOA RECALDE ELIZABETH MERCEDES",
        semana="21",
        items=[
            OrdenItemValidado(
                fecha="2026-05-22",
                numeroOrden="001-002-000002066",
                finca="-",
                producto="ECU - CALCINIT ACUÍCOLA",
                cantidad=Decimal("15000"),
                unidad="kg",
                precioUnitario=Decimal("1.06"),
                total=Decimal("15900"),
            )
        ],
    )
    asignar_fincas_desde_info_adicional(
        "VENTA DE PRODUCTOS SEG. F/ # 2066 O/C # 95008 - SEMANA\n"
        "21 A SANTA PRISCILA  - GOLFO  (600 SACOS DE 25KG DE\n"
        "CALCINIT A $ 26,50 CADA SACO).\nKilogramo\ns\n15.000,00\n",
        orden,
    )
    assert orden.items[0].finca == "GOLFO"


def test_glosa_con_sector_antes_de_la_cantidad():
    orden = _orden_ochoa()
    asignar_fincas_desde_info_adicional(TEXTO_FACTURA_OCHOA, orden)

    assert [(int(i.cantidad), i.finca) for i in orden.items] == [
        (100, "CHANDUY"),
        (300, "GOLFO"),
        (800, "TAURA ADM D"),
    ]
