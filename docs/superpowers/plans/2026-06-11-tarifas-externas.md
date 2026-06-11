# Tarifas Externas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an idempotent backend command that migrates external commission rates from `COMISIONES EXTERNAS RESUMEN.pdf` into the current catalog without deleting existing rates.

**Architecture:** Implement a focused seed command with hard-coded, reviewed data from the PDF. The command creates missing catalog records, adds aliases, and upserts rows in `tarifas_cliente_producto` by the existing logical unique key. Tests use the existing SQLite fixture and validate idempotency, mappings, and data creation.

**Tech Stack:** FastAPI backend, SQLAlchemy ORM, Pydantic-independent command module, pytest.

---

### Task 1: Add Seed Command Data And Helpers

**Files:**
- Create: `backend/app/commands/seed_tarifas_externas.py`
- Test: `backend/tests/test_seed_tarifas_externas.py`

- [ ] **Step 1: Write failing tests for catalog creation and idempotency**

Create `backend/tests/test_seed_tarifas_externas.py`:

```python
from decimal import Decimal

from app.commands.seed_tarifas_externas import seed_tarifas_externas
from app.models.cliente import Cliente, Finca
from app.models.comisionista import Comisionista, TipoTarifa
from app.models.producto import Producto, ProductoAlias
from app.models.tarifa_cliente_producto import TarifaClienteProducto


def _seed_catalogo_base(db_session):
    santa = Cliente(nombre="Santa Priscila", tipo="grupo", retencion_porcentaje=Decimal("1.75"))
    frigolandia = Cliente(nombre="FRIGOLANDIA", tipo="individual", retencion_porcentaje=Decimal("1.75"))
    camponio = Cliente(nombre="ASOC INT CAMPONIO", tipo="individual", retencion_porcentaje=Decimal("1.75"))
    intedecam = Cliente(nombre="INTEDECAM", tipo="individual", retencion_porcentaje=Decimal("1.75"))
    isla = Cliente(nombre="INT ISL PALO SANTO", tipo="individual", retencion_porcentaje=Decimal("1.75"))
    golden = Cliente(nombre="GOLDENSHRIMP", tipo="individual", retencion_porcentaje=Decimal("1.75"))
    aqua = Cliente(nombre="AQUALITORAL", tipo="individual", retencion_porcentaje=Decimal("1.75"))
    db_session.add_all([santa, frigolandia, camponio, intedecam, isla, golden, aqua])
    db_session.flush()

    for nombre in [
        "AFRICA",
        "ASIA",
        "BAJEN A",
        "BAJEN B",
        "CALIFORNIA A",
        "CALIFORNIA B",
        "CORVINERO A",
        "CORVINERO B",
        "CHANDUY",
        "DAULAR",
        "DAULAR CURAZAO",
        "PAÑAMAO",
        "TAURA A",
        "TAURA B",
        "TAURA C",
        "TAURA D",
    ]:
        db_session.add(Finca(nombre=nombre, cliente_id=santa.id))

    db_session.add_all(
        [
            Producto(nombre="CITRIUS-011", unidad_comision="caneca", peso_por_unidad=Decimal("20")),
            Producto(nombre="ECU-BACILLUS AGUA", unidad_comision="tacho", tacho_kilos=Decimal("10")),
            Producto(nombre="ECU-BACILLUS SALUD", unidad_comision="tacho", tacho_kilos=Decimal("10")),
            Producto(nombre="ECU-BACILLUS SUELO", unidad_comision="tacho", tacho_kilos=Decimal("10")),
            Producto(nombre="ECU-BACILLUS SUELO PASTILLA TH", unidad_comision="tacho", tacho_kilos=Decimal("10")),
            Producto(nombre="MORTAL C", unidad_comision="litro"),
            Producto(nombre="NATUXTRACT-ECUCITRIUS", unidad_comision="tacho", tacho_kilos=Decimal("15")),
            Producto(nombre="NITRATO DE CALCIO", unidad_comision="kg"),
        ]
    )
    db_session.commit()


def test_seed_tarifas_externas_crea_catalogo_faltante_y_tarifas(db_session):
    _seed_catalogo_base(db_session)

    resumen = seed_tarifas_externas(db_session)

    assert resumen["clientes_creados"] == 4
    assert resumen["productos_creados"] == 1
    assert resumen["tarifas_creadas"] > 0
    assert db_session.query(Cliente).filter_by(nombre="EXPALSA").one()
    assert db_session.query(Cliente).filter_by(nombre="PINGUIMAR").one()
    assert db_session.query(Cliente).filter_by(nombre="CAMPROEX").one()
    assert db_session.query(Cliente).filter_by(nombre="PROMARISCO").one()
    assert db_session.query(Producto).filter_by(nombre="MORTAL SHELL", unidad_comision="litro").one()


def test_seed_tarifas_externas_usa_producto_aprobado_para_pastilla(db_session):
    _seed_catalogo_base(db_session)

    seed_tarifas_externas(db_session)

    comisionista = db_session.query(Comisionista).filter_by(nombre="ALEMAN ROBERT").one()
    producto = db_session.query(Producto).filter_by(nombre="ECU-BACILLUS SUELO PASTILLA TH").one()
    tarifas = (
        db_session.query(TarifaClienteProducto)
        .filter(
            TarifaClienteProducto.comisionista_id == comisionista.id,
            TarifaClienteProducto.producto_id == producto.id,
        )
        .all()
    )
    assert tarifas
    assert {tarifa.tipo for tarifa in tarifas} == {TipoTarifa.fijo_kg}


def test_seed_tarifas_externas_es_idempotente(db_session):
    _seed_catalogo_base(db_session)

    primero = seed_tarifas_externas(db_session)
    total_primero = db_session.query(TarifaClienteProducto).count()
    segundo = seed_tarifas_externas(db_session)
    total_segundo = db_session.query(TarifaClienteProducto).count()

    assert primero["tarifas_creadas"] > 0
    assert segundo["tarifas_creadas"] == 0
    assert segundo["tarifas_actualizadas"] > 0
    assert total_segundo == total_primero


def test_seed_tarifas_externas_crea_alias_relevantes(db_session):
    _seed_catalogo_base(db_session)

    seed_tarifas_externas(db_session)

    aliases = {alias.alias: alias.producto.nombre for alias in db_session.query(ProductoAlias).all()}
    assert aliases["NATRUXTACT"] == "NATUXTRACT-ECUCITRIUS"
    assert aliases["MORTAL CONTROL"] == "MORTAL C"
    assert aliases["NITRATO DED CALCIO"] == "NITRATO DE CALCIO"
    assert aliases["ECU-BACILLUS PASTILLA"] == "ECU-BACILLUS SUELO PASTILLA TH"
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest tests/test_seed_tarifas_externas.py -q
```

