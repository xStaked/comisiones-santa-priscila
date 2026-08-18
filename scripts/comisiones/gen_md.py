"""Genera las tablas pivote en markdown desde pdf_tarifas.csv."""
import csv, collections

ORD = ["PAST TH", "PAST GRAN", "PAST ALIM", "PASTILLAS", "SALUD", "AGUA", "SUELO/POLVO",
       "CITRIUS", "NATUXTRACT", "CALCINIT", "MORTAL C", "MORTAL SHELL",
       "ECULACTICAS", "MAGNESIUM/CALCIUM/POTASIUM"]
CORTO = {"PAST TH": "TH", "PAST GRAN": "GRAN", "PAST ALIM": "ALIM", "PASTILLAS": "PAST",
         "SALUD": "SALUD", "AGUA": "AGUA", "SUELO/POLVO": "SUELO", "CITRIUS": "CITRIUS",
         "NATUXTRACT": "NATUX", "CALCINIT": "CALCIN", "MORTAL C": "MORTAL",
         "MORTAL SHELL": "M.SHELL", "ECULACTICAS": "ECULACT", "MAGNESIUM/CALCIUM/POTASIUM": "MG/CA/K"}

filas = list(csv.DictReader(open("pdf_tarifas.csv"), delimiter="|"))

def fmt(tipo, val):
    v = float(val)
    return f"{v:g}%" if tipo == "%" else f"${v:.2f}".replace(".", ",")

def tabla(rows, key_fila, titulo_col):
    prods = [p for p in ORD if any(r["producto_pdf"] == p for r in rows)]
    celdas = collections.defaultdict(dict)
    orden = []
    for r in rows:
        k = key_fila(r)
        if k not in orden:
            orden.append(k)
        celdas[k][r["producto_pdf"]] = fmt(r["tipo"], r["valor"])
    out = ["| " + titulo_col + " | " + " | ".join(CORTO[p] for p in prods) + " |",
           "| --- |" + " ---: |" * len(prods)]
    for k in orden:
        out.append("| " + k + " | " + " | ".join(celdas[k].get(p, "·") for p in prods) + " |")
    return "\n".join(out)

buf = []
for origen, titulo in [("SP-INTERNA", "Santa Priscila — comisionistas internos"),
                       ("OE-INTERNA", "Otras empresas — comisionistas internos")]:
    buf.append(f"\n### {titulo}\n")
    sub = [r for r in filas if r["origen"] == origen]
    col = "Sector" if origen == "SP-INTERNA" else "Empresa"
    for com in ["ARROYO", "CASTRO", "PINEDA", "MALAVE"]:
        rs = [r for r in sub if r["comisionista"] == com]
        if not rs:
            buf.append(f"**{com}** — sin tarifas en esta matriz (todo 0%).\n")
            continue
        buf.append(f"**{com}**\n")
        buf.append(tabla(rs, lambda r: r["sector"] or r["cliente"], col) + "\n")

buf.append("\n### Externas — cliente Santa Priscila\n")
buf.append(tabla([r for r in filas if r["origen"] == "EXT-SP"],
                 lambda r: f"{r['comisionista']} · {r['sector']}", "Comisionista · Sector") + "\n")
buf.append("\n### Externas — otros clientes\n")
buf.append(tabla([r for r in filas if r["origen"] == "EXT-OTROS"],
                 lambda r: f"{r['comisionista']} · {r['cliente']}", "Comisionista · Empresa") + "\n")

open("tablas.md", "w").write("\n".join(buf))
print("\n".join(buf))
