# Design Document: Extractor IA para Ordenes de Compra

> Fecha: 2026-05-26  
> Contexto: Soportar nuevos formatos de ordenes de compra en PDF e imagen  
> Estado: Propuesto

---

## 1. Resumen Ejecutivo

El extractor actual de PDF esta acoplado a una plantilla especifica de DINACUAMAR mediante coordenadas fijas. El PDF `FL OC2199 DINACUAMAR.pdf` confirma que ese enfoque no escala: la orden pertenece a una plantilla FILACAS, usa encabezados distintos, otra distribucion de tabla y fecha en formato numerico. Ademas, el negocio necesita subir ordenes mediante imagen, donde un parser por coordenadas es aun mas fragil.

Este diseno introduce un flujo hibrido: OpenAI extrae una propuesta estructurada desde PDF o imagen, y el backend valida, normaliza y devuelve el mismo contrato que ya consume el frontend. La IA no guarda ordenes en base de datos; solo propone datos para una previsualizacion editable.

### Decisiones clave

| Decision | Valor |
|----------|-------|
| Proveedor inicial | OpenAI API |
| Acoplamiento a proveedor | Bajo, mediante interfaz `ExtractorIA` |
| Contrato frontend | Mantener endpoints y respuesta actuales |
| Guardado automatico | No; siempre hay revision/confirmacion del usuario |
| Parser actual | Mantener como fallback temporal |
| Validacion | Deterministica en backend antes de responder |
| Logs | No guardar PDFs, imagenes ni texto completo extraido |

---

## 2. Objetivos y No Objetivos

### Objetivos

- Soportar multiples plantillas de ordenes sin crear un parser manual por cada cliente.
- Procesar PDFs digitales, PDFs escaneados e imagenes.
- Devolver `fecha`, `numeroOrden`, `proveedor`, `semana` e `items` con el mismo esquema actual.
- Validar cantidades, precios, totales y campos obligatorios antes de entregar la extraccion al frontend.
- Asociar, cuando sea posible, `clienteId`, `fincaId` y `productoId` contra catalogos existentes.
- Permitir cambiar OpenAI por Vertex AI u otro proveedor sin reescribir el flujo de upload.

### No objetivos

- No se guardaran documentos originales en esta fase.
- No se automatizara el alta de clientes, fincas o productos desde IA.
- No se reemplazara la pantalla de previsualizacion manual.
- No se implementara Zero Data Retention como parte obligatoria de esta fase; queda como decision comercial/compliance posterior.

---

## 3. Arquitectura Propuesta

### 3.1 Flujo general

```txt
POST /api/v1/upload/pdf o /api/v1/upload/imagen
        ↓
Validacion basica del archivo
        ↓
Preparacion del contenido
  - PDF digital: texto con PyMuPDF
  - PDF escaneado: imagen renderizada
  - Imagen: bytes originales optimizados
        ↓
ExtractorIA.extraer_orden(entrada)
        ↓
JSON estructurado de IA
        ↓
Validacion deterministica
        ↓
Normalizacion contra catalogos
        ↓
Respuesta compatible con frontend actual
```

### 3.2 Componentes backend

#### `app/services/ai_extractor.py`

Define una interfaz interna:

```python
class ExtractorIA:
    def extraer_orden(self, entrada: EntradaExtraccion) -> ResultadoExtraccion:
        pass
```

Responsabilidades:
- Recibir texto, imagenes o ambos.
- Llamar al proveedor configurado.
- Exigir salida JSON.
- Convertir la respuesta cruda en estructuras Pydantic internas.

#### `app/services/openai_extractor.py`

Implementacion inicial con OpenAI.

Responsabilidades:
- Usar un modelo multimodal compatible con texto e imagen.
- Enviar instrucciones en espanol, con schema estricto.
- Pedir que no invente datos ausentes.
- Pedir `confidence` por campo o por item para auditoria interna.

#### `app/services/order_extraction_validator.py`

Valida datos antes de responder.

Reglas iniciales:
- `fecha` debe parsear como ISO `YYYY-MM-DD`.
- `numeroOrden` no puede estar vacio.
- Cada item debe tener `producto`, `cantidad`, `unidad`, `precioUnitario` y `total`.
- `cantidad`, `precioUnitario` y `total` deben ser positivos.
- `cantidad * precioUnitario` debe aproximarse al `total` con tolerancia configurable.
- Si hay descuento o impuestos visibles, se permite inconsistencia marcada como advertencia, no como fallo duro.
- Items incompletos se devuelven con advertencias si son editables; se rechaza solo si no hay ningun item util.

#### `app/services/order_extraction_normalizer.py`

Asocia texto extraido con catalogos.

Reglas iniciales:
- Cliente: match case-insensitive exacto por `Cliente.nombre`.
- Finca: match case-insensitive exacto por `Finca.nombre`; si tambien hay cliente, se limita a ese cliente.
- Producto: match case-insensitive exacto por `Producto.nombre`.
- En esta fase no hay fuzzy matching automatico que pueda asignar mal datos comerciales. El fuzzy puede proponerse despues como sugerencia visual.

#### `app/services/pdf_extractor.py`

Se mantiene como wrapper publico de compatibilidad.

Responsabilidades nuevas:
- Intentar parser deterministico actual solo si detecta claramente la plantilla antigua.
- Para plantillas nuevas o sin items, delegar al extractor IA.
- Mantener la firma `extraer_orden_de_pdf(contenido, nombre_archivo="", db=None)`.

#### `app/services/ocr_extractor.py`

Se mantiene el endpoint de imagen, pero su implementacion puede delegar al mismo extractor IA. EasyOCR queda como fallback opcional, no como camino principal para formatos nuevos.