Expected: fail with `ModuleNotFoundError: No module named 'app.commands.seed_tarifas_externas'`.

- [ ] **Step 3: Implement `seed_tarifas_externas.py`**

Create `backend/app/commands/seed_tarifas_externas.py` with:

```python
from __future__ import annotations

import os
import sys
from decimal import Decimal
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.cliente import Cliente, Finca
from app.models.comisionista import Comisionista, TipoTarifa
from app.models.producto import Producto, ProductoAlias
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.catalog_normalization import normalizar_nombre_finca


CLIENTES_FALTANTES = ["EXPALSA", "PINGUIMAR", "CAMPROEX", "PROMARISCO"]

PRODUCTOS_REQUERIDOS = {
    "MORTAL SHELL": {"unidad_comision": "litro"},
}

ALIASES_PRODUCTO = {
    "NATRUXTACT": "NATUXTRACT-ECUCITRIUS",
    "NATRUXTACT-ECUCITRIUS": "NATUXTRACT-ECUCITRIUS",
    "NATUXTRACT-ECUCITRIUS": "NATUXTRACT-ECUCITRIUS",
    "MORTAL CONTROL": "MORTAL C",
    "NITRATO DED CALCIO": "NITRATO DE CALCIO",
    "ECU-BACILLUS PASTILLA": "ECU-BACILLUS SUELO PASTILLA TH",
    "ECU-BACILLUS SUELO-PASTILLA": "ECU-BACILLUS SUELO PASTILLA TH",
}

COLUMNAS_SANTA_PRISCILA = [
    ("past_th", "ECU-BACILLUS SUELO PASTILLA TH", TipoTarifa.fijo_kg),
    ("pastilla", "ECU-BACILLUS SUELO PASTILLA TH", TipoTarifa.fijo_kg),
    ("salud", "ECU-BACILLUS SALUD", TipoTarifa.fijo_kg),
    ("agua", "ECU-BACILLUS AGUA", TipoTarifa.fijo_kg),
    ("suelo_polvo", "ECU-BACILLUS SUELO", TipoTarifa.fijo_kg),
    ("citrius_litro", "CITRIUS-011", TipoTarifa.fijo_kg),
    ("nitrato_saco", "NITRATO DE CALCIO", TipoTarifa.fijo_unidad),
    ("natuxtract_tacho", "NATUXTRACT-ECUCITRIUS", TipoTarifa.fijo_unidad),
    ("mortal_control_litro", "MORTAL C", TipoTarifa.fijo_unidad),
]

COLUMNAS_OTROS_CLIENTES = [
    ("pastilla", "ECU-BACILLUS SUELO PASTILLA TH", TipoTarifa.fijo_kg),
    ("salud", "ECU-BACILLUS SALUD", TipoTarifa.fijo_kg),
    ("agua", "ECU-BACILLUS AGUA", TipoTarifa.fijo_kg),
    ("suelo_polvo", "ECU-BACILLUS SUELO", TipoTarifa.fijo_kg),
    ("citrius_litro", "CITRIUS-011", TipoTarifa.fijo_kg),
    ("nitrato_saco", "NITRATO DE CALCIO", TipoTarifa.fijo_unidad),
    ("natuxtract_tacho", "NATUXTRACT-ECUCITRIUS", TipoTarifa.fijo_unidad),
    ("mortal_control_litro", "MORTAL C", TipoTarifa.fijo_unidad),
    ("mortal_shell_litro", "MORTAL SHELL", TipoTarifa.fijo_unidad),
]

SANTA_PRISCILA_TARIFAS = [
    {"comisionista": "ALBURQUERQUE EDGAR", "finca": "AFRICA ADMINISTRACION", "past_th": "1.00", "pastilla": "1.00", "salud": "1.00", "agua": "1.00"},
    {"comisionista": "ALEMAN ROBERT", "finca": "BAJEN ADM A", "past_th": "0.50", "pastilla": "0.50", "salud": "0.50", "agua": "0.50", "suelo_polvo": "0.50", "citrius_litro": "0.10"},
    {"comisionista": "ALEMAN ROBERT", "finca": "BAJEN ADM B", "past_th": "0.50", "pastilla": "0.50", "salud": "0.50", "agua": "0.50", "suelo_polvo": "0.50", "citrius_litro": "0.10"},
]
```

