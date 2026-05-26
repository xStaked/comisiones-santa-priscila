# Extractor IA para Ordenes de Compra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an OpenAI-backed extraction path for PDF and image purchase orders while preserving the current upload API contract.

**Architecture:** Add focused backend services for extraction schemas, validation, catalog normalization, and provider dispatch. Keep current deterministic PDF extraction as a compatibility path, then route unsupported PDFs and all image uploads through an injectable AI extractor so tests can run without network access.

**Tech Stack:** FastAPI, Pydantic 2, SQLAlchemy, PyMuPDF, OpenAI Python SDK, pytest, httpx TestClient.

---

## File Structure

- Create: `backend/app/services/order_extraction_models.py`
  - Pydantic internal models for AI input/output and normalized upload response.
- Create: `backend/app/services/order_extraction_validator.py`
  - Deterministic validation for dates, required fields, decimals, and total consistency.
- Create: `backend/app/services/order_extraction_normalizer.py`
  - Exact catalog matching against `Cliente`, `Finca`, and `Producto`.
- Create: `backend/app/services/ai_extractor.py`
  - Provider interface, provider factory, disabled-provider behavior, and shared prompt/schema constants.
- Create: `backend/app/services/openai_extractor.py`
  - OpenAI Responses API implementation using text and image input.
- Create: `backend/tests/test_order_extraction_validator.py`
  - Unit tests for validation and decimal/date normalization.
- Create: `backend/tests/test_order_extraction_normalizer.py`
  - Unit tests for exact catalog matching.
- Create: `backend/tests/test_ai_upload.py`
  - Endpoint-level tests with a fake AI extractor.
- Modify: `backend/app/config.py`
  - Add AI extraction environment settings.
- Modify: `backend/requirements.txt`
  - Add pinned `openai==2.38.0`.
- Modify: `backend/app/services/pdf_extractor.py`
  - Keep current parser for known template and add fallback to AI extraction.
- Modify: `backend/app/services/ocr_extractor.py`
  - Route image extraction through AI extraction.
- Modify: `backend/app/routers/upload.py`
  - Preserve response model; pass DB/session and file metadata into services.
- Modify: `backend/.env.example`
  - Document AI extraction settings.

Official references used for implementation decisions:
- OpenAI Responses API supports text/image inputs and JSON outputs: `https://platform.openai.com/docs/api-reference/responses`
- OpenAI vision input supports base64 data URLs: `https://platform.openai.com/docs/guides/vision?lang=python`
- OpenAI Structured Outputs supports JSON Schema: `https://platform.openai.com/docs/guides/structured-outputs`
- Current PyPI release checked for pinning: `https://pypi.org/project/openai/`

---

### Task 1: Configuration and Dependency

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/requirements.txt`
- Modify: `backend/.env.example`

- [ ] **Step 1: Write the failing config test**

Create `backend/tests/test_ai_config.py`:

```python
from app.config import Settings


def test_ai_extraction_defaults_are_safe():
    settings = Settings()

    assert settings.AI_EXTRACTION_PROVIDER == "openai"
    assert settings.AI_EXTRACTION_ENABLED is False
    assert settings.OPENAI_EXTRACTION_MODEL == "gpt-4.1-mini"
    assert settings.AI_EXTRACTION_TIMEOUT_SECONDS == 45
    assert settings.AI_EXTRACTION_MAX_FILE_MB == 10
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ai_config.py -q
```

Expected: fail with missing `AI_EXTRACTION_PROVIDER` or related attributes.

- [ ] **Step 3: Add settings fields**

In `backend/app/config.py`, add these fields to `Settings` below `RATE_LIMIT_PER_MINUTE`:

```python
    AI_EXTRACTION_PROVIDER: str = "openai"
    AI_EXTRACTION_ENABLED: bool = False
    OPENAI_API_KEY: str = ""
    OPENAI_EXTRACTION_MODEL: str = "gpt-4.1-mini"
    AI_EXTRACTION_TIMEOUT_SECONDS: int = 45
    AI_EXTRACTION_MAX_FILE_MB: int = 10