---

## 4. Contrato de Datos

### 4.1 Respuesta publica

Los endpoints existentes mantienen su respuesta:

```json
{
  "fecha": "2026-05-14",
  "numeroOrden": "2199",
  "proveedor": "INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA. LTDA.",
  "semana": "",
  "items": [
    {
      "fecha": "2026-05-14",
      "numeroOrden": "2199",
      "finca": "EL MORRO",
      "fincaId": null,
      "clienteId": null,
      "producto": "ECUBACILLUS TH",
      "cantidad": "20.00",
      "unidad": "kg",
      "precioUnitario": "65.0000",
      "total": "1300.0000",
      "comisionistas": []
    }
  ]
}
```

### 4.2 Metadata interna

La IA puede devolver campos adicionales como `cliente`, `advertencias` o `confidence`, pero no se exponen al frontend actual hasta que exista UI para mostrarlos. Por ahora se usan para decidir si la extraccion es aceptable o debe fallar con error claro.

---

## 5. Configuracion y Seguridad

### 5.1 Variables de entorno

Backend:

```txt
AI_EXTRACTION_PROVIDER=openai
OPENAI_API_KEY=<configurado-en-el-entorno>
OPENAI_EXTRACTION_MODEL=<modelo-multimodal-configurado>
AI_EXTRACTION_ENABLED=true
AI_EXTRACTION_TIMEOUT_SECONDS=45
AI_EXTRACTION_MAX_FILE_MB=10
```

`OPENAI_API_KEY` no debe versionarse y debe configurarse por entorno.

### 5.2 Manejo de datos sensibles

- No registrar bytes de archivo, texto completo extraido ni payloads enviados al proveedor.
- Logs permitidos: nombre de archivo, tamano, tipo detectado, cantidad de items, errores resumidos.
- Errores al usuario deben ser operativos, no incluir contenido completo del documento.
- La documentacion de despliegue debe indicar que OpenAI API no usa datos para entrenamiento por defecto, pero puede existir retencion operativa segun configuracion contractual.

---

## 6. Manejo de Errores

### Casos esperados

| Caso | Comportamiento |
|------|----------------|
| Archivo vacio o extension invalida | 400, igual que hoy |
| IA deshabilitada y parser no soporta plantilla | 422 con mensaje de formato no soportado |
| IA no responde o timeout | 422 con mensaje de extraccion no disponible |
| IA devuelve JSON invalido | 422 con mensaje de respuesta invalida |
| Sin items detectados | 422 con mensaje de no se encontraron productos |
| Totales inconsistentes | Responder con advertencia interna o 422 si la diferencia es extrema |

### Principio

El sistema debe fallar cerrado para datos inutiles, pero permitir revision manual cuando la extraccion sea razonable y editable.

---

## 7. Pruebas

### Unitarias backend

- Parser/flujo para PDF FILACAS usando fixture controlado.
- Validacion de fecha `14/05/2026` a `2026-05-14`.
- Validacion de cantidad, precio y total.
- Normalizacion exacta de cliente/finca/producto cuando existen en DB.
- Rechazo de respuesta IA sin items.
- Rechazo de numeros negativos o no parseables.

### Integracion backend

- `POST /api/v1/upload/pdf` conserva el contrato actual.
- `POST /api/v1/upload/imagen` conserva el contrato actual.
- Cuando no hay API key y el parser deterministico falla, el error es claro.

### Manual/UAT

- Subir `FL OC2199 DINACUAMAR.pdf`.
- Confirmar extraccion:
  - Fecha: `2026-05-14`
  - Numero: `2199`
  - Proveedor: `INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA. LTDA.`
  - Finca: `EL MORRO`
  - Producto: `ECUBACILLUS TH`
  - Cantidad: `20.00`
  - Unidad: `kg`
  - Precio unitario: `65.0000`
  - Total: `1300.0000`
- Subir una imagen real de orden y confirmar que aparece una previsualizacion editable.

---

## 8. Plan de Implementacion de Alto Nivel

1. Crear modelos Pydantic internos para entrada/salida de extraccion.
2. Crear interfaz `ExtractorIA` y proveedor OpenAI.
3. Agregar preparacion de PDF/imagen para texto o vision.
4. Agregar validacion deterministica.
5. Agregar normalizacion contra catalogos.
6. Integrar en `upload/pdf` y `upload/imagen` sin cambiar contrato frontend.
7. Mantener parser actual como fallback para plantilla vieja.
8. Agregar tests unitarios e integracion.
9. Documentar variables de entorno y consideraciones de privacidad.

---

## 9. Riesgos y Mitigaciones

| Riesgo | Mitigacion |
|--------|------------|
| IA inventa campos | Prompt estricto, schema JSON, validacion y revision manual |
| Costos por archivo grande | Limite de tamano y compresion/render controlado |
| Latencia alta | Timeout configurable y mensajes claros |
| Compliance rechaza proveedor externo | Interfaz permite migrar a Vertex AI/local |
| Match incorrecto de catalogos | Solo exact match automatico en fase inicial |
| Regresion del formato antiguo | Mantener parser actual y tests de compatibilidad |

---

## 10. Criterios de Aceptacion

- El backend extrae correctamente el PDF FILACAS de ejemplo.
- El backend puede procesar al menos una imagen de orden con IA.
- Los endpoints actuales no requieren cambios en el frontend.
- No se guardan documentos completos ni payloads sensibles en logs.
- Sin `OPENAI_API_KEY`, el sistema falla con mensaje claro y no rompe el servidor.
- Las pruebas cubren validacion, normalizacion y errores principales.