Then add helper functions for get/create, alias creation, finca lookup by `normalizar_nombre_finca`, and tariff upsert. Include the complete PDF data from `docs/comisiones-externas-resumen.md`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest tests/test_seed_tarifas_externas.py -q
```

Expected: all tests pass.

### Task 2: Integrate Admin Endpoint

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_seed_tarifas_externas.py`

- [ ] **Step 1: Add endpoint test**

Append:

```python
from app.models.user import User
from app.security import get_password_hash


def test_admin_seed_tarifas_externas_endpoint(client, db_session):
    _seed_catalogo_base(db_session)
    user = User(
        username="admin",
        email="admin@example.com",
        hashed_password=get_password_hash("password"),
        is_active=True,
        is_superuser=True,
    )
    db_session.add(user)
    db_session.commit()

    login = client.post("/api/v1/auth/login", json={"username": "admin", "password": "password"})
    assert login.status_code == 200
    client.headers.update({"Authorization": f"Bearer {login.json()['access_token']}"})

    response = client.post("/api/v1/admin/seed-tarifas-externas")

    assert response.status_code == 200
    assert response.json()["detail"] == "Tarifas externas cargadas correctamente"
    assert response.json()["tarifas_creadas"] > 0
```

- [ ] **Step 2: Run endpoint test to verify it fails**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest tests/test_seed_tarifas_externas.py::test_admin_seed_tarifas_externas_endpoint -q
```

Expected: fail with `404 Not Found`.

- [ ] **Step 3: Add admin route**

Modify `backend/app/routers/admin.py`:

```python
from app.commands.seed_tarifas_externas import seed_tarifas_externas


@router.post("/seed-tarifas-externas")
def seed_tarifas_externas_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    try:
        resumen = seed_tarifas_externas(db)
        return {
            "detail": "Tarifas externas cargadas correctamente",
            **resumen,
        }
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al cargar tarifas externas: {exc}",
        ) from exc
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest tests/test_seed_tarifas_externas.py -q
```

Expected: all tests pass.

### Task 3: Verification

**Files:**
- Verify only.

- [ ] **Step 1: Compile backend**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m compileall app tests
```

Expected: command exits 0.

- [ ] **Step 2: Run related backend tests**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest tests/test_seed_tarifas_externas.py tests/test_liquidacion_service.py tests/test_order_extraction_normalizer.py -q
```

Expected: all tests pass.

- [ ] **Step 3: Check git diff**

Run:

```bash
git diff -- backend/app/commands/seed_tarifas_externas.py backend/app/routers/admin.py backend/tests/test_seed_tarifas_externas.py
```

Expected: diff contains only migration command, admin route, and tests.
