"""Extrae las 3 matrices de comisiones a un CSV canónico.

Salida: origen|comisionista|cliente|sector|producto_pdf|tipo|valor
tipo: $ (monto) o % (porcentaje). Celdas vacías o "-" se omiten; "0%" se omite.
"""
import fitz, csv, collections, sys

D = "/Users/xstaked/Downloads/"

def rows_por_y(page, tol=3):
    """Agrupa palabras en filas por coordenada y (tolerancia tol)."""
    ws = sorted(page.get_text("words"), key=lambda w: (w[1], w[0]))
    filas = []
    for w in ws:
        if filas and abs(w[1] - filas[-1][0]) <= tol:
            filas[-1][1].append(w)
        else:
            filas.append([w[1], [w]])
    return [(y, sorted(g, key=lambda w: w[0])) for y, g in filas]

def parse_valor(tok):
    """'$1'->('$',1.0)  '0,75'->('$',0.75)  '2,5%'->('%',2.5)  '-'->None"""
    t = tok.strip()
    if t in ("-", "$", ""):
        return None
    if t.endswith("%"):
        v = float(t[:-1].replace(",", "."))
        return None if v == 0 else ("%", v)
    t = t.lstrip("$")
    if not t or t == "-":
        return None
    try:
        v = float(t.replace(",", "."))
    except ValueError:
        return None
    return None if v == 0 else ("$", v)

def celdas(tokens, anclas, xmin):
    """Asigna cada token de valor a la columna (ancla) más cercana."""
    out = {}
    for w in tokens:
        if w[0] < xmin or w[4] == "$":
            continue
        v = parse_valor(w[4])
        if v is None:
            continue
        i = min(range(len(anclas)), key=lambda k: abs(anclas[k] - w[0]))
        if abs(anclas[i] - w[0]) > 14:
            print(f"  !! token '{w[4]}'@{w[0]:.0f} sin columna", file=sys.stderr)
            continue
        out[i] = v
    return out

# ---------------------------------------------------------------- PDF 1 y 2
# Ambos: filas = sector/empresa, columnas = producto x comisionista.
COM4 = ["ARROYO", "CASTRO", "PINEDA", "MALAVE"]
COM3 = ["ARROYO", "CASTRO", "PINEDA"]

def matriz_interna(path, prods4, bases4, prods3, bases3, xmin, ylim, off4=(0, 25, 42, 59), off3=(0, 25, 42)):
    cols = []  # (x, producto, comisionista)
    for p, b in zip(prods4, bases4):
        for c, o in zip(COM4, off4):
            cols.append((b + o, p, c))
    for p, b in zip(prods3, bases3):
        for c, o in zip(COM3, off3):
            cols.append((b + o, p, c))
    anclas = [c[0] for c in cols]

    page = fitz.open(path)[0]
    filas = rows_por_y(page)
    datos, etiquetas = [], []
    for y, toks in filas:
        val = [w for w in toks if w[0] >= xmin]
        lab = [w for w in toks if w[0] < xmin]
        if val and ylim[0] <= y <= ylim[1]:
            datos.append((y, val))
        if lab and ylim[0] - 6 <= y <= ylim[1] + 6:
            txt = " ".join(w[4] for w in lab)
            if txt.isupper() and "COMISIONES" not in txt and "SECTOR" not in txt and "EMPRESA" not in txt:
                etiquetas.append((y, txt))
    # cada etiqueta pertenece a la fila de datos más cercana
    nombre = {}
    for y, txt in etiquetas:
        yy = min((d[0] for d in datos), key=lambda dy: abs(dy - y))
        nombre[yy] = (nombre.get(yy, "") + " " + txt).strip()

    res = []
    for y, toks in datos:
        fila = nombre.get(y)
        if not fila:
            print(f"  !! fila y={y:.0f} sin etiqueta", file=sys.stderr)
            continue
        for i, (tipo, v) in sorted(celdas(toks, anclas, xmin).items()):
            _, prod, com = cols[i]
            res.append((com, fila, prod, tipo, v))
    return res

PRODS_SP4 = ["PAST TH", "PAST GRAN", "PAST ALIM", "SALUD", "AGUA", "SUELO/POLVO"]
PRODS_SP3 = ["CITRIUS", "NATUXTRACT", "CALCINIT", "MORTAL C"]
sp = matriz_interna(D + "Comisiones internas Santa Priscila.pdf",
                    PRODS_SP4, [91, 165, 239, 314, 388, 463],
                    PRODS_SP3, [537, 595, 652, 710], xmin=86, ylim=(108, 300))

PRODS_OE4 = ["PASTILLAS", "SALUD", "AGUA", "SUELO/POLVO"]
PRODS_OE3 = ["CITRIUS", "NATUXTRACT", "CALCINIT", "MORTAL C", "ECULACTICAS", "MAGNESIUM/CALCIUM/POTASIUM"]
oe = matriz_interna(D + "Comisiones internas Otras empresas (1).pdf",
                    PRODS_OE4, [108, 183, 257, 331],
                    PRODS_OE3, [404, 461, 519, 576, 634, 692], xmin=100, ylim=(144, 370))

