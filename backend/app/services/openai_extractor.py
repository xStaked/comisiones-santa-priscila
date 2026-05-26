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
                    "finca": {"type": ["string", "null"]},
                    "confidence": {"type": ["number", "null"]},
                },
                "required": [
                    "producto",
                    "cantidad",
                    "unidad",
                    "precioUnitario",
                    "total",
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
Convierte separadores de miles y decimales a numeros JSON.
Si una finca o cliente aparece en encabezado, aplicalo a los items salvo que el item indique otro valor.
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
