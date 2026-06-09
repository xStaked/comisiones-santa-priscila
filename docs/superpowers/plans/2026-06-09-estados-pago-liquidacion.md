# Estados De Pago Para Liquidación Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que solo las órdenes pagadas completamente puedan calcularse y guardarse en liquidaciones.

**Architecture:** El estado de pago será canónico en `Orden.estado`, con `OrdenItem.estado` sincronizado por compatibilidad con el modelo actual. El backend hará cumplir la regla crítica al crear liquidaciones; el frontend solo mostrará y enviará órdenes `pagada`.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest, Next.js App Router, TypeScript, React Query, Tailwind/shadcn UI.

---

## Files

- Modify: `backend/app/models/orden.py` — enum `EstadoOrden` y defaults.
- Modify: `backend/app/schemas/orden.py` — defaults y payloads de estado.
- Modify: `backend/app/routers/ordenes.py` — creación `pendiente`, actualización de estado por orden completa y serialización agrupada.
- Modify: `backend/app/services/liquidacion.py` — validación `pagada`, transición a `liquidada`, restauración a `pagada`.
- Modify: `backend/app/routers/reportes.py` — reemplazar filtros de órdenes `activo` por estados de pago.
- Modify: `backend/app/commands/seed_demo.py` — estados de seed demo.
- Create: `backend/alembic/versions/*_actualizar_estados_pago_orden.py` — migración enum PostgreSQL creada por `alembic revision`.
- Modify: `backend/tests/test_ordenes.py` — creación, agrupación y cambio de estado.
- Modify: `backend/tests/test_ordenes.py` — liquidación solo de pagadas y restauración vía API.
- Modify: `src/types/index.ts` — tipo `EstadoOrden`.
- Modify: `src/lib/api.ts` — API para cambiar estado de orden agrupada.
- Modify: `src/context/AppContext.tsx` — callback `updateEstadoOrden`.
- Modify: `src/components/ordenes/OrdenesTab.tsx` — badges y selector por orden agrupada.
- Modify: `src/components/liquidacion/LiquidacionTab.tsx` — filtrar `pagada` y mensajes.
- Modify: `src/components/dashboard/DashboardTab.tsx` — labels for order KPIs that currently describe liquidable orders as “activo”.
- Modify: `src/components/reportes/ReportesTab.tsx` — labels for report sections that currently describe liquidable orders as “activo”.
- Modify: `e2e/ordenes.spec.ts` — assertions that assume `Activo`.

---

### Task 1: Backend Model, Schema, Migration

**Files:**
- Modify: `backend/app/models/orden.py`
- Modify: `backend/app/schemas/orden.py`
- Create: `backend/alembic/versions/*_actualizar_estados_pago_orden.py`

- [ ] **Step 1: Write failing backend tests for new default states**

Append these assertions to existing tests in `backend/tests/test_ordenes.py`:

```python
def test_create_orden_inicia_pendiente(authenticated_client):
    payload = [{
        "fecha": str(date.today()),
        "numero_orden": "ORD-ESTADO-001",
        "finca": "Finca Test",
        "producto": "Camarón",
        "cantidad": "100.00",
        "unidad": "kg",
        "precio_unitario": "5.50",
        "total": "550.00",
        "sector": "Norte",
        "comisionista_ids": [],
    }]

    response = authenticated_client.post("/api/v1/ordenes/", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data[0]["estado"] == "pendiente"


def test_create_orden_agrupada_inicia_pendiente(authenticated_client):
    payload = {
        "fecha": str(date.today()),
        "numero_orden": "ORD-ESTADO-GRUPO-001",
        "origen": "manual",
        "items": [
            {
                "finca": "Finca A",
                "producto": "Camarón",
                "cantidad": "10.00",
                "unidad": "kg",
                "precio_unitario": "5.00",
                "total": "50.00",
                "comisionista_ids": [],
            }
        ],
    }

    response = authenticated_client.post("/api/v1/ordenes/", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["estado"] == "pendiente"
    assert data["items"][0]["estado"] == "pendiente"
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ordenes.py::test_create_orden_inicia_pendiente tests/test_ordenes.py::test_create_orden_agrupada_inicia_pendiente -q
```

