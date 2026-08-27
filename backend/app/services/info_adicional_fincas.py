"""Reparte entre los ítems los sectores que solo aparecen en el texto libre.

Las facturas a Santa Priscila no traen columna de finca: los sectores van
nombrados dentro de la glosa ("VENTA DE PRODUCTOS SEG. F/ # ..."), y cada
emisor la redacta distinto:

- DINACUAMAR:  "AFRICA : 200KG PASTILLAS TH. ASIA : 200KG PASTILLAS TH."
- OCHOA:       "CHANDUY. 100 LITS DE CITRIUS, GOLFO. 300 LITS CITRIUS"
- OCHOA:       "O/C # 95644 SEMANA 23 SECTOR GOLFO (850 SACOS DE 25KG)"

Cruzar eso con la tabla se le escapa a la IA (sectores enteros sin asignar).

Acá el nombre NO se adivina podando el ruido de la glosa: se buscan los
sectores del CATÁLOGO dentro del texto. La lista de sectores es cerrada y sale
de la base, así que da igual la puntuación, los dos puntos que faltan, la
palabra SECTOR de más o el orden de las frases: lo que no está en el catálogo
no se inventa, y un sector nuevo se resuelve dándolo de alta, sin tocar código.

Cada mención abre un tramo que llega hasta la siguiente: las cantidades de ese
tramo son suyas.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from decimal import Decimal, InvalidOperation

from app.services.catalog_normalization import _normalizar_texto, normalizar_nombre_finca
from app.services.order_extraction_models import OrdenValidada

UNIDADES = r"(?:KGS?|KILOS?|LITROS?|LITS?|SACOS?|TACHOS?|CANECAS?)"
ENVASES = r"(?:SACOS?|TACHOS?|CANECAS?|ENVASES?|FUNDAS?)"


# El PDF parte palabras entre celdas ("600KG PASTIL" + "LAS TH"): comparar sin
# espacios ni puntuación vuelve equivalentes las dos mitades y el original.
def _clave(texto: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", _normalizar_texto(texto))


def _cantidad(texto: str) -> Decimal | None:
    # ponytail: las glosas escriben enteros ("310", "1.700"); si algún día
    # aparece un decimal habrá que distinguir separador de miles del decimal.
    try:
        return Decimal(re.sub(r"[.,]", "", texto))
    except InvalidOperation:
        return None


def _familia(texto: str) -> str:
    clave = _clave(texto)
    if "PASTILLASTH" in clave or "PASTTH" in clave:
        return "TH"
    if "PASTILLA" in clave or "PAST" in clave:  # la glosa abrevia "PAST. GRANDES"
        return "PASTILLA"
    if "AGUA" in clave:
        return "AGUA"
    if "SALUD" in clave:
        return "SALUD"
    if "SUELO" in clave or "POLVO" in clave:
        return "SUELO"
    return ""


def _bloque_glosa(texto_pdf: str) -> str:
    """La glosa arranca en 'VENTA DE PRODUCTOS' y termina donde empiezan los
    importes; según el emisor está en la tabla o en Información Adicional."""
    lineas = texto_pdf.splitlines()
    inicio = next(
        (i for i, linea in enumerate(lineas) if "VENTADEPRODUCTOS" in _clave(linea)),
        None,
    )
    if inicio is None:
        return ""

    cortes = ("FORMASDEPAGO", "FORMAPAGO", "SUBTOTAL", "VALORTOTAL", "IVA")
    partes: list[str] = []
    for linea in lineas[inicio:]:
        clave = _clave(linea)
        if clave.isdigit() or clave.startswith(cortes):
            break
        if clave in {"DESCRIPCION", "INFORMACIONADICIONAL", ""}:
            continue
        partes.append(linea.strip())
    return " ".join(partes)


def _menciones(
    bloque: str, catalogo: dict[tuple[str, ...], str]
) -> list[tuple[str, int, int, bool, str, float]]:
    """Los sectores del catálogo que aparecen en la glosa, con su posición.

    `normalizar_nombre_finca` es el mismo criterio con el que después se busca
    la finca en la base: descarta ADM y SECTOR y arregla GOLDO, así que
    "TAURA ADM D" en la glosa casa con "TAURA D" del catálogo.

    Retorna (nombre_catalogo, start, end, es_fuzzy, texto_original, ratio)
    con soporte difuso para typos como CALIFRONIA → CALIFORNIA.
    """
    import difflib

    tokens = [
        (clave, palabra.start(), palabra.end(), palabra.group())
        for palabra in re.finditer(r"[^\W_]+", bloque)
        if (clave := normalizar_nombre_finca(palabra.group()))
    ]
    largo_max = max((len(clave) for clave in catalogo), default=0)

    menciones: list[tuple[str, int, int, bool, str, float]] = []
    indice = 0
    while indice < len(tokens):
        # De más largo a más corto: "DAULAR CURAZAO" antes que "DAULAR".
        encontrado = False
        for largo in range(min(largo_max, len(tokens) - indice), 0, -1):
            clave_ventana = tuple(t[0] for t in tokens[indice : indice + largo])
            nombre = catalogo.get(clave_ventana)
            if nombre:
                menciones.append(
                    (nombre, tokens[indice][1], tokens[indice + largo - 1][2], False, "", 1.0)
                )
                indice += largo
                encontrado = True
                break
            # Fallback difuso solo entre claves del mismo largo (evita confundir CALIFORNIA A con CALIFORNIA B)
            umbral_largo = 0.80 if largo == 1 else 0.80 if largo == 2 else 0.85
            texto_ventana_norm = " ".join(clave_ventana)
            mejor = None
            mejor_ratio = 0.0
            mejor_nombre = None
            mejor_clave = None
            texto_original_ventana = " ".join(t[3] for t in tokens[indice : indice + largo])
            for clave_cat, nombre_cat in catalogo.items():
                if len(clave_cat) != largo:
                    continue
                candidato_norm = " ".join(clave_cat)
                r = difflib.SequenceMatcher(None, texto_ventana_norm, candidato_norm).ratio()
                if r > mejor_ratio:
                    mejor_ratio = r
                    mejor = candidato_norm
                    mejor_nombre = nombre_cat
                    mejor_clave = clave_cat
            # Para ventanas multi-token, exigir que cada token sea razonablemente similar
            # Evita falso positivo "TH CALIFORNIA" → "CALIFORNIA A" (ratio global 0.80 pero tokens "TH"≠"CALIFORNIA")
            if mejor_nombre and mejor_ratio >= umbral_largo:
                if largo > 1 and mejor_clave is not None:
                    tokens_ok = True
                    for tok_vent, tok_cat in zip(clave_ventana, mejor_clave):
                        rr_tok = difflib.SequenceMatcher(None, tok_vent, tok_cat).ratio()
                        if rr_tok < 0.60:
                            tokens_ok = False
                            break
                    if not tokens_ok:
                        # No es un typo plausible, seguir buscando otra longitud o avanzar
                        continue
                menciones.append(
                    (
                        mejor_nombre,
                        tokens[indice][1],
                        tokens[indice + largo - 1][2],
                        True,
                        texto_original_ventana,
                        mejor_ratio,
                    )
                )
                indice += largo
                encontrado = True
                break
        if not encontrado:
            indice += 1
    return menciones


def _entradas(
    bloque: str, menciones: list[tuple[str, int, int, bool, str, float]]
) -> list[tuple[str, Decimal, str]]:
    """(sector, cantidad, familia) por cada cantidad nombrada en su tramo."""
    entradas: list[tuple[str, Decimal, str]] = []

    for orden_mencion, (nombre, _, fin, *_resto) in enumerate(menciones):
        siguiente = (
            menciones[orden_mencion + 1][1]
            if orden_mencion + 1 < len(menciones)
            else len(bloque)
        )
        # "850 SACOS DE 25KG DE CALCINIT": los 25KG son el tamaño del envase,
        # no una cantidad pedida. Sin podarlo entra como un ítem fantasma.
        tramo = re.sub(
            rf"({ENVASES})\s+DE\s+\d[\d.,]*\s*{UNIDADES}\b",
            r"\1",
            bloque[fin:siguiente],
            flags=re.I,
        )

        cantidades = list(re.finditer(rf"(\d[\d.,]*)\s*{UNIDADES}\b", tramo, re.I))
        for i, cantidad in enumerate(cantidades):
            fin_familia = (
                cantidades[i + 1].start() if i + 1 < len(cantidades) else len(tramo)
            )
            valor = _cantidad(cantidad.group(1))
            if valor is not None:
                entradas.append(
                    (nombre, valor, _familia(tramo[cantidad.end() : fin_familia]))
                )

    return entradas


def asignar_fincas_desde_info_adicional(
    texto_pdf: str, orden: OrdenValidada, fincas: Iterable[str]
) -> None:
    """Sobreescribe la finca de los ítems con los sectores nombrados en la glosa.

    `fincas` son los nombres del catálogo: sin catálogo no hay nada que anclar
    y la orden queda intacta.
    """
    catalogo: dict[tuple[str, ...], str] = {}
    for nombre in fincas:
        clave = tuple(normalizar_nombre_finca(nombre).split())
        if clave:
            catalogo.setdefault(clave, nombre)
    if not catalogo:
        return

    bloque = _bloque_glosa(texto_pdf)
    if not bloque:
        return
    menciones = _menciones(bloque, catalogo)
    entradas = _entradas(bloque, menciones)
    if not entradas:
        return

    libres = list(range(len(orden.items)))
    pendientes = list(entradas)

    # Mapear finca -> info de si vino por fuzzy (para advertencias)
    fuzzy_por_finca: dict[str, tuple[str, float]] = {}
    for nombre, _s, _e, es_fuzzy, texto_orig, r in menciones:
        if es_fuzzy:
            # guardar solo el primer original por finca (evita duplicar)
            fuzzy_por_finca.setdefault(nombre, (texto_orig, r))

    # Primero cantidad + familia; lo que sobre, solo por cantidad (la glosa a
    # veces abrevia "PASTILLAS" donde la tabla dice "PASTILLAS TH").
    for exigir_familia in (True, False):
        for entrada in list(pendientes):
            finca, cantidad, familia = entrada
            indice = next(
                (
                    i
                    for i in libres
                    if orden.items[i].cantidad == cantidad
                    and (
                        not exigir_familia
                        or _familia(orden.items[i].producto) == familia
                    )
                ),
                None,
            )
            if indice is None:
                continue
            orden.items[indice].finca = finca
            # Si esta finca vino de corrección difusa, registrar advertencia
            if finca in fuzzy_por_finca:
                orig, rr = fuzzy_por_finca[finca]
                msg = f'Sector en glosa corregido automáticamente: "{orig}" → "{finca}" (similitud {int(round(rr*100))}%).'
                if msg not in getattr(orden.items[indice], "advertencias", []):
                    if not hasattr(orden.items[indice], "advertencias") or orden.items[indice].advertencias is None:
                        orden.items[indice].advertencias = []
                    orden.items[indice].advertencias.append(msg)
                    if not getattr(orden.items[indice], "correccion", None):
                        orden.items[indice].correccion = {
                            "campo": "finca",
                            "original": orig,
                            "sugerido": finca,
                            "similitud": round(rr, 3),
                        }
            libres.remove(indice)
            pendientes.remove(entrada)

    # La glosa nombra un solo sector: todo ítem que no cruzó por cantidad va
    # ahí. Cruzar es imposible cuando la glosa cuenta envases y la tabla kilos
    # ("89 CANECAS DE 20LITS" contra 880 y 900 litros; "600 SACOS DE 25KG"
    # contra 15.000 kg), pero con un solo sector nombrado no hay ambigüedad.
    # Se mira lo NOMBRADO, no lo que rindió cantidades: si la glosa menciona
    # dos sectores y solo uno traía cantidad, repartir todo al otro sería
    # inventar.
    nombrados = {nombre for nombre, _, _, *_r in menciones}
    if len(nombrados) == 1:
        (finca,) = tuple(nombrados)
        for indice in libres:
            orden.items[indice].finca = finca
            if finca in fuzzy_por_finca:
                orig, rr = fuzzy_por_finca[finca]
                msg = f'Sector en glosa corregido automáticamente: "{orig}" → "{finca}" (similitud {int(round(rr*100))}%).'
                if msg not in getattr(orden.items[indice], "advertencias", []):
                    if not hasattr(orden.items[indice], "advertencias") or orden.items[indice].advertencias is None:
                        orden.items[indice].advertencias = []
                    orden.items[indice].advertencias.append(msg)