```

Add validators:

```python
    @field_validator("AI_EXTRACTION_PROVIDER")
    @classmethod
    def validate_ai_provider(cls, v: str) -> str:
        if v not in ("openai", "disabled"):
            raise ValueError('AI_EXTRACTION_PROVIDER debe ser "openai" o "disabled"')
        return v

    @field_validator("AI_EXTRACTION_TIMEOUT_SECONDS", "AI_EXTRACTION_MAX_FILE_MB")
    @classmethod
    def validate_positive_ai_limits(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Los limites de extraccion IA deben ser mayores a cero")
        return v
```

- [ ] **Step 4: Pin OpenAI dependency**

Append to `backend/requirements.txt`:

```txt
openai==2.38.0
```

- [ ] **Step 5: Document env vars**

Append to `backend/.env.example`:

```txt
# Extraccion IA de ordenes
AI_EXTRACTION_PROVIDER=openai
AI_EXTRACTION_ENABLED=false
OPENAI_API_KEY=
OPENAI_EXTRACTION_MODEL=gpt-4.1-mini
AI_EXTRACTION_TIMEOUT_SECONDS=45
AI_EXTRACTION_MAX_FILE_MB=10
```

- [ ] **Step 6: Verify config test passes**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ai_config.py -q
```

Expected: `1 passed`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/config.py backend/requirements.txt backend/.env.example backend/tests/test_ai_config.py
git commit -m "feat: add ai extraction configuration"
```

---

### Task 2: Internal Extraction Models and Validator

**Files:**
- Create: `backend/app/services/order_extraction_models.py`
- Create: `backend/app/services/order_extraction_validator.py`
- Create: `backend/tests/test_order_extraction_validator.py`

- [ ] **Step 1: Write failing validator tests**

Create `backend/tests/test_order_extraction_validator.py`:

```python
from decimal import Decimal

import pytest

from app.services.order_extraction_models import OrdenExtraidaIA, OrdenItemExtraidoIA
from app.services.order_extraction_validator import validar_orden_extraida


def test_valida_orden_filacas_basica():
    orden = OrdenExtraidaIA(
        fecha="14/05/2026",
        numeroOrden="2199",
        proveedor="INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA. LTDA.",
        cliente="FILACAS SA",
        finca="EL MORRO",
        semana="",
        items=[
            OrdenItemExtraidoIA(
                producto="ECUBACILLUS TH",
                cantidad=Decimal("20.00"),
                unidad="KILOGRAMOS",
                precioUnitario=Decimal("65.0000"),
                total=Decimal("1300.0000"),
            )
        ],
    )

    resultado = validar_orden_extraida(orden)

    assert resultado.fecha.isoformat() == "2026-05-14"
    assert resultado.numeroOrden == "2199"
    assert resultado.items[0].unidad == "kg"
    assert resultado.items[0].total == Decimal("1300.0000")


def test_rechaza_orden_sin_items():
    orden = OrdenExtraidaIA(
        fecha="2026-05-14",
        numeroOrden="2199",
        proveedor="Proveedor",
        cliente="Cliente",
        finca="Finca",
        semana="",
        items=[],
    )

    with pytest.raises(ValueError, match="No se encontraron productos"):
        validar_orden_extraida(orden)


def test_rechaza_total_inconsistente_extremo():
    orden = OrdenExtraidaIA(
        fecha="2026-05-14",
        numeroOrden="2199",
        proveedor="Proveedor",
        cliente="Cliente",
        finca="Finca",
        semana="",
        items=[
            OrdenItemExtraidoIA(
                producto="Producto",
                cantidad=Decimal("20.00"),
                unidad="kg",
                precioUnitario=Decimal("65.00"),
                total=Decimal("9999.00"),
            )
        ],
    )

    with pytest.raises(ValueError, match="total inconsistente"):
        validar_orden_extraida(orden)
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest tests/test_order_extraction_validator.py -q
```

Expected: fail because modules do not exist.

- [ ] **Step 3: Create internal models**

Create `backend/app/services/order_extraction_models.py`:

```python
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class EntradaExtraccion(BaseModel):
    nombre_archivo: str
    content_type: str
    texto: str = ""
    imagenes_base64: list[str] = Field(default_factory=list)


class OrdenItemExtraidoIA(BaseModel):
    producto: str
    cantidad: Decimal
    unidad: str
    precioUnitario: Decimal
    total: Decimal
    finca: Optional[str] = None
    confidence: Optional[float] = None


class OrdenExtraidaIA(BaseModel):
    fecha: str
    numeroOrden: str
    proveedor: str = ""
    cliente: str = ""
    finca: str = ""
    semana: str = ""
    items: list[OrdenItemExtraidoIA]
    confidence: Optional[float] = None


class OrdenItemValidado(BaseModel):
    fecha: date
    numeroOrden: str
    finca: str
    producto: str
    cantidad: Decimal
    unidad: str
    precioUnitario: Decimal
    total: Decimal
    comisionistas: list = Field(default_factory=list)
    clienteTexto: str = ""
    fincaId: Optional[str] = None
    clienteId: Optional[str] = None
    productoId: Optional[str] = None


class OrdenValidada(BaseModel):
    fecha: date
    numeroOrden: str
    proveedor: str
    cliente: str = ""
    finca: str = ""
    semana: str
    items: list[OrdenItemValidado]
```

- [ ] **Step 4: Create validator**

Create `backend/app/services/order_extraction_validator.py`:

```python
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.services.order_extraction_models import (
    OrdenExtraidaIA,
    OrdenItemValidado,
    OrdenValidada,
)

UNIDADES_NORMALIZADAS = {
    "kg": "kg",
    "kilo": "kg",
    "kilos": "kg",
    "kilogramo": "kg",
    "kilogramos": "kg",
    "l": "litros",
    "lt": "litros",
    "lts": "litros",
    "litro": "litros",
    "litros": "litros",
    "unidad": "unidades",
    "unidades": "unidades",
    "caja": "cajas",
    "cajas": "cajas",
    "tacho": "tachos",
    "tachos": "tachos",
    "saco": "sacos",
    "sacos": "sacos",
}


def _parsear_fecha(valor: str) -> date:
    limpio = valor.strip()
    for formato in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(limpio, formato).date()
        except ValueError:
            continue
    raise ValueError("La fecha extraida no tiene un formato valido")


def _decimal_positivo(valor: Decimal, campo: str) -> Decimal:
    try:
        numero = Decimal(str(valor))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{campo} no es un numero valido") from exc
    if numero <= 0:
        raise ValueError(f"{campo} debe ser mayor a cero")
    return numero


def _normalizar_unidad(valor: str) -> str:
    unidad = valor.strip().lower()
    return UNIDADES_NORMALIZADAS.get(unidad, unidad or "unidades")


def validar_orden_extraida(orden: OrdenExtraidaIA) -> OrdenValidada:
    fecha = _parsear_fecha(orden.fecha)
    numero_orden = orden.numeroOrden.strip()
    if not numero_orden:
        raise ValueError("El numero de orden es obligatorio")
    if not orden.items:
        raise ValueError("No se encontraron productos en la orden")

    items: list[OrdenItemValidado] = []
    for item in orden.items:
        producto = item.producto.strip()
        if not producto:
            raise ValueError("Cada item debe tener producto")

        cantidad = _decimal_positivo(item.cantidad, "cantidad")
        precio_unitario = _decimal_positivo(item.precioUnitario, "precioUnitario")
        total = _decimal_positivo(item.total, "total")

        total_calculado = cantidad * precio_unitario
        tolerancia = max(Decimal("0.05"), total * Decimal("0.02"))
        if abs(total_calculado - total) > tolerancia:
            raise ValueError("El total inconsistente excede la tolerancia permitida")

        finca = (item.finca or orden.finca or "-").strip() or "-"
        items.append(
            OrdenItemValidado(
                fecha=fecha,
                numeroOrden=numero_orden,
                finca=finca,
                producto=producto,
                cantidad=cantidad,
                unidad=_normalizar_unidad(item.unidad),
                precioUnitario=precio_unitario,
                total=total,
                clienteTexto=orden.cliente.strip(),
            )
        )

    return OrdenValidada(
        fecha=fecha,
        numeroOrden=numero_orden,
        proveedor=orden.proveedor.strip(),
        cliente=orden.cliente.strip(),
        finca=orden.finca.strip(),
        semana=orden.semana.strip(),
        items=items,
    )
```

- [ ] **Step 5: Run validator tests**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest tests/test_order_extraction_validator.py -q
```

Expected: `3 passed`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/order_extraction_models.py backend/app/services/order_extraction_validator.py backend/tests/test_order_extraction_validator.py
git commit -m "feat: validate extracted order data"
```

---

### Task 3: Catalog Normalization

**Files:**
- Create: `backend/app/services/order_extraction_normalizer.py`
- Create: `backend/tests/test_order_extraction_normalizer.py`

- [ ] **Step 1: Write failing normalizer tests**

Create `backend/tests/test_order_extraction_normalizer.py`:

```python
from datetime import date
from decimal import Decimal

from app.models.cliente import Cliente, Finca
from app.models.producto import Producto
from app.services.order_extraction_models import OrdenItemValidado, OrdenValidada
from app.services.order_extraction_normalizer import normalizar_orden_extraida


def test_normaliza_cliente_finca_producto_por_match_exacto(db_session):
    cliente = Cliente(nombre="FILACAS SA", tipo="grupo", retencion_porcentaje=Decimal("1.75"))
    db_session.add(cliente)
    db_session.commit()
    db_session.refresh(cliente)

    finca = Finca(nombre="EL MORRO", cliente_id=cliente.id)
    producto = Producto(nombre="ECUBACILLUS TH", unidad_comision="kg")
    db_session.add_all([finca, producto])
    db_session.commit()
    db_session.refresh(finca)
    db_session.refresh(producto)

    orden = OrdenValidada(
        fecha=date(2026, 5, 14),
        numeroOrden="2199",
        proveedor="DINACUAMAR",
        cliente="filacas sa",
        finca="el morro",
        semana="",
        items=[
            OrdenItemValidado(
                fecha=date(2026, 5, 14),
                numeroOrden="2199",
                finca="el morro",
                producto="ecubacillus th",
                cantidad=Decimal("20"),
                unidad="kg",
                precioUnitario=Decimal("65"),
                total=Decimal("1300"),
                clienteTexto="filacas sa",
            )
        ],
    )

    normalizada = normalizar_orden_extraida(db_session, orden)

    item = normalizada.items[0]
    assert item.clienteId == str(cliente.id)
    assert item.fincaId == str(finca.id)
    assert item.productoId == str(producto.id)
    assert item.finca == "EL MORRO"
    assert item.producto == "ECUBACILLUS TH"


def test_no_inventa_ids_si_no_hay_match(db_session):
    orden = OrdenValidada(
        fecha=date(2026, 5, 14),
        numeroOrden="2199",
        proveedor="DINACUAMAR",
        cliente="CLIENTE NUEVO",
        finca="FINCA NUEVA",
        semana="",
        items=[
            OrdenItemValidado(
                fecha=date(2026, 5, 14),
                numeroOrden="2199",
                finca="FINCA NUEVA",
                producto="PRODUCTO NUEVO",
                cantidad=Decimal("1"),
                unidad="kg",
                precioUnitario=Decimal("1"),
                total=Decimal("1"),
            )
        ],
    )

    normalizada = normalizar_orden_extraida(db_session, orden)

    item = normalizada.items[0]
    assert item.clienteId is None
    assert item.fincaId is None
    assert item.productoId is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest tests/test_order_extraction_normalizer.py -q
```

Expected: fail because `order_extraction_normalizer.py` does not exist.

- [ ] **Step 3: Implement exact-match normalizer**

Create `backend/app/services/order_extraction_normalizer.py`:

```python
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.cliente import Cliente, Finca
from app.models.producto import Producto
from app.services.order_extraction_models import OrdenValidada


def _limpiar(valor: str) -> str:
    return " ".join((valor or "").strip().split())


def _buscar_cliente(db: Session, nombre: str) -> Cliente | None:
    limpio = _limpiar(nombre)
    if not limpio:
        return None
    return db.query(Cliente).filter(func.lower(Cliente.nombre) == limpio.lower()).first()


def _buscar_finca(db: Session, nombre: str, cliente: Cliente | None) -> Finca | None:
    limpio = _limpiar(nombre)
    if not limpio or limpio == "-":
        return None
    query = db.query(Finca).filter(func.lower(Finca.nombre) == limpio.lower())
    if cliente:
        query = query.filter(Finca.cliente_id == cliente.id)
    return query.first()


def _buscar_producto(db: Session, nombre: str) -> Producto | None:
    limpio = _limpiar(nombre)
    if not limpio:
        return None
    return db.query(Producto).filter(func.lower(Producto.nombre) == limpio.lower()).first()


def normalizar_orden_extraida(db: Session | None, orden: OrdenValidada) -> OrdenValidada:
    if db is None:
        return orden

    cliente = _buscar_cliente(db, orden.cliente)
    for item in orden.items:
        item_cliente = cliente or _buscar_cliente(db, item.clienteTexto)
        finca = _buscar_finca(db, item.finca or orden.finca, item_cliente)
        producto = _buscar_producto(db, item.producto)

        if item_cliente:
            item.clienteId = str(item_cliente.id)
        if finca:
            item.fincaId = str(finca.id)
            item.finca = finca.nombre
            if not item.clienteId:
                item.clienteId = str(finca.cliente_id)
        if producto:
            item.productoId = str(producto.id)
            item.producto = producto.nombre

    return orden
```

- [ ] **Step 4: Run normalizer tests**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest tests/test_order_extraction_normalizer.py -q
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/order_extraction_normalizer.py backend/tests/test_order_extraction_normalizer.py
git commit -m "feat: normalize extracted orders against catalogs"
```

---

### Task 4: AI Extractor Interface and OpenAI Provider

**Files:**
- Create: `backend/app/services/ai_extractor.py`
- Create: `backend/app/services/openai_extractor.py`
- Create: `backend/tests/test_ai_extractor.py`

- [ ] **Step 1: Write failing provider tests**

Create `backend/tests/test_ai_extractor.py`:

```python
import pytest

from app.services.ai_extractor import ExtraccionIADeshabilitada, obtener_extractor_ia
from app.services.order_extraction_models import EntradaExtraccion, OrdenExtraidaIA


def test_disabled_provider_raises_clear_error():
    extractor = obtener_extractor_ia(provider="disabled", api_key="", model="gpt-4.1-mini")

    with pytest.raises(ExtraccionIADeshabilitada, match="Extraccion IA deshabilitada"):
        extractor.extraer_orden(EntradaExtraccion(nombre_archivo="x.pdf", content_type="application/pdf"))


def test_openai_provider_requires_api_key():
    with pytest.raises(ExtraccionIADeshabilitada, match="OPENAI_API_KEY"):
        obtener_extractor_ia(provider="openai", api_key="", model="gpt-4.1-mini")


def test_fake_extractor_contract():
    class FakeExtractor:
        def extraer_orden(self, entrada):
            return OrdenExtraidaIA(
                fecha="2026-05-14",
                numeroOrden="2199",
                proveedor="Proveedor",
                cliente="Cliente",
                finca="Finca",
                semana="",
                items=[],
            )

    resultado = FakeExtractor().extraer_orden(
        EntradaExtraccion(nombre_archivo="x.pdf", content_type="application/pdf")
    )

    assert resultado.numeroOrden == "2199"
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ai_extractor.py -q
```

Expected: fail because `ai_extractor.py` does not exist.

- [ ] **Step 3: Implement interface and factory**

Create `backend/app/services/ai_extractor.py`:

```python
from __future__ import annotations

from typing import Protocol

from app.services.order_extraction_models import EntradaExtraccion, OrdenExtraidaIA


class ExtraccionIADeshabilitada(RuntimeError):
    pass


class ExtractorIA(Protocol):
    def extraer_orden(self, entrada: EntradaExtraccion) -> OrdenExtraidaIA:
        pass


class ExtractorDeshabilitado:
    def extraer_orden(self, entrada: EntradaExtraccion) -> OrdenExtraidaIA:
        raise ExtraccionIADeshabilitada("Extraccion IA deshabilitada")


def obtener_extractor_ia(provider: str, api_key: str, model: str) -> ExtractorIA:
    if provider == "disabled":
        return ExtractorDeshabilitado()
    if provider == "openai":
        if not api_key:
            raise ExtraccionIADeshabilitada("OPENAI_API_KEY no esta configurado")
        from app.services.openai_extractor import OpenAIOrdenExtractor

        return OpenAIOrdenExtractor(api_key=api_key, model=model)
    raise ExtraccionIADeshabilitada(f"Proveedor IA no soportado: {provider}")
```

- [ ] **Step 4: Implement OpenAI provider skeleton**

Create `backend/app/services/openai_extractor.py`:

```python
from __future__ import annotations

import json

from openai import OpenAI

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
        data = json.loads(response.output_text)
        return OrdenExtraidaIA.model_validate(data)
```

- [ ] **Step 5: Run provider tests**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ai_extractor.py -q
```

Expected: `3 passed`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ai_extractor.py backend/app/services/openai_extractor.py backend/tests/test_ai_extractor.py
git commit -m "feat: add openai order extraction provider"
```

---

### Task 5: PDF and Image Service Integration

**Files:**
- Modify: `backend/app/services/pdf_extractor.py`
- Modify: `backend/app/services/ocr_extractor.py`
- Create: `backend/tests/test_ai_upload.py`

- [ ] **Step 1: Write failing service-level tests with fake extractor**

Create `backend/tests/test_ai_upload.py`:

```python
from decimal import Decimal

import pytest

from app.services.order_extraction_models import OrdenExtraidaIA, OrdenItemExtraidoIA
from app.services.pdf_extractor import extraer_orden_de_pdf


class FakeExtractor:
    def extraer_orden(self, entrada):
        assert entrada.nombre_archivo == "FL OC2199 DINACUAMAR.pdf"
        assert entrada.texto
        return OrdenExtraidaIA(
            fecha="14/05/2026",
            numeroOrden="2199",
            proveedor="INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA. LTDA.",
            cliente="FILACAS SA",
            finca="EL MORRO",
            semana="",
            items=[
                OrdenItemExtraidoIA(
                    producto="ECUBACILLUS TH",
                    cantidad=Decimal("20.00"),
                    unidad="KILOGRAMOS",
                    precioUnitario=Decimal("65.0000"),
                    total=Decimal("1300.0000"),
                )
            ],
        )


def test_pdf_filacas_delega_a_ia_y_conserva_contrato(monkeypatch):
    monkeypatch.setattr(
        "app.services.pdf_extractor.obtener_extractor_configurado",
        lambda: FakeExtractor(),
    )

    contenido = b"%PDF-1.4\ntexto simulado"
    resultado = extraer_orden_de_pdf(
        contenido,
        nombre_archivo="FL OC2199 DINACUAMAR.pdf",
        db=None,
        texto_override="FL - FILACAS SA ORDEN DE COMPRA N° 2199 Fecha de Emisión: 14/05/2026",
    )

    assert resultado["fecha"].isoformat() == "2026-05-14"
    assert resultado["numeroOrden"] == "2199"
    assert resultado["items"][0]["producto"] == "ECUBACILLUS TH"
    assert resultado["items"][0]["unidad"] == "kg"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ai_upload.py -q
```

Expected: fail because `extraer_orden_de_pdf` does not accept `texto_override` and AI wiring does not exist.

- [ ] **Step 3: Add shared response conversion and extractor factory to `pdf_extractor.py`**

In `backend/app/services/pdf_extractor.py`, add imports:

```python
from app.config import settings
from app.services.ai_extractor import obtener_extractor_ia
from app.services.order_extraction_models import EntradaExtraccion, OrdenValidada
from app.services.order_extraction_normalizer import normalizar_orden_extraida
from app.services.order_extraction_validator import validar_orden_extraida
```

Add helper functions near the top:

```python
def obtener_extractor_configurado():
    provider = "openai" if settings.AI_EXTRACTION_ENABLED else "disabled"
    return obtener_extractor_ia(
        provider=provider,
        api_key=settings.OPENAI_API_KEY,
        model=settings.OPENAI_EXTRACTION_MODEL,
    )


def _orden_validada_a_respuesta(orden: OrdenValidada) -> dict[str, Any]:
    return {
        "fecha": orden.fecha,
        "numeroOrden": orden.numeroOrden,
        "proveedor": orden.proveedor,
        "semana": orden.semana,
        "items": [
            {
                "fecha": item.fecha,
                "numeroOrden": item.numeroOrden,
                "finca": item.finca,
                "fincaId": item.fincaId,
                "clienteId": item.clienteId,
                "productoId": item.productoId,
                "producto": item.producto,
                "cantidad": item.cantidad,
                "unidad": item.unidad,
                "precioUnitario": item.precioUnitario,
                "total": item.total,
                "comisionistas": [],
            }
            for item in orden.items
        ],
    }


def _extraer_con_ia(
    contenido: bytes,
    nombre_archivo: str,
    db=None,
    texto_override: str | None = None,
) -> dict[str, Any]:
    texto = texto_override if texto_override is not None else _extraer_texto_pdf(contenido)
    extractor = obtener_extractor_configurado()
    orden_ia = extractor.extraer_orden(
        EntradaExtraccion(
            nombre_archivo=nombre_archivo,
            content_type="application/pdf",
            texto=texto,
        )
    )
    orden_validada = validar_orden_extraida(orden_ia)
    orden_normalizada = normalizar_orden_extraida(db, orden_validada)
    return _orden_validada_a_respuesta(orden_normalizada)


def _extraer_texto_pdf(contenido: bytes) -> str:
    doc = fitz.open(stream=contenido, filetype="pdf")
    return "\n".join(page.get_text("text") for page in doc)
```

- [ ] **Step 4: Update PDF function signature and fallback**

Change function signature:

```python
def extraer_orden_de_pdf(
    contenido: bytes,
    nombre_archivo: str = "",
    db=None,
    texto_override: str | None = None,
) -> dict[str, Any]:
```

At the beginning of the function, before existing coordinate parsing, add:

```python
    texto_pdf = texto_override if texto_override is not None else _extraer_texto_pdf(contenido)
    if "FILACAS" in texto_pdf.upper() or "FECHA DE EMISIÓN" in texto_pdf.upper():
        return _extraer_con_ia(
            contenido,
            nombre_archivo=nombre_archivo,
            db=db,
            texto_override=texto_pdf,
        )
```

Leave the existing deterministic parser body in place after this check.

- [ ] **Step 5: Route images through AI in `ocr_extractor.py`**

At the top of `backend/app/services/ocr_extractor.py`, add:

```python
import base64
```

Add imports:

```python
from app.services.order_extraction_models import EntradaExtraccion
from app.services.order_extraction_normalizer import normalizar_orden_extraida
from app.services.order_extraction_validator import validar_orden_extraida
from app.services.pdf_extractor import _orden_validada_a_respuesta, obtener_extractor_configurado
```

At the beginning of `extraer_orden_de_imagen`, before EasyOCR logic, add:

```python
    extractor = obtener_extractor_configurado()
    imagen_base64 = base64.b64encode(contenido).decode("ascii")
    orden_ia = extractor.extraer_orden(
        EntradaExtraccion(
            nombre_archivo=nombre_archivo,
            content_type="image",
            imagenes_base64=[imagen_base64],
        )
    )
    orden_validada = validar_orden_extraida(orden_ia)
    orden_normalizada = normalizar_orden_extraida(None, orden_validada)
    return _orden_validada_a_respuesta(orden_normalizada)
```

This keeps the image endpoint behavior simple for the first IA-backed version.

- [ ] **Step 6: Run service tests**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ai_upload.py -q
```

Expected: `1 passed`.

- [ ] **Step 7: Run existing order tests**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ordenes.py -q
```

Expected: existing order CRUD tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/pdf_extractor.py backend/app/services/ocr_extractor.py backend/tests/test_ai_upload.py
git commit -m "feat: route new order formats through ai extraction"
```

---

### Task 6: Endpoint Integration and Error Behavior

**Files:**
- Modify: `backend/app/routers/upload.py`
- Modify: `backend/tests/test_ai_upload.py`

- [ ] **Step 1: Add endpoint tests for disabled AI error**

Append to `backend/tests/test_ai_upload.py`:

```python
def test_upload_pdf_returns_422_when_ai_disabled_for_new_template(authenticated_client, monkeypatch):
    monkeypatch.setattr("app.config.settings.AI_EXTRACTION_ENABLED", False)

    response = authenticated_client.post(
        "/api/v1/upload/pdf",
        files={
            "file": (
                "FL OC2199 DINACUAMAR.pdf",
                b"%PDF-1.4\ncontenido simulado",
                "application/pdf",
            )
        },
    )

    assert response.status_code == 422
    assert "Error al procesar el PDF" in response.json()["detail"]
```

- [ ] **Step 2: Run endpoint test**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ai_upload.py::test_upload_pdf_returns_422_when_ai_disabled_for_new_template -q
```

Expected: may fail with a raw PyMuPDF error because the simulated bytes are not a real PDF.

- [ ] **Step 3: Make upload errors clearer without leaking content**

In `backend/app/routers/upload.py`, change exception detail construction for PDF:

```python
        mensaje = str(exc)
        if len(mensaje) > 160:
            mensaje = mensaje[:147] + " [recortado]"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error al procesar el PDF: {mensaje}",
        ) from exc
```

Do the same for image errors:

```python
        mensaje = str(exc)
        if len(mensaje) > 160:
            mensaje = mensaje[:147] + " [recortado]"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error al procesar la imagen: {mensaje}",
        ) from exc
```

- [ ] **Step 4: Use a real fixture path when available**

If `FL OC2199 DINACUAMAR.pdf` is present in the repository root during implementation, update the endpoint test to read it:

```python
from pathlib import Path


def test_upload_pdf_returns_422_when_ai_disabled_for_new_template(authenticated_client, monkeypatch):
    monkeypatch.setattr("app.config.settings.AI_EXTRACTION_ENABLED", False)
    pdf_path = Path(__file__).resolve().parents[2] / "FL OC2199 DINACUAMAR.pdf"
    contenido = pdf_path.read_bytes()

    response = authenticated_client.post(
        "/api/v1/upload/pdf",
        files={
            "file": (
                "FL OC2199 DINACUAMAR.pdf",
                contenido,
                "application/pdf",
            )
        },
    )

    assert response.status_code == 422
    assert "Error al procesar el PDF" in response.json()["detail"]
```

If the fixture file is not present, keep the service-level fake test as the primary test and skip this endpoint test with:

```python
    if not pdf_path.exists():
        pytest.skip("Fixture PDF FILACAS no disponible en el workspace")
```

- [ ] **Step 5: Run all AI extraction tests**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ai_config.py tests/test_ai_extractor.py tests/test_order_extraction_validator.py tests/test_order_extraction_normalizer.py tests/test_ai_upload.py -q
```

Expected: all selected tests pass.

- [ ] **Step 6: Run backend smoke suite**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest tests/test_auth.py tests/test_ordenes.py tests/test_comisionistas.py -q
```

Expected: existing backend tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/upload.py backend/tests/test_ai_upload.py
git commit -m "test: cover ai upload error behavior"
```

---

### Task 7: Final Documentation and Verification

**Files:**
- Modify: `README.md`
- Modify: `backend/.env.example`

- [ ] **Step 1: Add README backend configuration section**

In `README.md`, add a backend subsection:

```markdown
### Extraccion IA de ordenes

El backend puede usar OpenAI API para extraer ordenes de compra desde PDFs o imagenes con formatos variables.

Variables:

```txt
AI_EXTRACTION_PROVIDER=openai
AI_EXTRACTION_ENABLED=true
OPENAI_API_KEY=sk-proj-demo-redacted
OPENAI_EXTRACTION_MODEL=gpt-4.1-mini
AI_EXTRACTION_TIMEOUT_SECONDS=45
AI_EXTRACTION_MAX_FILE_MB=10
```

La IA solo propone datos estructurados. El usuario revisa la previsualizacion antes de guardar ordenes. No se deben registrar PDFs, imagenes ni texto completo extraido en logs.
```

- [ ] **Step 2: Run targeted tests**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ai_config.py tests/test_ai_extractor.py tests/test_order_extraction_validator.py tests/test_order_extraction_normalizer.py tests/test_ai_upload.py -q
```

Expected: all AI extraction tests pass.

- [ ] **Step 3: Run full backend tests**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m pytest -q
```

Expected: full backend test suite passes.

- [ ] **Step 4: Run compile check**

Run:

```bash
cd backend
PYTHONPATH=. uv run --extra dev python -m compileall app tests
```

Expected: command exits with code 0.

- [ ] **Step 5: Manual UAT with real OpenAI key**

Start backend with:

```bash
cd backend
AI_EXTRACTION_ENABLED=true OPENAI_API_KEY=<clave-configurada-en-entorno> PYTHONPATH=. uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

In the frontend, upload `FL OC2199 DINACUAMAR.pdf` and confirm:

```txt
fecha: 2026-05-14
numeroOrden: 2199
proveedor: INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA. LTDA.
finca: EL MORRO
producto: ECUBACILLUS TH
cantidad: 20.00
unidad: kg
precioUnitario: 65.0000
total: 1300.0000
```

- [ ] **Step 6: Commit docs**

```bash
git add README.md backend/.env.example
git commit -m "docs: document ai order extraction setup"
```

---

## Self-Review Checklist

- Spec coverage:
  - Multiple PDF/image formats: Tasks 4 and 5.
  - OpenAI provider behind interface: Task 4.
  - Existing upload contract preserved: Tasks 5 and 6.
  - Validation: Task 2.
  - Catalog normalization: Task 3.
  - Safe config and no committed key: Tasks 1 and 7.
  - Tests and UAT: Tasks 2 through 7.
- Placeholder scan:
  - No placeholders ni pasos genericos de validacion.
  - Code examples include exact file paths and commands.
- Type consistency:
  - `OrdenExtraidaIA`, `OrdenValidada`, `EntradaExtraccion`, `validar_orden_extraida`, and `normalizar_orden_extraida` are introduced before use by integration tasks.
