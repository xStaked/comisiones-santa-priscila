"""Compara pdf_tarifas.csv contra prod_tarifas.txt (dump de producción).

    python3 parse_pdfs.py          # genera pdf_tarifas.csv desde los 3 PDF
    psql "$DB" -At -F'|' -c "
      SELECT co.nombre, cl.nombre, COALESCE(f.nombre,''), p.nombre, t.tipo, t.valor,
             COALESCE(t.vigente_hasta::text,'')
      FROM tarifas_cliente_producto t
      JOIN comisionistas co ON co.id=t.comisionista_id
      JOIN clientes cl ON cl.id=t.cliente_id
      JOIN productos p ON p.id=t.producto_id
      LEFT JOIN fincas f ON f.id=t.finca_id" > prod_tarifas.txt
    python3 diff_prod.py           # el informe
"""
import csv, collections, unicodedata

def norm(s):
    s = unicodedata.normalize("NFD", s.upper())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.replace("-", " ").split())

PROD = {  # etiqueta PDF -> (producto BD, tipo esperado)
    "PAST TH": ("ECU-BACILLUS SUELO PASTILLA TH", "fijo_kg"),
    "PAST GRAN": ("ECU-BACILLUS PASTILLAS GRANDES", "fijo_kg"),
    "PAST ALIM": ("ECU BACILLUS SUELO PASTILLA ALIMENTADOR", "fijo_kg"),
    "PASTILLAS": ("ECU-BACILLUS SUELO PASTILLA TH", "fijo_kg"),
    "SALUD": ("ECU-BACILLUS SALUD", "fijo_kg"),
    "AGUA": ("ECU-BACILLUS AGUA", "fijo_kg"),
    "SUELO/POLVO": ("ECU-BACILLUS SUELO", "fijo_kg"),
    "CITRIUS": ("CITRIUS-011", "fijo_kg"),
    "NATUXTRACT": ("NATUXTRACT-ECUCITRIUS", "fijo_unidad"),
    "CALCINIT": ("CALCINIT", "fijo_unidad"),
    "MORTAL C": ("MORTAL CONTROL", "fijo_kg"),
    "MORTAL SHELL": ("MORTAL SHELL", "fijo_kg"),
    "ECULACTICAS": ("ECULACTICAS", "fijo_kg"),
}
MULTI = {"MAGNESIUM/CALCIUM/POTASIUM": (["MAGNESIUM", "CALCIUM", "POTASIUM"], "fijo_kg")}

SECTOR = {  # etiqueta PDF -> finca BD
    "AFRICA": "AFRICA", "AFRICA ADMINISTRACION": "AFRICA",
    "ASIA": "ASIA", "ASIA ADMINISTRACION": "ASIA",
    "BAJEN A": "BAJEN A", "BAJEN ADM A": "BAJEN A",
    "BAJEN B": "BAJEN B", "BAJEN ADM B": "BAJEN B",
    "CALIFORNIA A": "CALIFORNIA A", "CALIFORNIA ADM A": "CALIFORNIA A",
    "CALIFORNIA B": "CALIFORNIA B", "CALIFORNIA ADM B": "CALIFORNIA B",
    "CORVINERO A": "CORVINERO A", "CORVINERO ADM A": "CORVINERO A",
    "CORVINERO B": "CORVINERO B", "CORVINERO ADM B": "CORVINERO B",
    "CORVINERO C": "CORVINERO C",
    "CHANDUY": "CHANDUY", "CHURUTE": "CHURUTE",
    "DAULAR": "DAULAR", "DAULAR ADMINISTRACION": "DAULAR", "DAULAR   ADMINISTRACION": "DAULAR",
    "DAULAR CURAZAO": "DAULAR CURAZAO",
    "GOLFO ADMINISTRAC": "GOLFO - ADMINISTRACION",
    "PANAMAO": "PAÑAMAO",
    "SABANA JAMAICA": "SABANA JAMAICA", "SABANA SINGAPUR": "SABANA SINGAPUR",
    "TAURA A": "TAURA A", "TAURA ADM A": "TAURA A",
    "TAURA B": "TAURA B", "TAURA ADM B": "TAURA B",
    "TAURA C": "TAURA C", "TAURA ADM C": "TAURA C",
    "TAURA ADM D": "TAURA D",
}
CLIENTE = {"ASOCIACION INTEDECAM CAMPONIO": "ASOC INT CAMPONIO",
           "INTEDECAM ISLA PALO SANTO": "INT ISL PALO SANTO"}

# --- producción -------------------------------------------------------------
prod = {}
for ln in open("prod_tarifas.txt"):
    ln = ln.rstrip("\n")
    if not ln:
        continue
    com, cli, fin, pr, tipo, val, hasta = ln.split("|")
    prod[(norm(com), norm(cli), norm(fin), norm(pr))] = (tipo, float(val), hasta)

# --- PDF --------------------------------------------------------------------
faltan, difieren, caducadas, ok = [], [], [], 0
vistos = set()
for r in csv.DictReader(open("pdf_tarifas.csv"), delimiter="|"):
    etq = r["producto_pdf"]
    prods, tipo_esp = MULTI[etq] if etq in MULTI else ([PROD[etq][0]], PROD[etq][1])
    tipo_esp = "porcentaje" if r["tipo"] == "%" else tipo_esp
    val_esp = float(r["valor"])
    cli = CLIENTE.get(norm(r["cliente"]), norm(r["cliente"]))
    fin = norm(SECTOR[norm(r["sector"])]) if r["sector"] else ""
    for p in prods:
        k = (norm(r["comisionista"]), cli, fin, norm(p))
        vistos.add(k)
        if k not in prod:
            faltan.append((r["origen"], *k, tipo_esp, val_esp))
            continue
        tipo_bd, val_bd, hasta = prod[k]
        if hasta:
            # tarifa dada de baja: el PDF es una foto vieja, no es una diferencia
            caducadas.append((r["origen"], *k, f"{tipo_bd} {val_bd}", f"vigente hasta {hasta}"))
        elif tipo_bd != tipo_esp or abs(val_bd - val_esp) > 1e-6:
            difieren.append((r["origen"], *k, f"PDF {tipo_esp} {val_esp}", f"BD {tipo_bd} {val_bd}"))
        else:
            ok += 1

sobran = [k for k in prod if k not in vistos]

print(f"OK {ok} | FALTAN EN BD {len(faltan)} | DIFIEREN {len(difieren)} | "
      f"CADUCADAS {len(caducadas)} | SOBRAN EN BD {len(sobran)}\n")
print("== CADUCADAS (dadas de baja en la BD, el PDF no lo refleja) ==")
for f in sorted(caducadas):
    print("  " + " | ".join(str(x) for x in f))

print("== FALTAN EN BD ==")
for f in sorted(faltan):
    print("  " + " | ".join(str(x) for x in f))
print("\n== DIFIEREN ==")
for f in sorted(difieren):
    print("  " + " | ".join(str(x) for x in f))
print("\n== SOBRAN EN BD (no están en ningún PDF) ==")
for k in sorted(sobran):
    print("  " + " | ".join(k) + f"  -> {prod[k][0]} {prod[k][1]}")
