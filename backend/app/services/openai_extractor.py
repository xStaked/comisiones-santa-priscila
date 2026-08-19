from __future__ import annotations

import json

from openai import OpenAI, OpenAIError
from pydantic import ValidationError

from app.services.ai_extractor import ErrorExtraccionIA
from app.services.order_extraction_models import EntradaExtraccion, OrdenExtraidaIA


ORDEN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "fecha": {"type": "string"},
        "numeroOrden": {"type": "string"},
        "proveedor": {"type": "string"},
        "cliente": {"type": "string"},
        "finca": {"type": "string"},
        "semana": {"type": "string"},
        "confidence": {"type": ["number", "null"]},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "producto": {"type": "string"},
                    "cantidad": {"type": "number"},
                    "unidad": {"type": "string"},
                    "precioUnitario": {"type": "number"},
                    "total": {"type": "number"},
                    "cantidadTexto": {"type": "string"},
                    "precioUnitarioTexto": {"type": "string"},
                    "totalTexto": {"type": "string"},
                    "finca": {"type": ["string", "null"]},
                    "confidence": {"type": ["number", "null"]},
                },
                "required": [
                    "producto",
                    "cantidad",
                    "unidad",
                    "precioUnitario",
                    "total",
                    "cantidadTexto",
                    "precioUnitarioTexto",
                    "totalTexto",
                    "finca",
                    "confidence",
                ],
            },
        },
    },
    "required": [
        "fecha",
        "numeroOrden",
        "proveedor",
        "cliente",
        "finca",
        "semana",
        "confidence",
        "items",
    ],
}


PROMPT_EXTRACCION = """
Extrae una orden de compra acuicola desde el texto o imagen proporcionada.
Devuelve solo datos visibles en el documento. No inventes campos ausentes.
Usa formato de fecha YYYY-MM-DD cuando sea posible.
Los campos "cantidadTexto", "precioUnitarioTexto" y "totalTexto" son la
transcripcion LITERAL del numero como aparece impreso, con sus puntos y comas y
sin convertir nada ("22.500,00", "1,180000"). No los normalices: de ahi sale el
valor real. Para los campos numericos: el separador decimal es el ULTIMO que
aparece en el numero y los anteriores son de miles, sea cual sea el formato del
documento ("22.500,00" son veintidos mil quinientos, no 22,5; "1,234.56" son mil
doscientos treinta y cuatro).
Si una finca o cliente aparece en encabezado, aplicalo a los items salvo que el item indique otro valor.

Roles: "proveedor" es quien EMITE el documento (el RUC y la razon social del
encabezado, arriba de todo) y "cliente" es quien lo RECIBE (el comprador: el
bloque con Nombres/Razon Social + RUC del adquirente, en las facturas del SRI).
El emisor puede ser una persona natural, no una empresa; da igual, sigue siendo
el proveedor. Nunca pongas el emisor como cliente.

El bloque "INFORMACION ADICIONAL" no decide el proveedor: ahi el emisor copia
datos internos del comprador ("vendedor : Juan Perez", "RUC Proveedor: ...")
que son el ejecutivo o el codigo del comprador, no la razon social de quien
emite. El proveedor sale siempre del encabezado, nunca de esos rotulos.

Campo "finca" (el sector del cliente): las facturas no traen columna de finca,
el sector va escrito dentro de la descripcion del item o en la glosa
("O/C # 95933 - SEMANA 24 SECTOR GOLFO", "CHANDUY. 100 LITS DE CITRIUS"). Sacalo
de ahi y ponelo en el "finca" del item, con el nombre solo: sin la palabra
SECTOR, sin la semana, sin el numero de orden, sin cantidades ni envases. Si la
glosa nombra varios sectores, cada item lleva el suyo.

Campo "unidad": nombra un envase (tachos, sacos, canecas) SOLO si el documento
dice explicitamente que la cantidad esta contada en esos envases. Las facturas no
traen columna de unidad: su cantidad esta en kilos (o litros para los liquidos),
asi que ahi devuelve "kg" (o "litros"), nunca el envase en que se presenta el
producto. De esto depende el calculo de comisiones: un envase mal puesto la
multiplica por 10 o por 25.
"""


class OpenAIOrdenExtractor:
    def __init__(self, api_key: str, model: str) -> None:
        self.client = OpenAI(api_key=api_key)
        self.model = model

    def extraer_orden(self, entrada: EntradaExtraccion) -> OrdenExtraidaIA:
        contenido = [{"type": "input_text", "text": PROMPT_EXTRACCION}]
        if entrada.texto:
            contenido.append({"type": "input_text", "text": entrada.texto[:30000]})
        for imagen in entrada.imagenes_base64:
            contenido.append(
                {
                    "type": "input_image",
                    "image_url": f"data:image/png;base64,{imagen}",
                    "detail": "high",
                }
            )

        try:
            response = self.client.responses.create(
                model=self.model,
                input=[{"role": "user", "content": contenido}],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "orden_compra_extraida",
                        "schema": ORDEN_SCHEMA,
                        "strict": True,
                    }
                },
            )
            output_text = getattr(response, "output_text", None)
            if not output_text:
                raise ErrorExtraccionIA("La respuesta IA no contiene datos extraidos")
            data = json.loads(output_text)
            return OrdenExtraidaIA.model_validate(data)
        except (OpenAIError, json.JSONDecodeError, ValidationError) as exc:
            raise ErrorExtraccionIA("No se pudo extraer la orden con IA") from exc