# ------------------------------------------------------------------- PDF 3
# filas = comisionista + sector/empresa; columnas = producto.
# El comisionista se fusiona verticalmente: las líneas horizontales que arrancan
# en x=136 separan filas del MISMO comisionista; donde falta la línea, cambia.
EXT_P1 = ["PAST TH", "PAST GRAN", "SALUD", "AGUA", "SUELO/POLVO",
          "CITRIUS", "CALCINIT", "NATUXTRACT", "MORTAL C"]
EXT_P1_X = [258, 325, 392, 450, 511, 574, 616, 679, 748]
EXT_P2 = ["PASTILLAS", "SALUD", "AGUA", "SUELO/POLVO",
          "CITRIUS", "CALCINIT", "NATUXTRACT", "MORTAL C", "MORTAL SHELL"]
EXT_P2_X = [258, 325, 388, 447, 520, 563, 613, 668, 737]

# bloques (comisionista, nº de filas) en orden de aparición
BLOQUES_P1 = [("ALBURQUERQUE EDGAR", 1), ("ALEMAN ROBERT", 2), ("AUGURTO MANUEL", 4),
              ("ASUNCION REGIS", 2), ("CORDOVA JUAN CARLOS", 2), ("CORDOVA ROGER", 1),
              ("JAIME MARTIN", 1), ("NARANJO JUNIOR", 2), ("QUEVEDO RUBEN", 2),
              ("RUEDA JORGE", 7), ("RUGEL ANGEL", 1), ("ZARATE TEOBALDO", 2)]
BLOQUES_P2 = [("TOALA FRANCISCO", 1), ("GUALPA EDWARD", 1), ("ULLOA RONALD", 7),
              ("CONTRERAS FRANKLIN", 1)]

def matriz_externa(path, pg, prods, anclas, bloques, ymax, xmin=250, xlab=(140, 250)):
    page = fitz.open(path)[pg]
    filas = rows_por_y(page)
    datos, etiquetas = [], []
    for y, toks in filas:
        val = [w for w in toks if w[0] >= xmin]
        lab = [w for w in toks if xlab[0] <= w[0] < xlab[1]]
        if val and 118 < y < ymax:
            datos.append((y, val))
        if lab and 118 < y < ymax:
            etiquetas.append((y, " ".join(w[4] for w in lab)))
    nombre = {}
    for y, txt in etiquetas:
        yy = min((d[0] for d in datos), key=lambda dy: abs(dy - y))
        nombre[yy] = (nombre.get(yy, "") + " " + txt).strip()

    orden = [nombre.get(y, f"?y{y:.0f}") for y, _ in datos]
    esperado = sum(n for _, n in bloques)
    assert len(datos) == esperado, f"{path} p{pg}: {len(datos)} filas, esperaba {esperado}: {orden}"
    com_por_fila = [c for c, n in bloques for _ in range(n)]

    res = []
    for (y, toks), com in zip(datos, com_por_fila):
        fila = nombre.get(y)
        # aquí el "$" marca la columna y el importe va alineado a la derecha
        cel = {}
        for j, w in enumerate(toks):
            if w[4] != "$" or j + 1 >= len(toks):
                continue
            v = parse_valor(toks[j + 1][4])
            if v is None:
                continue
            i = min(range(len(anclas)), key=lambda k: abs(anclas[k] - w[0]))
            assert abs(anclas[i] - w[0]) <= 12, f"{fila}: $@{w[0]:.0f} sin columna"
            cel[i] = v
        for i, (tipo, v) in sorted(cel.items()):
            res.append((com, fila, prods[i], tipo, v))
    return res

ex1 = matriz_externa(D + "COMISIONES EXTERNAS RESUMEN (1).pdf", 0, EXT_P1, EXT_P1_X, BLOQUES_P1, ymax=450)
ex2 = matriz_externa(D + "COMISIONES EXTERNAS RESUMEN (1).pdf", 1, EXT_P2, EXT_P2_X, BLOQUES_P2, ymax=280)

out = csv.writer(open("pdf_tarifas.csv", "w", newline=""), delimiter="|")
out.writerow(["origen", "comisionista", "cliente", "sector", "producto_pdf", "tipo", "valor"])
for com, sector, prod, tipo, v in sp:
    out.writerow(["SP-INTERNA", com, "SANTA PRISCILA", sector, prod, tipo, v])
for com, emp, prod, tipo, v in oe:
    out.writerow(["OE-INTERNA", com, emp, "", prod, tipo, v])
for com, sector, prod, tipo, v in ex1:
    out.writerow(["EXT-SP", com, "SANTA PRISCILA", sector, prod, tipo, v])
for com, emp, prod, tipo, v in ex2:
    out.writerow(["EXT-OTROS", com, emp, "", prod, tipo, v])

print(f"SP-INTERNA {len(sp)} | OE-INTERNA {len(oe)} | EXT-SP {len(ex1)} | EXT-OTROS {len(ex2)}")
