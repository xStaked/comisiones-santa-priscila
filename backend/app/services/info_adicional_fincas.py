"""Reparte entre los ítems las fincas que solo aparecen en el texto libre.

Las facturas a Santa Priscila no traen columna de finca: los sectores se
nombran en la glosa ("VENTA DE PRODUCTOS SEG. F/ # ..."), con dos formatos
según quién emite:

- DINACUAMAR:  "AFRICA : 200KG PASTILLAS TH. ASIA : 200KG PASTILLAS TH."
- OCHOA:       "CHANDUY. 100 LITS DE CITRIUS, GOLFO. 300 LITS CITRIUS"

Cruzar eso con la tabla se le escapaba a la IA (sectores enteros sin asignar),
y el texto es regular: se parsea acá y se casa por cantidad + producto.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from app.services.catalog_normalization import _normalizar_texto
from app.services.order_extraction_models import OrdenValidada

UNIDADES = r"(?:KGS?|KILOS?|LITROS?|LITS?|SACOS?|TACHOS?|CANECAS?)"

# Palabras de la glosa que nunca son parte de un sector; sin esto un pedazo de
# producto ("LITS DE CITRIUS") o del encabezado ("SEMANA 19 AFRICA") terminaría
# escrito como finca del ítem.
RUIDO = {
    "VENTA",
    "PRODUCTOS",
    "SEG",
    "OC",
    "SEMANA",
    "SACO",
    "SACOS",
    "CANECA",
    "CANECAS",
    "TACHO",
    "TACHOS",
    "ENVASE",
    "ENVASES",
    "LITS",
    "LIT",
    "LITROS",
    "LITRO",
    "KG",
    "KGS",
    "KILO",
    "KILOS",
    "KILOGRAMO",
    "KILOGRAMOS",
    "CITRIUS",
    "CALCINIT",
    "ECU",
    "ECUB",
    "ECUBACILLUS",
    "BACILLUS",
    "PAST",
    "PASTILLAS",
    "PASTILLA",
    "SUELO",
    "AGUA",
    "SALUD",
    "GRANDES",
    "TH",
}

# Sobran cuando quedan sueltos tras podar el ruido ("LITS DE CITRIUS" → "DE").
CONECTORES = {"A", "DE", "DEL", "LA", "EL", "Y", "E", "O", "CADA", "SEG"}


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


def _nombre_valido(nombre: str) -> str:
    """Poda el ruido que arrastra el nombre ('SEMANA 19 AFRICA' → 'AFRICA')."""
    tokens = [
        token
        for token in _normalizar_texto(nombre).split()
        if token not in RUIDO and not token.isdigit()
    ]
    while tokens and tokens[0] in CONECTORES:
        tokens.pop(0)
    if not tokens or all(token in CONECTORES for token in tokens):
        return ""
    return " ".join(tokens)


def _entradas_prefijo(bloque: str) -> list[tuple[str, Decimal, str]]:
    """'DAULAR : 80KG ECUB. AGUA, 40KG ECUBACILLUS SUELO' — nombre y luego una
    o más cantidades. Los dos puntos a veces faltan ('CALIFORNIA ADM A 90KG')."""
    encabezados = [
        encabezado
        for encabezado in re.finditer(
            rf"([A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ0-9 ]{{2,}}?)\s*(?::\s*|(?=\d[\d.,]*\s*{UNIDADES}\b))",
            bloque,
        )
        if _nombre_valido(encabezado.group(1))
    ]
    entradas: list[tuple[str, Decimal, str]] = []

    for indice, encabezado in enumerate(encabezados):
        finca = _nombre_valido(encabezado.group(1))
        fin = (
            encabezados[indice + 1].start()
            if indice + 1 < len(encabezados)
            else len(bloque)
        )
        segmento = bloque[encabezado.end() : fin]

        cantidades = list(re.finditer(rf"(\d[\d.,]*)\s*{UNIDADES}\b", segmento, re.I))
        for i, cantidad in enumerate(cantidades):
            siguiente = (
                cantidades[i + 1].start() if i + 1 < len(cantidades) else len(segmento)
            )
            valor = _cantidad(cantidad.group(1))
            if valor is None:
                continue
            entradas.append(
                (finca, valor, _familia(segmento[cantidad.end() : siguiente]))
            )

    return entradas


def _entradas_sufijo(bloque: str) -> list[tuple[str, Decimal, str]]:
    """'CHANDUY. 100 LITS DE CITRIUS, GOLFO. 300 LITS CITRIUS' — el nombre
    cierra una frase y la cantidad abre la siguiente."""
    frases = [frase.strip() for frase in re.split(r"[.(]", bloque)]
    entradas: list[tuple[str, Decimal, str]] = []

    for indice, frase in enumerate(frases[:-1]):
        siguiente = re.match(
            rf"(\d[\d.,]*)\s*{UNIDADES}\b(.*)", frases[indice + 1], re.I
        )
        if not siguiente:
            continue
        # El nombre es la cola de la frase: lo que va tras la última coma, guion
        # o "Y" ("100 LITS DE CITRIUS, GOLFO" → GOLFO).
        cola = re.split(r"[,;\-]|\sY\s", frase)[-1]
        finca = _nombre_valido(cola)
        valor = _cantidad(siguiente.group(1))
        if not finca or valor is None:
            continue
        entradas.append((finca, valor, _familia(siguiente.group(2))))

    return entradas


def asignar_fincas_desde_info_adicional(texto_pdf: str, orden: OrdenValidada) -> None:
    """Sobreescribe la finca de los ítems que casen con la glosa."""
    bloque = _bloque_glosa(texto_pdf)
    if not bloque:
        return
    entradas = _entradas_prefijo(bloque) or _entradas_sufijo(bloque)
    if not entradas:
        return

    libres = list(range(len(orden.items)))
    pendientes = list(entradas)

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
            libres.remove(indice)
            pendientes.remove(entrada)

    # Un solo ítem y un solo sector: la glosa cuenta envases donde la tabla
    # cuenta kilos ("GOLFO (600 SACOS DE 25KG)" contra 15.000 kg). Sin cantidad
    # que cruzar, pero tampoco hay ambigüedad.
    if len(libres) == 1 and len({finca for finca, _, _ in pendientes}) == 1:
        orden.items[libres[0]].finca = pendientes[0][0]