Expected: FAIL because responses still return `activo`.

- [ ] **Step 3: Update enum and schemas**

In `backend/app/models/orden.py`, replace `EstadoOrden` with:

```python
class EstadoOrden(str, enum.Enum):
    pendiente = "pendiente"
    parcialmente_pagada = "parcialmente_pagada"
    pagada = "pagada"
    liquidada = "liquidada"
```

Change both `default=EstadoOrden.activo` occurrences to:

```python
default=EstadoOrden.pendiente
```

In `backend/app/schemas/orden.py`, change both defaults:

```python
estado: Optional[str] = "pendiente"
```

- [ ] **Step 4: Add Alembic migration**

Create a revision with:

```bash
cd backend && alembic revision -m "actualizar estados pago orden"
```

Keep the generated header values from Alembic (`revision`, `down_revision`, `Create Date`) and replace only the `upgrade()` and `downgrade()` functions with:

```python
def upgrade() -> None:
    op.execute("ALTER TYPE estado_orden RENAME TO estado_orden_old")
    op.execute(
        "CREATE TYPE estado_orden AS ENUM "
        "('pendiente', 'parcialmente_pagada', 'pagada', 'liquidada')"
    )
    op.execute(
        "ALTER TABLE ordenes ALTER COLUMN estado DROP DEFAULT"
    )
    op.execute(
        "ALTER TABLE orden_items ALTER COLUMN estado DROP DEFAULT"
    )
    op.execute(
        "ALTER TABLE ordenes ALTER COLUMN estado TYPE estado_orden "
        "USING CASE estado::text "
        "WHEN 'activo' THEN 'pendiente' "
        "WHEN 'liquidado' THEN 'liquidada' "
        "ELSE estado::text END::estado_orden"
    )
    op.execute(
        "ALTER TABLE orden_items ALTER COLUMN estado TYPE estado_orden "
        "USING CASE estado::text "
        "WHEN 'activo' THEN 'pendiente' "
        "WHEN 'liquidado' THEN 'liquidada' "
        "ELSE estado::text END::estado_orden"
    )
    op.execute(
        "ALTER TABLE ordenes ALTER COLUMN estado SET DEFAULT 'pendiente'"
    )
    op.execute(
        "ALTER TABLE orden_items ALTER COLUMN estado SET DEFAULT 'pendiente'"
    )
    op.execute("DROP TYPE estado_orden_old")


def downgrade() -> None:
    op.execute("ALTER TYPE estado_orden RENAME TO estado_orden_new")
    op.execute("CREATE TYPE estado_orden AS ENUM ('activo', 'liquidado')")
    op.execute("ALTER TABLE ordenes ALTER COLUMN estado DROP DEFAULT")
    op.execute("ALTER TABLE orden_items ALTER COLUMN estado DROP DEFAULT")
    op.execute(
        "ALTER TABLE ordenes ALTER COLUMN estado TYPE estado_orden "
        "USING CASE estado::text "
        "WHEN 'liquidada' THEN 'liquidado' "
        "ELSE 'activo' END::estado_orden"
    )
    op.execute(
        "ALTER TABLE orden_items ALTER COLUMN estado TYPE estado_orden "
        "USING CASE estado::text "
        "WHEN 'liquidada' THEN 'liquidado' "
        "ELSE 'activo' END::estado_orden"
    )
    op.execute("ALTER TABLE ordenes ALTER COLUMN estado SET DEFAULT 'activo'")
    op.execute("ALTER TABLE orden_items ALTER COLUMN estado SET DEFAULT 'activo'")
    op.execute("DROP TYPE estado_orden_new")
```

- [ ] **Step 5: Update creation defaults in router**

In `backend/app/routers/ordenes.py`, replace every new-order default:

```python
estado=EstadoOrden.pendiente,
```

