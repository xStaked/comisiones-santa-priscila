# Asignación Automática de Comisionistas en Importación Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Asignar automáticamente todos los comisionistas con tarifas activas aplicables a cada producto importado desde PDF o imagen.

**Architecture:** La resolución se incorpora al normalizador de extracción, después de vincular cliente, producto y finca. La respuesta de extracción conserva la lista resuelta para que el flujo existente del frontend la persista al confirmar.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, pytest, PyMuPDF.

---

### Task 1: Resolver comisionistas aplicables durante la normalización

**Files:**
- Modify: `backend/app/services/order_extraction_normalizer.py`
- Modify: `backend/tests/test_order_extraction_normalizer.py`

- [ ] **Step 1: Escribir pruebas fallidas para las reglas de coincidencia**

Agregar pruebas que creen tarifas activas para dos comisionistas y verifiquen:

```python
assert {c["comisionistaId"] for c in item.comisionistas} == {
    str(comisionista_uno.id),
    str(comisionista_dos.id),
}
```

Cubrir cuatro casos: grupo con finca exacta, grupo con finca distinta, cliente sin fincas y tarifa inactiva.

- [ ] **Step 2: Ejecutar las pruebas y confirmar el fallo**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest tests/test_order_extraction_normalizer.py -q
```

Expected: FAIL porque `normalizar_orden_extraida()` todavía deja `item.comisionistas` vacío.

- [ ] **Step 3: Implementar la resolución mínima**

Agregar una función enfocada:

```python
def _buscar_comisionistas_aplicables(
    db: Session,
    cliente: Cliente | None,
    producto: Producto | None,
    finca: Finca | None,
) -> list[dict[str, str]]:
    if not cliente or not producto:
        return []
    query = db.query(TarifaClienteProducto).filter(
        TarifaClienteProducto.cliente_id == cliente.id,
        TarifaClienteProducto.producto_id == producto.id,
        TarifaClienteProducto.activo.is_(True),
    )
    if cliente.fincas:
        if not finca:
            return []
        query = query.filter(TarifaClienteProducto.finca_id == finca.id)
    else:
        query = query.filter(TarifaClienteProducto.finca_id.is_(None))
    return [
        {"comisionistaId": str(comisionista_id)}
        for comisionista_id in dict.fromkeys(
            tarifa.comisionista_id for tarifa in query.all()
        )
    ]
```

Después de normalizar cada producto:

```python
item.comisionistas = _buscar_comisionistas_aplicables(
    db,
    item_cliente,
    producto,
    finca,
)
```

- [ ] **Step 4: Ejecutar pruebas y confirmar que pasan**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest tests/test_order_extraction_normalizer.py -q
```

Expected: PASS.

### Task 2: Conservar asignaciones en respuestas de extracción

**Files:**
- Modify: `backend/app/services/pdf_extractor.py`
- Modify: `backend/app/services/ocr_extractor.py`
- Modify: `backend/tests/test_pdf_extractor.py`

- [ ] **Step 1: Escribir prueba fallida con el PDF real**

Agregar una prueba que cargue:

```python
pdf_path = Path("/Users/xstaked/Downloads/ordenes/93133 SEM 15 ECU-BACILLUS.pdf")
resultado = extraer_orden_de_pdf(pdf_path.read_bytes(), pdf_path.name, db=db_session)
```

Preparar catálogo y tarifas aplicables, y verificar:

```python
assert resultado["items"]
assert resultado["items"][0]["comisionistas"]
```

- [ ] **Step 2: Ejecutar la prueba y confirmar el fallo**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest tests/test_pdf_extractor.py -q
```

Expected: FAIL porque la serialización reemplaza las asignaciones por `[]`.

- [ ] **Step 3: Serializar la lista normalizada**

En las respuestas de extracción, reemplazar:

```python
"comisionistas": [],
```

por:

```python
"comisionistas": item.comisionistas,
```

- [ ] **Step 4: Ejecutar la prueba y confirmar que pasa**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest tests/test_pdf_extractor.py -q
```

Expected: PASS.

### Task 3: Verificar persistencia y regresiones

**Files:**
- Modify: `backend/tests/test_ordenes.py`

- [ ] **Step 1: Agregar prueba de persistencia de múltiples asignaciones**

Crear una orden con dos `comisionistaIds`, guardarla mediante `/api/v1/ordenes/` y verificar:

```python
assert {
    asignacion["comisionista_id"]
    for asignacion in item_guardado["comisionistas"]
} == {
    str(comisionista_uno.id),
    str(comisionista_dos.id),
}
```

- [ ] **Step 2: Ejecutar suite backend**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest -q
```

Expected: PASS.

- [ ] **Step 3: Ejecutar build frontend**

Run:

```bash
pnpm build
```

Expected: PASS.
