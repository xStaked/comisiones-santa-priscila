# NATUXTRACT Alias Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sure the real-data seed path creates the `NATRUXTACT-ECUCITRIUS` alias so Santa Priscila PDF matching resolves `NATUXTRACT` and assigns the correct comisionista/tarifa.

**Architecture:** Factor alias creation into a reusable helper inside the external-tariffs seed module, then call that helper from both the external-tariffs seed and the real-data admin seed path. Keep the alias map centralized so repair stays idempotent and future seeds do not drift.

**Tech Stack:** FastAPI, SQLAlchemy, pytest

---

### Task 1: Prove the missing alias path

**Files:**
- Modify: `backend/tests/test_seed_tarifas_externas.py`

- [ ] **Step 1: Write the failing test**

```python
def test_seed_real_crea_alias_natruxtract_ecucitrius(db_session, client):
    # ... seed superuser ...
    response = client.post("/api/v1/admin/seed-real")
    assert response.status_code == 200
    alias = db_session.query(ProductoAlias).filter_by(alias="NATRUXTACT-ECUCITRIUS").one()
    assert alias.producto.nombre == "NATUXTRACT"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_seed_tarifas_externas.py -k natruxtract -v`
Expected: FAIL because the real-data seed does not create the alias yet.

### Task 2: Reuse alias seeding in both seed paths

**Files:**
- Modify: `backend/app/commands/seed_tarifas_externas.py`
- Modify: `backend/app/commands/seed_demo.py` if needed for shared alias handling
- Modify: `backend/app/routers/admin.py`

- [ ] **Step 1: Write the failing test**

```python
def test_seed_real_crea_alias_natruxtract_ecucitrius(db_session, client):
    # same setup as Task 1
    ...
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_seed_tarifas_externas.py -k natruxtract -v`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```python
def seed_aliases_productos(db: Session, resumen: dict[str, int] | None = None) -> None:
    ...
```

```python
seed_aliases_productos(db, resumen)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_seed_tarifas_externas.py -k natruxtract -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/commands/seed_tarifas_externas.py backend/app/routers/admin.py backend/tests/test_seed_tarifas_externas.py
git commit -m "fix: seed natuxtract alias for santa priscila pdfs"
```