This includes list payload creation, grouped order creation, `_crear_orden_item`, and synthetic grouped serialization for items without parent order.

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ordenes.py::test_create_orden_inicia_pendiente tests/test_ordenes.py::test_create_orden_agrupada_inicia_pendiente -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/orden.py backend/app/schemas/orden.py backend/app/routers/ordenes.py backend/alembic/versions/*_actualizar_estados_pago_orden.py backend/tests/test_ordenes.py
git commit -m "feat: agregar estados de pago de orden"
```

---

### Task 2: Backend Estado Por Orden Completa

**Files:**
- Modify: `backend/app/routers/ordenes.py`
- Test: `backend/tests/test_ordenes.py`

- [ ] **Step 1: Write failing tests for grouped status updates**

Append to `backend/tests/test_ordenes.py`:

```python
def test_actualiza_estado_de_orden_agrupada_y_sus_items(authenticated_client):
    payload = {
        "fecha": str(date.today()),
        "numero_orden": "ORD-PAGO-001",
        "origen": "manual",
        "items": [
            {
                "finca": "Finca A",
                "producto": "Camarón",
                "cantidad": "10.00",
                "unidad": "kg",
                "precio_unitario": "5.00",
                "total": "50.00",
                "comisionista_ids": [],
            },
            {
                "finca": "Finca B",
                "producto": "Tilapia",
                "cantidad": "20.00",
                "unidad": "kg",
                "precio_unitario": "3.00",
                "total": "60.00",
                "comisionista_ids": [],
            },
        ],
    }
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    orden_id = create_resp.json()["id"]

    update_resp = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{orden_id}/estado",
        json={"estado": "pagada"},
    )

    assert update_resp.status_code == 200
    data = update_resp.json()
    assert data["estado"] == "pagada"
    assert {item["estado"] for item in data["items"]} == {"pagada"}


def test_rechaza_estado_de_orden_desconocido(authenticated_client):
    payload = [{
        "fecha": str(date.today()),
        "numero_orden": "ORD-PAGO-INVALIDO-001",
        "finca": "Finca Test",
        "producto": "Camarón",
        "cantidad": "100.00",
        "unidad": "kg",
        "precio_unitario": "5.50",
        "total": "550.00",
        "comisionista_ids": [],
    }]
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    orden_id = create_resp.json()[0]["orden_id"]

    update_resp = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{orden_id}/estado",
        json={"estado": "cobrada"},
    )

    assert update_resp.status_code == 400
    assert "Estado de orden inválido" in update_resp.json()["detail"]
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ordenes.py::test_actualiza_estado_de_orden_agrupada_y_sus_items tests/test_ordenes.py::test_rechaza_estado_de_orden_desconocido -q
```

Expected: FAIL with 404 because `/grupos/{id}/estado` does not exist.

- [ ] **Step 3: Add request model and helper**

In `backend/app/routers/ordenes.py`, add below `ComisionistasOrdenBody`:

```python
class EstadoOrdenBody(BaseModel):
    estado: str


def _parse_estado_orden(value: str) -> EstadoOrden:
    try:
        return EstadoOrden(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Estado de orden inválido",
        ) from exc
```

- [ ] **Step 4: Add grouped state endpoint**

Add this route before `@router.delete("/{id}")` in `backend/app/routers/ordenes.py`:

```python
@router.put("/grupos/{id}/estado")
def actualizar_estado_orden_grupo(
    id: UUID,
    body: EstadoOrdenBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    orden = (
        db.query(Orden)
        .options(selectinload(Orden.items))
        .filter(Orden.id == id)
        .first()
    )
    if not orden:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada"
        )

    nuevo_estado = _parse_estado_orden(body.estado)
    if nuevo_estado == EstadoOrden.liquidada:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El estado liquidada se asigna al guardar una liquidación",
        )

    orden.estado = nuevo_estado
    for item in orden.items:
        item.estado = nuevo_estado

    db.commit()
    db.refresh(orden)
    return _serializar_orden(orden)
```

- [ ] **Step 5: Keep item update state parsing consistent**

In `actualizar_orden`, replace:

```python
update_data["estado"] = EstadoOrden(update_data["estado"])
```

with:

```python
update_data["estado"] = _parse_estado_orden(update_data["estado"])
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ordenes.py::test_actualiza_estado_de_orden_agrupada_y_sus_items tests/test_ordenes.py::test_rechaza_estado_de_orden_desconocido -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/ordenes.py backend/tests/test_ordenes.py
git commit -m "feat: actualizar estado de orden completa"
```

---

### Task 3: Backend Liquidación Solo De Órdenes Pagadas

**Files:**
- Modify: `backend/app/services/liquidacion.py`
- Modify: `backend/app/commands/seed_demo.py`
- Test: `backend/tests/test_ordenes.py`
- Test: `backend/tests/test_liquidacion_service.py`

- [ ] **Step 1: Update existing grouped liquidation test expectation**

In `backend/tests/test_ordenes.py`, in `test_liquidacion_preserva_orden_id_en_snapshots`, add this before posting to `/api/v1/liquidaciones/`:

```python
    estado_resp = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{orden['id']}/estado",
        json={"estado": "pagada"},
    )
    assert estado_resp.status_code == 200
```

Change the final assertion:

```python
    assert orden_liquidada["estado"] == "liquidada"
```

- [ ] **Step 2: Add API tests for rejecting non-paid orders**

Append to `backend/tests/test_ordenes.py`:

```python
def test_liquidacion_rechaza_orden_pendiente(authenticated_client):
    payload = [{
        "fecha": str(date.today()),
        "numero_orden": "ORD-LIQ-PENDIENTE-001",
        "finca": "Finca Test",
        "producto": "Camarón",
        "cantidad": "100.00",
        "unidad": "kg",
        "precio_unitario": "5.50",
        "total": "550.00",
        "comisionista_ids": [],
    }]
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    item_id = create_resp.json()[0]["id"]

    liq_resp = authenticated_client.post(
        "/api/v1/liquidaciones/",
        json={"nombre": "Liquidación inválida", "orden_item_ids": [item_id]},
    )

    assert liq_resp.status_code == 400
    assert "pagada" in liq_resp.json()["detail"]


def test_liquidacion_permite_orden_pagada_y_marca_liquidada(authenticated_client):
    payload = {
        "fecha": str(date.today()),
        "numero_orden": "ORD-LIQ-PAGADA-001",
        "origen": "manual",
        "items": [
            {
                "finca": "Finca A",
                "producto": "Camarón",
                "cantidad": "10.00",
                "unidad": "kg",
                "precio_unitario": "5.00",
                "total": "50.00",
                "comisionista_ids": [],
            }
        ],
    }
    create_resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert create_resp.status_code == 201
    orden = create_resp.json()
    item_id = orden["items"][0]["id"]

    estado_resp = authenticated_client.put(
        f"/api/v1/ordenes/grupos/{orden['id']}/estado",
        json={"estado": "pagada"},
    )
    assert estado_resp.status_code == 200

    liq_resp = authenticated_client.post(
        "/api/v1/liquidaciones/",
        json={"nombre": "Liquidación pagada", "orden_item_ids": [item_id]},
    )

    assert liq_resp.status_code == 201
    agrupadas_resp = authenticated_client.get("/api/v1/ordenes/", params={"agrupadas": True})
    orden_liquidada = next(
        o for o in agrupadas_resp.json() if o["numero_orden"] == "ORD-LIQ-PAGADA-001"
    )
    assert orden_liquidada["estado"] == "liquidada"
    assert {item["estado"] for item in orden_liquidada["items"]} == {"liquidada"}
```

- [ ] **Step 3: Run tests and verify failures**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ordenes.py::test_liquidacion_rechaza_orden_pendiente tests/test_ordenes.py::test_liquidacion_permite_orden_pagada_y_marca_liquidada tests/test_ordenes.py::test_liquidacion_preserva_orden_id_en_snapshots -q
```

Expected: FAIL because service still accepts `activo` and still writes `liquidado`.

- [ ] **Step 4: Update liquidacion service state validation**

In `backend/app/services/liquidacion.py`, replace the filtering block in `crear_liquidacion` with strict validation:

```python
    errores_estado: list[dict] = []
    orden_items_pagados: list[OrdenItem] = []
    for oi in orden_items:
        estado_orden = oi.orden.estado if oi.orden else oi.estado
        if estado_orden != EstadoOrden.pagada:
            errores_estado.append({
                "id": str(oi.id),
                "estado": estado_orden.value,
                "motivo": "la orden debe estar pagada para liquidarse",
            })
        else:
            orden_items_pagados.append(oi)

    if errores_estado:
        raise ValueError(
            "Solo se pueden liquidar órdenes en estado pagada"
        )

    if not orden_items_pagados:
        raise ValueError("Ninguno de los ítems seleccionados pertenece a una orden pagada")
```

Then rename later loop variables from `orden_items_activos` to `orden_items_pagados`.

- [ ] **Step 5: Update liquidation transitions**

In `crear_liquidacion`, replace:

```python
oi.estado = EstadoOrden.liquidado
```

with:

```python
oi.estado = EstadoOrden.liquidada
```

Replace the order completion query block with direct grouped updates:

```python
    orden_ids = {oi.orden_id for oi in orden_items_pagados if oi.orden_id is not None}
    for orden_id in orden_ids:
        orden = db.query(Orden).filter(Orden.id == orden_id).first()
        if orden:
            orden.estado = EstadoOrden.liquidada
```

In `eliminar_liquidacion`, change updates to:

```python
{OrdenItem.estado: EstadoOrden.pagada}
```

and:

```python
{Orden.estado: EstadoOrden.pagada}
```

In `restaurar_liquidacion`, set restored order and item states to:

```python
estado=EstadoOrden.pagada,
```

- [ ] **Step 6: Update seed demo states**

In `backend/app/commands/seed_demo.py`, replace:

```python
estado = EstadoOrden.liquidado if in_liquidacion else EstadoOrden.activo
```

with:

```python
estado = EstadoOrden.liquidada if in_liquidacion else EstadoOrden.pagada
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest tests/test_ordenes.py::test_liquidacion_rechaza_orden_pendiente tests/test_ordenes.py::test_liquidacion_permite_orden_pagada_y_marca_liquidada tests/test_ordenes.py::test_liquidacion_preserva_orden_id_en_snapshots -q
```

Expected: PASS.

- [ ] **Step 8: Run backend suite**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest -q
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/app/services/liquidacion.py backend/app/commands/seed_demo.py backend/tests/test_ordenes.py backend/tests/test_liquidacion_service.py
git commit -m "feat: restringir liquidacion a ordenes pagadas"
```

---

### Task 4: Frontend Types, API, Context

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/context/AppContext.tsx`

- [ ] **Step 1: Add explicit order state type**

In `src/types/index.ts`, add near the top:

```ts
export type EstadoOrden = 'pendiente' | 'parcialmente_pagada' | 'pagada' | 'liquidada';
```

Change `OrdenItem.estado` to:

```ts
  estado?: EstadoOrden;
```

Change `Orden.estado` to:

```ts
  estado: EstadoOrden;
```

- [ ] **Step 2: Add grouped state API function**

In `src/lib/api.ts`, add after `updateOrden`:

```ts
export async function updateEstadoOrdenGrupo(id: string, estado: string) {
  const res = await api.put(`/api/v1/ordenes/grupos/${id}/estado`, toSnakeCase({ estado }));
  return toCamelCase(res.data);
}
```

- [ ] **Step 3: Expose context callback**

In `src/context/AppContext.tsx`, import `EstadoOrden` and `updateEstadoOrdenGrupo`:

```ts
import { Comisionista, OrdenItem, Liquidacion, Cliente, Producto, Finca, TarifaClienteProducto, EstadoOrden } from '@/types';
```

Add to API imports:

```ts
  updateEstadoOrdenGrupo as apiUpdateEstadoOrdenGrupo,
```

Add to `AppContextType`:

```ts
  updateEstadoOrden: (ordenId: string, estado: EstadoOrden) => void;
```

Add mutation after `updateOrdenMutation`:

```ts
  const updateEstadoOrdenMutation = useMutation({
    mutationFn: ({ ordenId, estado }: { ordenId: string; estado: EstadoOrden }) =>
      apiUpdateEstadoOrdenGrupo(ordenId, estado),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      toast.success('Estado de orden actualizado');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar estado de orden');
    },
  });
```

Add callback:

```ts
  const updateEstadoOrden = useCallback(
    (ordenId: string, estado: EstadoOrden) => {
      updateEstadoOrdenMutation.mutate({ ordenId, estado });
    },
    [updateEstadoOrdenMutation]
  );
```

Add `updateEstadoOrden` to provider value.

- [ ] **Step 4: Update default save filter**

In `saveLiquidacion`, replace:

```ts
const ids = ordenItemIds ?? ordenItems.filter((o) => o.estado !== 'liquidado').map((o) => o.id);
```

with:

```ts
const ids = ordenItemIds ?? ordenItems.filter((o) => o.estado === 'pagada').map((o) => o.id);
```

Change the empty toast to:

```ts
toast.error('No hay órdenes pagadas para guardar');
```

Change the success toast for omitted items to:

```ts
toast.success(`Liquidación guardada. Se omitieron ${data.omitidos.length} ítem(s) que ya no están pagados.`);
```

- [ ] **Step 5: Run TypeScript build**

Run:

```bash
pnpm build
```

Expected: may fail until UI code uses new context type; fix compile errors from missing provider fields before moving on.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/api.ts src/context/AppContext.tsx
git commit -m "feat: exponer estados de pago en frontend"
```

---

### Task 5: UI De Órdenes Con Selector De Estado

**Files:**
- Modify: `src/components/ordenes/OrdenesTab.tsx`

- [ ] **Step 1: Add helpers and context callback**

Update the `useApp()` destructuring to include:

```ts
updateEstadoOrden
```

Import `EstadoOrden`:

```ts
import type { EstadoOrden } from '@/types';
```

Add helpers near the top of the component:

```ts
const ESTADOS_ORDEN: { value: EstadoOrden; label: string; className: string }[] = [
  { value: 'pendiente', label: 'Pendiente', className: 'bg-slate-100 text-slate-700 border-0' },
  { value: 'parcialmente_pagada', label: 'Parcialmente pagada', className: 'bg-amber-100 text-amber-700 border-0' },
  { value: 'pagada', label: 'Pagada', className: 'bg-emerald-100 text-emerald-700 border-0' },
  { value: 'liquidada', label: 'Liquidada', className: 'bg-blue-100 text-blue-700 border-0' },
];

function getEstadoOrdenMeta(estado?: string) {
  return ESTADOS_ORDEN.find((item) => item.value === estado) ?? ESTADOS_ORDEN[0];
}
```

- [ ] **Step 2: Update grouped state calculation**

In `ordenesAgrupadas`, replace:

```ts
existente.estado = existente.items.every(i => i.estado === 'liquidado') ? 'liquidado' : 'activo';
```

with:

```ts
existente.estado = existente.items.every(i => i.estado === existente.items[0]?.estado)
  ? (existente.items[0]?.estado || 'pendiente')
  : 'pendiente';
```

Replace:

```ts
estado: item.estado || 'activo',
```

with:

```ts
estado: item.estado || 'pendiente',
```

- [ ] **Step 3: Replace badge with selector**

Replace the current state badge cell:

```tsx
<Badge variant="secondary" className={orden.estado === 'liquidado' ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-slate-100 text-slate-700 border-0'}>
  {orden.estado === 'liquidado' ? 'Liquidado' : 'Activo'}
</Badge>
```

with:

```tsx
{(() => {
  const estadoMeta = getEstadoOrdenMeta(orden.estado);
  const estadoEditable = orden.estado !== 'liquidada';
  return (
    <div className="flex flex-col gap-2">
      <Badge variant="secondary" className={estadoMeta.className}>
        {estadoMeta.label}
      </Badge>
      {estadoEditable && (
        <Select
          value={orden.estado}
          onValueChange={(value) => updateEstadoOrden(orden.id, value as EstadoOrden)}
        >
          <SelectTrigger className="h-8 w-44 rounded-lg border-slate-200 bg-white text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ESTADOS_ORDEN.filter((estado) => estado.value !== 'liquidada').map((estado) => (
              <SelectItem key={estado.value} value={estado.value}>
                {estado.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
})()}
```

- [ ] **Step 4: Disable destructive/edit actions for liquidated orders**

For the grouped delete button, add:

```tsx
disabled={orden.estado === 'liquidada'}
```

For item edit/delete buttons inside liquidated orders, add:

```tsx
disabled={orden.estado === 'liquidada'}
```

- [ ] **Step 5: Run build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ordenes/OrdenesTab.tsx
git commit -m "feat: gestionar estado de pago en ordenes"
```

---

### Task 6: UI De Liquidación Solo Con Pagadas

**Files:**
- Modify: `src/components/liquidacion/LiquidacionTab.tsx`

- [ ] **Step 1: Rename active collection to paid collection**

In `src/components/liquidacion/LiquidacionTab.tsx`, replace:

```ts
const ordenItemsActivos = useMemo(
  () => ordenItems.filter(item => item.estado !== 'liquidado'),
  [ordenItems]
);
```

with:

```ts
const ordenItemsPagados = useMemo(
  () => ordenItems.filter(item => item.estado === 'pagada'),
  [ordenItems]
);
```

Update references from `ordenItemsActivos` to `ordenItemsPagados`.

- [ ] **Step 2: Update save filter**

In `handleSave`, replace:

```ts
.filter(item => item.estado !== 'liquidado')
```

with:

```ts
.filter(item => item.estado === 'pagada')
```

Change empty toasts:

```ts
toast.error('No hay órdenes pagadas para guardar');
```

and:

```ts
toast.error('No hay órdenes pagadas para liquidar');
```

- [ ] **Step 3: Update empty states**

Replace the early return condition:

```ts
if (ordenItemsActivos.length === 0) {
```

with:

```ts
if (ordenItems.length === 0) {
```

Keep the existing “Sin órdenes cargadas” message for that case.

After that block, add:

```tsx
if (ordenItemsPagados.length === 0) {
  return (
    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
      <Calculator className="h-12 w-12 text-slate-300 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-slate-700">Sin órdenes pagadas</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
        Marca una orden como pagada en &quot;Cargar Órdenes&quot; para habilitar su liquidación.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Update labels in preview**

Change preview labels from:

```tsx
<span className="text-sm text-slate-500">Órdenes a liquidar</span>
```

to:

```tsx
<span className="text-sm text-slate-500">Órdenes pagadas a liquidar</span>
```

Add a small explanatory line in the dialog below the summary:

```tsx
<p className="text-xs text-slate-500">
  Solo se guardarán órdenes con estado pagada. Las pendientes y parcialmente pagadas quedan fuera.
</p>
```

- [ ] **Step 5: Run build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/liquidacion/LiquidacionTab.tsx src/lib/export-utils.ts
git commit -m "feat: liquidar solo ordenes pagadas en frontend"
```

---

### Task 7: Reportes, Dashboard, Textos Y Compatibility Sweep

**Files:**
- Modify: `backend/app/routers/reportes.py`
- Modify: `src/components/dashboard/DashboardTab.tsx`
- Modify: `src/components/reportes/ReportesTab.tsx` if visible copy depends on “activas”.
- Modify: `e2e/ordenes.spec.ts` if selectors assert `Activo`.

- [ ] **Step 1: Replace backend report filters**

In `backend/app/routers/reportes.py`, replace every liquidation-pending query filter:

```python
OrdenItem.estado == EstadoOrden.activo
```

with:

```python
OrdenItem.estado == EstadoOrden.pagada
```

For counts named `total_ordenes_activas`, rename local variables to:

```python
total_ordenes_pagadas = db.query(OrdenItem).filter(OrdenItem.estado == EstadoOrden.pagada).count()
```

Preserve existing response keys in `backend/app/routers/reportes.py` to avoid breaking current frontend consumers. Rename visible frontend labels to “pagadas” or “pendientes de liquidar”.

- [ ] **Step 2: Update dashboard copy**

In `src/components/dashboard/DashboardTab.tsx`, replace visible strings that refer to liquidable orders as “activas” with “pagadas” or “pendientes de liquidar”. Do not change `activo` strings for clients/products/tarifas because those are different domain concepts.

- [ ] **Step 3: Run compatibility search**

Run:

```bash
rg "EstadoOrden\\.activo|EstadoOrden\\.liquidado|estado !== 'liquidado'|'activo' \\| 'liquidado'|Activo" backend/app backend/tests src e2e -n
```

Expected: remaining matches are only unrelated active flags for clientes/productos/tarifas/usuarios or migration downgrade text.

- [ ] **Step 4: Fix remaining order-state references**

For order-state matches only:

- Replace `EstadoOrden.activo` with `EstadoOrden.pendiente` or `EstadoOrden.pagada` according to context.
- Replace `EstadoOrden.liquidado` with `EstadoOrden.liquidada`.
- Replace frontend `estado !== 'liquidado'` with `estado === 'pagada'`.
- Replace user-facing `Activo` for orders with `Pendiente`, `Pagada`, or `Liquidada`.

- [ ] **Step 5: Run backend tests and frontend build**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest -q
```

Expected: PASS.

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/reportes.py src/components/dashboard/DashboardTab.tsx src/components/reportes/ReportesTab.tsx e2e/ordenes.spec.ts
git commit -m "chore: actualizar reportes a estados de pago"
```

---

### Task 8: End-To-End Verification

**Files:**
- Modify: `e2e/ordenes.spec.ts`
- Read: `e2e/helpers/auth.ts`

- [ ] **Step 1: Add E2E scenario**

Add a test to `e2e/ordenes.spec.ts` that:

```ts
test('una orden pendiente aparece en liquidacion solo despues de marcarse pagada', async ({ page }) => {
  await login(page);

  await page.goto('/ordenes');
  await page.getByRole('button', { name: /agregar manual/i }).click();
  await page.getByLabel(/numero|número/i).fill(`ORD-E2E-${Date.now()}`);
  await page.getByLabel(/producto/i).fill('Camarón');
  await page.getByLabel(/cantidad/i).fill('10');
  await page.getByLabel(/precio/i).fill('5');
  await page.getByRole('button', { name: /guardar|agregar/i }).click();

  await page.goto('/liquidacion');
  await expect(page.getByText(/sin órdenes pagadas/i)).toBeVisible();

  await page.goto('/ordenes');
  await page.getByRole('combobox').filter({ hasText: /pendiente/i }).first().click();
  await page.getByRole('option', { name: /pagada/i }).click();

  await page.goto('/liquidacion');
  await expect(page.getByText(/órdenes pagadas a liquidar/i)).toBeVisible();
});
```

Adjust label selectors to match the actual rendered form labels in `OrdenesTab.tsx`.

- [ ] **Step 2: Run E2E**

Run:

```bash
pnpm test:e2e -- e2e/ordenes.spec.ts
```

Expected: PASS if local backend/frontend test environment is available. If infrastructure is not available, record the exact failure in the final implementation summary.

- [ ] **Step 3: Final verification**

Run:

```bash
cd backend && PYTHONPATH=. uv run --extra dev python -m pytest -q
```

Expected: PASS.

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/ordenes.spec.ts e2e/helpers/auth.ts
git commit -m "test: cubrir liquidacion solo de ordenes pagadas"
```

---

## Self-Review

- Spec coverage: model, migration, manual state update, backend validation, frontend filters, UI badges, report wording, tests, and out-of-scope payment ledger are covered.
- Placeholder scan: no `TBD`, `TODO`, or incomplete implementation steps remain. The Alembic revision filename is intentionally generated by `alembic revision`; the plan specifies how to fill the generated revision id.
- Type consistency: frontend uses `EstadoOrden` with `pendiente`, `parcialmente_pagada`, `pagada`, `liquidada`; backend uses the same values in `EstadoOrden`.
- Scope check: this remains one coherent feature. It does not implement payment records, attachments, or audit history.
