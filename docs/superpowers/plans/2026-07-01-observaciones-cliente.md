# Observaciones del cliente (julio 2026) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar las 6 observaciones del cliente: totales alfabéticos, marcado masivo de órdenes pagadas, edición múltiple de tarifas, regla de comisión por umbral de volumen, grupos de proveedores y exportación con una hoja por razón social (= proveedor).

**Architecture:** Frontend Next.js 16 (App Router, React Query v5) + backend FastAPI/SQLAlchemy 2.0/Alembic. Las tarifas y el cálculo de comisiones están duplicados en `src/lib/export-utils.ts` (preview) y `backend/app/services/liquidacion.py` (snapshot) — **deben mantenerse en paridad**. Spec: `docs/superpowers/specs/2026-07-01-observaciones-cliente-design.md`.

**Tech Stack:** TypeScript, Tailwind, shadcn/ui, axios (`src/lib/api.ts` con `toSnakeCase`/`toCamelCase`), FastAPI, Pydantic v2 (alias camelCase), pytest (SQLite en memoria, sin PostgreSQL).

## Global Constraints

- Todo el código, comentarios, commits y UI en **español**.
- Backend: pytest corre sin PostgreSQL (`cd backend && pytest`). Frontend: no hay tests unitarios; verificación = `pnpm build` (incluye type-check) y `pnpm lint`.
- Requests del frontend pasan por `toSnakeCase()`; responses por `toCamelCase()` (`src/lib/api.ts`).
- Formato numérico UI: `1.234,56`. Alias `@/` = `./src/`.
- NO tocar `backend/app/services/pdf_extractor.py` ni correr seeds contra producción.
- Cadena de migraciones Alembic: head actual = `aca4cb479a15`.
- Commits frecuentes, mensajes en español, sufijo `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Totales en orden alfabético (Reportes)

**Files:**
- Modify: `src/lib/export-utils.ts:732,762,803,833`

`LiquidacionTab` ya ordena alfabéticamente (`LiquidacionTab.tsx:143`); solo cambian las 4 funciones de agrupación de reportes, que hoy ordenan por monto descendente.

**Interfaces:**
- Produces: mismas firmas; solo cambia el criterio de orden del array retornado.

- [ ] **Step 1: Cambiar los 4 sorts**

En `src/lib/export-utils.ts`:

Línea 732 (`agruparPorFinca`) y línea 762 (`agruparPorProducto`) y línea 833 (`agruparPorCliente`) — las tres son idénticas:

```ts
// antes
return Array.from(map.values()).sort((a, b) => b.total - a.total);
// después
return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
```

Línea 803 (`agruparPorComisionista`):

```ts
// antes
return Array.from(map.values()).sort((a, b) => b.totalComision - a.totalComision);
// después
return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
```

- [ ] **Step 2: Verificar build**

Run: `pnpm build`
Expected: compila sin errores de tipo.

- [ ] **Step 3: Commit**

```bash
git add src/lib/export-utils.ts
git commit -m "feat(reportes): ordenar totales alfabéticamente"
```

---

### Task 2: Backend — endpoint masivo de estado de órdenes

**Files:**
- Modify: `backend/app/routers/ordenes.py` (insertar ANTES de `actualizar_estado_orden_grupo`, línea 409)
- Test: `backend/tests/test_ordenes.py`

**Interfaces:**
- Produces: `PUT /api/v1/ordenes/grupos/estado-masivo` con body `{"orden_ids": [UUID], "estado": "pagada"}` → `{"actualizadas": int, "omitidas": [str]}`. Las órdenes con ítems liquidados o inexistentes se reportan en `omitidas` (no abortan el lote). `estado = "liquidada"` → 400.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `backend/tests/test_ordenes.py` (los imports `date`/`Decimal`/modelos ya existen en ese archivo; si falta alguno, agregarlo arriba):

```python
def test_estado_masivo_marca_pagadas_y_omite_liquidadas(authenticated_client, db_session):
    o1 = Orden(fecha=date.today(), numero_orden="MAS-1", origen="manual", estado=EstadoOrden.pendiente)
    o2 = Orden(fecha=date.today(), numero_orden="MAS-2", origen="manual", estado=EstadoOrden.liquidada)
    db_session.add_all([o1, o2])
    db_session.flush()
    i1 = OrdenItem(
        orden_id=o1.id, fecha=date.today(), numero_orden="MAS-1", finca="F", producto="P",
        cantidad=Decimal("1"), unidad="kg", precio_unitario=Decimal("1"), total=Decimal("1"),
        estado=EstadoOrden.pendiente,
    )
    i2 = OrdenItem(
        orden_id=o2.id, fecha=date.today(), numero_orden="MAS-2", finca="F", producto="P",
        cantidad=Decimal("1"), unidad="kg", precio_unitario=Decimal("1"), total=Decimal("1"),
        estado=EstadoOrden.liquidada,
    )
    db_session.add_all([i1, i2])
    db_session.commit()

    resp = authenticated_client.put(
        "/api/v1/ordenes/grupos/estado-masivo",
        json={"orden_ids": [str(o1.id), str(o2.id)], "estado": "pagada"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["actualizadas"] == 1
    assert str(o2.id) in data["omitidas"]
    db_session.refresh(o1)
    db_session.refresh(i1)
    assert o1.estado == EstadoOrden.pagada
    assert i1.estado == EstadoOrden.pagada


def test_estado_masivo_rechaza_liquidada_como_destino(authenticated_client):
    resp = authenticated_client.put(
        "/api/v1/ordenes/grupos/estado-masivo",
        json={"orden_ids": [], "estado": "liquidada"},
    )
    assert resp.status_code == 400
```

- [ ] **Step 2: Verificar que falla**

Run: `cd backend && pytest tests/test_ordenes.py -k estado_masivo -v`
Expected: FAIL (404 o 405 — la ruta no existe; `/grupos/estado-masivo` no matchea `/grupos/{id}/estado`).

- [ ] **Step 3: Implementar el endpoint**

En `backend/app/routers/ordenes.py`, junto a los otros body models (después de `EstadoOrdenBody`, línea 59):

```python
class EstadoMasivoBody(BaseModel):
    orden_ids: List[UUID]
    estado: str
```

Insertar el endpoint INMEDIATAMENTE ANTES de `@router.put("/grupos/{id}/estado")` (línea 409) para que FastAPI no intente parsear `estado-masivo` como UUID en rutas `/grupos/{id}`:

```python
@router.put("/grupos/estado-masivo")
def actualizar_estado_ordenes_masivo(
    body: EstadoMasivoBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    nuevo_estado = _parse_estado_orden(body.estado)
    if nuevo_estado == EstadoOrden.liquidada:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El estado liquidada se asigna al guardar una liquidación",
        )

    ordenes = (
        db.query(Orden)
        .options(selectinload(Orden.items))
        .filter(Orden.id.in_(body.orden_ids))
        .all()
    )
    encontradas = {orden.id for orden in ordenes}
    omitidas = [str(oid) for oid in body.orden_ids if oid not in encontradas]

    actualizadas = 0
    try:
        for orden in ordenes:
            if any(item.estado == EstadoOrden.liquidada for item in orden.items):
                omitidas.append(str(orden.id))
                continue
            orden.estado = nuevo_estado
            for item in orden.items:
                item.estado = nuevo_estado
            actualizadas += 1
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    return {"actualizadas": actualizadas, "omitidas": omitidas}
```

- [ ] **Step 4: Verificar que pasa**

Run: `cd backend && pytest tests/test_ordenes.py -v`
Expected: PASS todos (incluidos los preexistentes).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/ordenes.py backend/tests/test_ordenes.py
git commit -m "feat(ordenes): endpoint masivo para cambiar estado de órdenes"
```

---

### Task 3: Frontend — seleccionar órdenes y marcarlas como pagadas

**Files:**
- Modify: `src/lib/api.ts` (junto a `updateEstadoOrdenGrupo`, línea 162)
- Modify: `src/context/AppContext.tsx` (junto a `updateEstadoOrdenMutation`, línea 201)
- Modify: `src/components/ordenes/OrdenesTab.tsx`

**Interfaces:**
- Consumes: `PUT /api/v1/ordenes/grupos/estado-masivo` (Task 2).
- Produces: `updateEstadoOrdenesMasivo(ordenIds: string[], estado: EstadoOrden): void` expuesto por `useApp()`.

- [ ] **Step 1: Función API**

En `src/lib/api.ts`, después de `updateEstadoOrdenGrupo` (línea 165):

```ts
export async function updateEstadoOrdenesMasivo(ordenIds: string[], estado: EstadoOrden) {
  const res = await api.put('/api/v1/ordenes/grupos/estado-masivo', toSnakeCase({ ordenIds, estado }));
  return toCamelCase<{ actualizadas: number; omitidas: string[] }>(res.data);
}
```

- [ ] **Step 2: Mutation y callback en AppContext**

En `src/context/AppContext.tsx`:

1. Importar: agregar `updateEstadoOrdenesMasivo as apiUpdateEstadoOrdenesMasivo` al import de `@/lib/api` (junto a `updateEstadoOrdenGrupo as apiUpdateEstadoOrdenGrupo`, línea 15).
2. En el tipo del contexto (junto a `updateEstadoOrden`, línea 51):

```ts
  updateEstadoOrdenesMasivo: (ordenIds: string[], estado: EstadoOrden) => void;
```

3. Después de `updateEstadoOrdenMutation` (línea 211):

```ts
  const updateEstadoOrdenesMasivoMutation = useMutation({
    mutationFn: ({ ordenIds, estado }: { ordenIds: string[]; estado: EstadoOrden }) =>
      apiUpdateEstadoOrdenesMasivo(ordenIds, estado),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      if (data.omitidas.length > 0) {
        toast.success(`${data.actualizadas} orden(es) actualizadas; ${data.omitidas.length} omitida(s) por tener ítems liquidados`);
      } else {
        toast.success(`${data.actualizadas} orden(es) actualizadas`);
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar órdenes');
    },
  });
```

4. Callback junto a `updateEstadoOrden` (línea 469) y exponerlo en el value del provider (junto a la línea 605):

```ts
  const updateEstadoOrdenesMasivo = useCallback(
    (ordenIds: string[], estado: EstadoOrden) => {
      updateEstadoOrdenesMasivoMutation.mutate({ ordenIds, estado });
    },
    [updateEstadoOrdenesMasivoMutation]
  );
```

- [ ] **Step 3: Selección en OrdenesTab**

En `src/components/ordenes/OrdenesTab.tsx`:

1. Obtener el callback del contexto: agregar `updateEstadoOrdenesMasivo` al destructuring de `useApp()` (línea 254).
2. Estado de selección junto a `expandedOrdenIds` (línea 306):

```ts
  const [selectedOrdenIds, setSelectedOrdenIds] = useState<Set<string>>(new Set());
```

3. Helpers después de `toggleCollapse` (línea 316 aprox.):

```ts
  const toggleSeleccionOrden = (id: string) => setSelectedOrdenIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
```

4. Debajo de la línea `const paginatedOrdenes = ...` (línea 375):

```ts
  const ordenesSeleccionables = ordenesAgrupadas.filter(o => o.estado !== 'liquidada');
  const todasSeleccionadas = ordenesSeleccionables.length > 0 &&
    ordenesSeleccionables.every(o => selectedOrdenIds.has(o.id));
  const toggleSeleccionarTodas = () => {
    setSelectedOrdenIds(todasSeleccionadas ? new Set() : new Set(ordenesSeleccionables.map(o => o.id)));
  };
  const handleMarcarPagadas = () => {
    updateEstadoOrdenesMasivo(Array.from(selectedOrdenIds), 'pagada');
    setSelectedOrdenIds(new Set());
  };
```

5. En la barra superior de la tabla (línea 1076, dentro del `div` con `flex items-center gap-3` que muestra el contador de órdenes), agregar antes del `<span>`:

```tsx
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-emerald-600"
                  checked={todasSeleccionadas}
                  onChange={toggleSeleccionarTodas}
                  aria-label="Seleccionar todas las órdenes"
                />
```

y después del `<span>` del contador:

```tsx
                {selectedOrdenIds.size > 0 && (
                  <Button
                    size="sm"
                    onClick={handleMarcarPagadas}
                    className="btn-primary-dark rounded-lg h-7 text-xs"
                  >
                    Marcar como pagadas ({selectedOrdenIds.size})
                  </Button>
                )}
```

6. Checkbox por orden: en la fila cabecera de cada orden (línea 1104-1110), el header es un `<button>` de ancho completo. Envolverlo:

```tsx
                  <div key={orden.id} className="group">
                    <div className="flex items-center pl-4 hover:bg-slate-50/70 transition-colors">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-emerald-600 shrink-0"
                        checked={selectedOrdenIds.has(orden.id)}
                        disabled={orden.estado === 'liquidada'}
                        onChange={() => toggleSeleccionOrden(orden.id)}
                        aria-label={`Seleccionar orden ${orden.numeroOrden}`}
                      />
                      <button
                        type="button"
                        onClick={() => toggleCollapse(orden.id)}
                        className="flex-1 flex items-center gap-3 px-3 py-3 text-left min-w-0"
                      >
```

(el contenido interno del botón no cambia; cerrar `</button></div>` donde antes cerraba `</button>`; el `key` se mantiene en el div exterior existente).

- [ ] **Step 4: Verificar**

Run: `pnpm build && pnpm lint`
Expected: sin errores. Verificación manual opcional con backend corriendo: seleccionar 2 órdenes pendientes → "Marcar como pagadas (2)" → badges cambian a Pagada.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/context/AppContext.tsx src/components/ordenes/OrdenesTab.tsx
git commit -m "feat(ordenes): selección múltiple y marcado masivo como pagadas"
```

---

### Task 4: Backend — edición masiva de tarifas

**Files:**
- Modify: `backend/app/schemas/tarifa_cliente_producto.py`
- Modify: `backend/app/routers/tarifas_cliente_producto.py` (insertar ANTES de `@router.put("/{id}")`, línea 119)
- Test: `backend/tests/test_tarifas_cliente_producto.py`

**Interfaces:**
- Produces: `PUT /api/v1/tarifas-cliente-producto/masivo` con body `{"ids": [UUID], "cambios": {"tipo"?: str, "valor"?: Decimal, "activo"?: bool}}` → `{"actualizadas": int}`. Campos omitidos/null no se tocan. Algún id inexistente → 404. Sin cambios → 400.

- [ ] **Step 1: Test que falla**

Agregar al final de `backend/tests/test_tarifas_cliente_producto.py` (revisar imports existentes del archivo; necesita `Decimal`, `Cliente`, `Comisionista`, `Producto`, `TarifaClienteProducto`, `TipoTarifa` — agregar los que falten):

```python
def test_actualizacion_masiva_de_tarifas(authenticated_client, db_session):
    cliente = Cliente(nombre="Cliente Masivo", tipo="individual")
    comisionista = Comisionista(nombre="Com Masivo")
    producto1 = Producto(nombre="Prod Masivo 1", unidad_comision="kg")
    producto2 = Producto(nombre="Prod Masivo 2", unidad_comision="kg")
    db_session.add_all([cliente, comisionista, producto1, producto2])
    db_session.flush()
    t1 = TarifaClienteProducto(
        comisionista_id=comisionista.id, cliente_id=cliente.id,
        producto_id=producto1.id, tipo=TipoTarifa.porcentaje, valor=Decimal("2"),
    )
    t2 = TarifaClienteProducto(
        comisionista_id=comisionista.id, cliente_id=cliente.id,
        producto_id=producto2.id, tipo=TipoTarifa.porcentaje, valor=Decimal("2"),
    )
    db_session.add_all([t1, t2])
    db_session.commit()

    resp = authenticated_client.put(
        "/api/v1/tarifas-cliente-producto/masivo",
        json={"ids": [str(t1.id), str(t2.id)], "cambios": {"valor": "3.5"}},
    )

    assert resp.status_code == 200
    assert resp.json()["actualizadas"] == 2
    db_session.refresh(t1)
    db_session.refresh(t2)
    assert t1.valor == Decimal("3.5")
    assert t2.valor == Decimal("3.5")
    # el tipo no se tocó
    assert t1.tipo == TipoTarifa.porcentaje


def test_actualizacion_masiva_id_inexistente(authenticated_client):
    import uuid
    resp = authenticated_client.put(
        "/api/v1/tarifas-cliente-producto/masivo",
        json={"ids": [str(uuid.uuid4())], "cambios": {"activo": False}},
    )
    assert resp.status_code == 404
```

- [ ] **Step 2: Verificar que falla**

Run: `cd backend && pytest tests/test_tarifas_cliente_producto.py -k masiva -v`
Expected: FAIL con 422 (la ruta `/{id}` intenta parsear "masivo" como UUID).

- [ ] **Step 3: Schemas**

En `backend/app/schemas/tarifa_cliente_producto.py`, al final:

```python
class TarifaCambiosMasivos(BaseModel):
    tipo: Optional[str] = None
    valor: Optional[Decimal] = None
    activo: Optional[bool] = None


class TarifaUpdateMasivo(BaseModel):
    ids: List[UUID]
    cambios: TarifaCambiosMasivos
```

- [ ] **Step 4: Endpoint**

En `backend/app/routers/tarifas_cliente_producto.py`: agregar `TarifaUpdateMasivo` al import de schemas (línea 16-20) e insertar ANTES de `@router.put("/{id}")` (línea 119):

```python
@router.put("/masivo")
def actualizar_tarifas_masivo(
    data: TarifaUpdateMasivo,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cambios = data.cambios.model_dump(exclude_none=True)
    if not cambios:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se especificó ningún cambio",
        )

    tarifas = (
        db.query(TarifaClienteProducto)
        .filter(TarifaClienteProducto.id.in_(data.ids))
        .all()
    )
    if len(tarifas) != len(set(data.ids)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alguna de las tarifas seleccionadas no existe",
        )

    try:
        for tarifa in tarifas:
            for campo, valor in cambios.items():
                setattr(tarifa, campo, valor)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    return {"actualizadas": len(tarifas)}
```

- [ ] **Step 5: Verificar que pasa**

Run: `cd backend && pytest tests/test_tarifas_cliente_producto.py -v`
Expected: PASS todos.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/tarifa_cliente_producto.py backend/app/routers/tarifas_cliente_producto.py backend/tests/test_tarifas_cliente_producto.py
git commit -m "feat(tarifas): endpoint de actualización masiva"
```

---

### Task 5: Frontend — edición múltiple en TarifasTab

**Files:**
- Modify: `src/lib/api.ts` (junto a `updateTarifaClienteProducto`, línea 373)
- Modify: `src/context/AppContext.tsx` (junto a `updateTarifaMutation`, línea 404)
- Modify: `src/components/tarifas/TarifasTab.tsx`

**Interfaces:**
- Consumes: `PUT /api/v1/tarifas-cliente-producto/masivo` (Task 4).
- Produces: `updateTarifasMasivo(ids: string[], cambios: { tipo?: 'porcentaje' | 'fijo_kg' | 'fijo_unidad'; valor?: number; activo?: boolean }): void` en `useApp()`.

- [ ] **Step 1: Función API**

En `src/lib/api.ts` después de `updateTarifaClienteProducto`:

```ts
export async function updateTarifasClienteProductoMasivo(
  ids: string[],
  cambios: { tipo?: string; valor?: number; activo?: boolean }
) {
  const res = await api.put('/api/v1/tarifas-cliente-producto/masivo', toSnakeCase({ ids, cambios }));
  return toCamelCase<{ actualizadas: number }>(res.data);
}
```

- [ ] **Step 2: Mutation en AppContext**

En `src/context/AppContext.tsx`:

1. Importar: `updateTarifasClienteProductoMasivo as apiUpdateTarifasMasivo` en el import de `@/lib/api`.
2. En el tipo del contexto (junto a `updateTarifa`):

```ts
  updateTarifasMasivo: (ids: string[], cambios: { tipo?: 'porcentaje' | 'fijo_kg' | 'fijo_unidad'; valor?: number; activo?: boolean }) => void;
```

3. Después de `updateTarifaMutation` (línea 404):

```ts
  const updateTarifasMasivoMutation = useMutation({
    mutationFn: ({ ids, cambios }: { ids: string[]; cambios: { tipo?: string; valor?: number; activo?: boolean } }) =>
      apiUpdateTarifasMasivo(ids, cambios),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tarifas-cliente-producto'] });
      toast.success(`${data.actualizadas} tarifas actualizadas`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar tarifas');
    },
  });
```

4. Callback junto a `updateTarifa` (línea ~583) y exponerlo en el value del provider:

```ts
  const updateTarifasMasivo = useCallback(
    (ids: string[], cambios: { tipo?: 'porcentaje' | 'fijo_kg' | 'fijo_unidad'; valor?: number; activo?: boolean }) => {
      updateTarifasMasivoMutation.mutate({ ids, cambios });
    },
    [updateTarifasMasivoMutation]
  );
```

- [ ] **Step 3: Selección y modal en TarifasTab**

En `src/components/tarifas/TarifasTab.tsx`:

1. Obtener `updateTarifasMasivo` de `useApp()` (línea 76-84).
2. Estado (junto a línea 96):

```ts
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState<{ tipo: string; valor: string; activo: string }>({
    tipo: 'sin_cambio',
    valor: '',
    activo: 'sin_cambio',
  });
```

3. Helpers (después de `handleConfirmDelete`, línea 292):

```ts
  const toggleSeleccion = (id: string) => setSeleccionadas(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const todasFiltradasSeleccionadas = filtered.length > 0 && filtered.every(t => seleccionadas.has(t.id));
  const toggleSeleccionTodas = () => {
    setSeleccionadas(todasFiltradasSeleccionadas ? new Set() : new Set(filtered.map(t => t.id)));
  };

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cambios: { tipo?: 'porcentaje' | 'fijo_kg' | 'fijo_unidad'; valor?: number; activo?: boolean } = {};
    if (bulkForm.tipo !== 'sin_cambio') cambios.tipo = bulkForm.tipo as 'porcentaje' | 'fijo_kg' | 'fijo_unidad';
    if (bulkForm.valor !== '' && parseFloat(bulkForm.valor) > 0) cambios.valor = parseFloat(bulkForm.valor);
    if (bulkForm.activo !== 'sin_cambio') cambios.activo = bulkForm.activo === 'activa';
    if (Object.keys(cambios).length === 0) {
      toast.error('Indica al menos un cambio');
      return;
    }
    updateTarifasMasivo(Array.from(seleccionadas), cambios);
    setSeleccionadas(new Set());
    setBulkForm({ tipo: 'sin_cambio', valor: '', activo: 'sin_cambio' });
    setBulkOpen(false);
  };
```

4. Botón en la barra de acciones (junto a "Nueva Tarifa", línea 440):

```tsx
              {seleccionadas.size > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setBulkOpen(true)}
                  className="rounded-xl border-slate-200 text-slate-600"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar seleccionadas ({seleccionadas.size})
                </Button>
              )}
```

5. Columna de checkbox en la tabla: en `TableHeader` (línea 685), antes de la columna "Comisionista":

```tsx
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-emerald-600"
                      checked={todasFiltradasSeleccionadas}
                      onChange={toggleSeleccionTodas}
                      aria-label="Seleccionar todas las tarifas"
                    />
                  </TableHead>
```

y en cada `TableRow` (línea 700), primera celda:

```tsx
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-emerald-600"
                        checked={seleccionadas.has(t.id)}
                        onChange={() => toggleSeleccion(t.id)}
                        aria-label={`Seleccionar tarifa de ${getComisionistaTarifa(t)}`}
                      />
                    </TableCell>
```

6. Dialog de edición masiva (después del Dialog de confirmación de borrado, línea 671):

```tsx
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle>Editar {seleccionadas.size} tarifas</DialogTitle>
            <DialogDescription>
              Solo se aplican los campos que cambies; el resto queda igual.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBulkSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={bulkForm.tipo} onValueChange={(v) => setBulkForm({ ...bulkForm, tipo: v ?? 'sin_cambio' })}>
                <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                  <span className="flex flex-1 truncate text-left">
                    {bulkForm.tipo === 'sin_cambio' ? 'Sin cambio' : bulkForm.tipo === 'porcentaje' ? 'Porcentaje (%)' : bulkForm.tipo === 'fijo_kg' ? 'Fijo por kg (USD)' : 'Fijo por unidad (USD)'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sin_cambio">Sin cambio</SelectItem>
                  <SelectItem value="porcentaje">Porcentaje (%)</SelectItem>
                  <SelectItem value="fijo_kg">Fijo por kg (USD)</SelectItem>
                  <SelectItem value="fijo_unidad">Fijo por unidad (USD)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor (vacío = sin cambio)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={bulkForm.valor}
                onChange={(e) => setBulkForm({ ...bulkForm, valor: e.target.value })}
                className="bg-white border-slate-200 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={bulkForm.activo} onValueChange={(v) => setBulkForm({ ...bulkForm, activo: v ?? 'sin_cambio' })}>
                <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                  <span className="flex flex-1 truncate text-left">
                    {bulkForm.activo === 'sin_cambio' ? 'Sin cambio' : bulkForm.activo === 'activa' ? 'Activa' : 'Inactiva'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sin_cambio">Sin cambio</SelectItem>
                  <SelectItem value="activa">Activa</SelectItem>
                  <SelectItem value="inactiva">Inactiva</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setBulkOpen(false)} className="rounded-xl border-slate-200">
                Cancelar
              </Button>
              <Button type="submit" className="btn-primary-dark rounded-xl">
                Aplicar a {seleccionadas.size} tarifas
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 4: Verificar**

Run: `pnpm build && pnpm lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/context/AppContext.tsx src/components/tarifas/TarifasTab.tsx
git commit -m "feat(tarifas): edición múltiple de tarifas seleccionadas"
```

---

### Task 6: Campos de umbral por volumen (datos, sin cálculo)

**Files:**
- Create: `backend/alembic/versions/e7a1b2c3d4f5_agregar_umbral_volumen_a_tarifas.py`
- Modify: `backend/app/models/comisionista.py` (clase `Tarifa`)
- Modify: `backend/app/models/tarifa_cliente_producto.py`
- Modify: `backend/app/schemas/tarifa_cliente_producto.py`
- Modify: `backend/app/schemas/comisionista.py` (clase `TarifaBase`)
- Modify: `backend/app/routers/tarifas_cliente_producto.py` (create/update/`_enriquecer_respuesta`)
- Modify: `backend/app/routers/comisionistas.py` (constructores `Tarifa(...)` en crear/actualizar)
- Modify: `src/types/index.ts`
- Modify: `src/components/tarifas/TarifasTab.tsx` (form)

**Interfaces:**
- Produces: columnas `umbral_kg NUMERIC(12,2) NULL` y `valor_sobre_umbral NUMERIC(10,4) NULL` en `tarifas` y `tarifas_cliente_producto`; expuestas como `umbralKg`/`valorSobreUmbral` en las APIs de tarifas específicas y (snake_case→camel vía transform) en tarifas globales. `umbral_kg IS NULL` → comportamiento actual intacto.

- [ ] **Step 1: Migración**

Crear `backend/alembic/versions/e7a1b2c3d4f5_agregar_umbral_volumen_a_tarifas.py`:

```python
"""agregar umbral de volumen a tarifas

Revision ID: e7a1b2c3d4f5
Revises: aca4cb479a15
Create Date: 2026-07-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7a1b2c3d4f5"
down_revision: Union[str, None] = "aca4cb479a15"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tarifas", sa.Column("umbral_kg", sa.Numeric(12, 2), nullable=True))
    op.add_column("tarifas", sa.Column("valor_sobre_umbral", sa.Numeric(10, 4), nullable=True))
    op.add_column("tarifas_cliente_producto", sa.Column("umbral_kg", sa.Numeric(12, 2), nullable=True))
    op.add_column("tarifas_cliente_producto", sa.Column("valor_sobre_umbral", sa.Numeric(10, 4), nullable=True))


def downgrade() -> None:
    op.drop_column("tarifas_cliente_producto", "valor_sobre_umbral")
    op.drop_column("tarifas_cliente_producto", "umbral_kg")
    op.drop_column("tarifas", "valor_sobre_umbral")
    op.drop_column("tarifas", "umbral_kg")
```

- [ ] **Step 2: Modelos**

En `backend/app/models/comisionista.py`, clase `Tarifa` (después de `proveedores_excluidos`, línea 36):

```python
    # Regla por volumen: si el comisionista acumula >= umbral_kg en la liquidación,
    # la comisión pasa a fijo_kg con valor_sobre_umbral (caso Naranjo).
    umbral_kg = Column(Numeric(12, 2), nullable=True)
    valor_sobre_umbral = Column(Numeric(10, 4), nullable=True)
```

En `backend/app/models/tarifa_cliente_producto.py` (después de `activo`, línea 47), las mismas dos columnas.

- [ ] **Step 3: Schemas**

`backend/app/schemas/tarifa_cliente_producto.py` — en `TarifaClienteProductoBase` (después de `valor`, línea 18) Y en `TarifaClienteProductoResponse` (después de `activo`, línea 41):

```python
    umbral_kg: Optional[Decimal] = Field(default=None, alias="umbralKg")
    valor_sobre_umbral: Optional[Decimal] = Field(default=None, alias="valorSobreUmbral")
```

`backend/app/schemas/comisionista.py` — en `TarifaBase` (después de `proveedores_excluidos`):

```python
    umbral_kg: Optional[Decimal] = None
    valor_sobre_umbral: Optional[Decimal] = None
```

(agregar `Optional` al import de `typing`).

- [ ] **Step 4: Routers**

`backend/app/routers/tarifas_cliente_producto.py`:
- `_enriquecer_respuesta` (línea 28-43): agregar `umbralKg=tarifa.umbral_kg, valorSobreUmbral=tarifa.valor_sobre_umbral,`.
- `crear_tarifa_cliente_producto` (constructor, línea 89-98): agregar `umbral_kg=data.umbral_kg, valor_sobre_umbral=data.valor_sobre_umbral,`.
- `actualizar_tarifa_cliente_producto` (asignaciones, líneas 143-150): agregar `tarifa.umbral_kg = data.umbral_kg` y `tarifa.valor_sobre_umbral = data.valor_sobre_umbral`.

`backend/app/routers/comisionistas.py`: en los dos loops que construyen `Tarifa(...)` desde `data.tarifas` (líneas ~39 y ~79), agregar `umbral_kg=t.umbral_kg, valor_sobre_umbral=t.valor_sobre_umbral,` a los kwargs del constructor.

- [ ] **Step 5: Tipos frontend y formulario**

`src/types/index.ts`:
- `TarifaComision` (línea 8): agregar `umbralKg?: number; valorSobreUmbral?: number;`
- `TarifaClienteProducto` (línea 104): agregar `umbralKg?: number; valorSobreUmbral?: number;`

`src/components/tarifas/TarifasTab.tsx`:
- Agregar `umbralKg: string; valorSobreUmbral: string;` al tipo del `form` y `umbralKg: '', valorSobreUmbral: ''` a los tres lugares que arman el objeto (estado inicial línea 112, `resetForm` línea 210, `handleEdit` línea 267 con `umbralKg: t.umbralKg?.toString() || '', valorSobreUmbral: t.valorSobreUmbral?.toString() || ''`).
- En `handleSubmit`, agregar al `payload` (línea 244):

```ts
      umbralKg: form.umbralKg ? parseFloat(form.umbralKg) : undefined,
      valorSobreUmbral: form.valorSobreUmbral ? parseFloat(form.valorSobreUmbral) : undefined,
```

- En el Dialog, después del grid Tipo/Valor (línea 599):

```tsx
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="umbralKg">Umbral (kg, opcional)</Label>
                <Input
                  id="umbralKg"
                  type="number"
                  step="1"
                  min="0"
                  value={form.umbralKg}
                  onChange={(e) => setForm({ ...form, umbralKg: e.target.value })}
                  placeholder="Ej: 1000"
                  className="bg-white border-slate-200 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valorSobreUmbral">Valor sobre umbral ($/kg)</Label>
                <Input
                  id="valorSobreUmbral"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.valorSobreUmbral}
                  onChange={(e) => setForm({ ...form, valorSobreUmbral: e.target.value })}
                  placeholder="Ej: 3.50"
                  className="bg-white border-slate-200 rounded-xl"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Si el comisionista acumula el umbral en kg dentro de una liquidación, toda su comisión se paga a $/kg con el valor sobre umbral.
            </p>
```

- [ ] **Step 6: Verificar**

Run: `cd backend && pytest` y `pnpm build`
Expected: PASS / build OK. (Los tests usan `Base.metadata.create_all`, no Alembic, así que toman las columnas nuevas de los modelos.)

- [ ] **Step 7: Commit**

```bash
git add backend/alembic/versions/e7a1b2c3d4f5_agregar_umbral_volumen_a_tarifas.py backend/app/models/ backend/app/schemas/ backend/app/routers/ src/types/index.ts src/components/tarifas/TarifasTab.tsx
git commit -m "feat(tarifas): campos de umbral por volumen (umbral_kg, valor_sobre_umbral)"
```

---

### Task 7: Cálculo con umbral en el backend (liquidación)

**Files:**
- Modify: `backend/app/services/liquidacion.py`
- Test: `backend/tests/test_liquidacion_service.py`

**Interfaces:**
- Consumes: columnas de Task 6.
- Produces: `_comision_con_umbral(orden_item, tarifa, kg_acumulado) -> tuple[str, Decimal, Decimal] | None` (retorna `(tipo_snapshot, valor_snapshot, comision)` o `None` si no aplica). `crear_liquidacion` acumula kg por comisionista sobre los ítems de la liquidación y aplica el umbral tanto a tarifas específicas como globales.

- [ ] **Step 1: Tests que fallan**

Agregar al final de `backend/tests/test_liquidacion_service.py`:

```python
def _setup_umbral(db_session, umbral, valor_sobre_umbral):
    cliente = Cliente(nombre="Cliente Umbral", tipo="individual", retencion_porcentaje=Decimal("1.75"))
    comisionista = Comisionista(nombre="NARANJO")
    producto = Producto(nombre="Producto Umbral", unidad_comision="kg")
    db_session.add_all([cliente, comisionista, producto])
    db_session.flush()
    tarifa = TarifaClienteProducto(
        comisionista_id=comisionista.id,
        cliente_id=cliente.id,
        producto_id=producto.id,
        tipo=TipoTarifa.porcentaje,
        valor=Decimal("2"),
        umbral_kg=umbral,
        valor_sobre_umbral=valor_sobre_umbral,
    )
    db_session.add(tarifa)
    return cliente, comisionista, producto


def _orden_pagada(db_session, cliente, producto, comisionista, numero, cantidad_kg):
    orden = Orden(fecha=date.today(), numero_orden=numero, origen="manual", estado=EstadoOrden.pagada)
    db_session.add(orden)
    db_session.flush()
    oi = OrdenItem(
        orden_id=orden.id, fecha=date.today(), numero_orden=numero,
        finca="-", producto=producto.nombre, cantidad=cantidad_kg, unidad="kg",
        precio_unitario=Decimal("1"), total=cantidad_kg,
        estado=EstadoOrden.pagada, cliente_id=cliente.id, producto_id=producto.id,
    )
    db_session.add(oi)
    db_session.flush()
    db_session.add(Asignacion(orden_item_id=oi.id, comisionista_id=comisionista.id))
    return oi


def test_umbral_alcanzado_aplica_valor_sobre_umbral(db_session):
    cliente, comisionista, producto = _setup_umbral(db_session, Decimal("1000"), Decimal("3.50"))
    i1 = _orden_pagada(db_session, cliente, producto, comisionista, "UMB-1", Decimal("600"))
    i2 = _orden_pagada(db_session, cliente, producto, comisionista, "UMB-2", Decimal("600"))
    db_session.commit()

    liq, _ = crear_liquidacion(db_session, "Liquidación umbral", [i1.id, i2.id])

    tarifas = [t for li in liq.items for t in li.tarifas]
    assert len(tarifas) == 2
    # 1200 kg acumulados >= 1000 → toda la comisión a 3.50 $/kg
    assert all(t.tipo_snapshot == "fijo_kg" for t in tarifas)
    assert all(t.valor_snapshot == Decimal("3.50") for t in tarifas)
    assert sum(t.comision_calculada for t in tarifas) == Decimal("4200.00")


def test_umbral_no_alcanzado_usa_tarifa_normal(db_session):
    cliente, comisionista, producto = _setup_umbral(db_session, Decimal("1000"), Decimal("3.50"))
    i1 = _orden_pagada(db_session, cliente, producto, comisionista, "UMB-3", Decimal("400"))
    db_session.commit()

    liq, _ = crear_liquidacion(db_session, "Liquidación sin umbral", [i1.id])

    tarifas = [t for li in liq.items for t in li.tarifas]
    assert len(tarifas) == 1
    # 400 kg < 1000 → tarifa porcentaje normal: 400 * (1 - 1.75%) * 2% = 7.86
    assert tarifas[0].tipo_snapshot == "porcentaje"
    assert tarifas[0].comision_calculada == Decimal("400") * (Decimal("1") - Decimal("0.0175")) * Decimal("0.02")
```

- [ ] **Step 2: Verificar que fallan**

Run: `cd backend && pytest tests/test_liquidacion_service.py -k umbral -v`
Expected: FAIL — el primero con `tipo_snapshot == "porcentaje"` en vez de `"fijo_kg"`.

- [ ] **Step 3: Implementar**

En `backend/app/services/liquidacion.py`:

1. Helper después de `_calcular_comision_especifica` (línea 361):

```python
def _comision_con_umbral(
    orden_item: OrdenItem,
    tarifa: Tarifa | TarifaClienteProducto,
    kg_acumulado: Decimal,
) -> tuple[str, Decimal, Decimal] | None:
    """Regla por volumen: si el comisionista acumula >= umbral_kg en la liquidación,
    la comisión del ítem se paga como fijo_kg con valor_sobre_umbral.

    Devuelve (tipo_snapshot, valor_snapshot, comision) o None si no aplica.
    Debe mantenerse en paridad con comisionConUmbral() de src/lib/export-utils.ts.
    """
    if tarifa.umbral_kg is None or tarifa.valor_sobre_umbral is None:
        return None
    if kg_acumulado < tarifa.umbral_kg:
        return None
    comision = _cantidad_para_tarifa_kg(orden_item) * tarifa.valor_sobre_umbral
    return (TipoTarifa.fijo_kg.value, tarifa.valor_sobre_umbral, comision)
```

2. En `crear_liquidacion`, después de construir la lista `orden_items_pagados` y antes del bucle de ítems (después de la línea 416 `db.flush()`):

```python
    # Volumen acumulado por comisionista dentro de ESTA liquidación (regla por umbral).
    kg_por_comisionista: dict[UUID, Decimal] = {}
    for oi in orden_items_pagados:
        for asignacion in oi.asignaciones:
            cid = asignacion.comisionista_id
            kg_por_comisionista[cid] = (
                kg_por_comisionista.get(cid, Decimal("0")) + _cantidad_para_tarifa_kg(oi)
            )
```

3. Reemplazar la rama de tarifa específica (líneas 445-455):

```python
            if tarifa_esp:
                umbral = _comision_con_umbral(
                    oi, tarifa_esp, kg_por_comisionista.get(comisionista.id, Decimal("0"))
                )
                if umbral:
                    tipo_snapshot, valor_snapshot, comision = umbral
                else:
                    comision = _calcular_comision_especifica(db, oi, tarifa_esp)
                    tipo_snapshot = tarifa_esp.tipo.value
                    valor_snapshot = tarifa_esp.valor
                lit = LiquidacionItemTarifa(
                    liquidacion_item_id=li.id,
                    comisionista_id=comisionista.id,
                    comisionista_nombre_snapshot=comisionista.nombre,
                    tipo_snapshot=tipo_snapshot,
                    valor_snapshot=valor_snapshot,
                    comision_calculada=comision,
                )
                db.add(lit)
```

4. Reemplazar el interior del fallback a tarifas globales (líneas 474-490), manteniendo el filtro de proveedores excluidos:

```python
                    for tarifa in comisionista.tarifas:
                        if tarifa.proveedores_excluidos:
                            excluidos = [
                                _normalizar_texto(p) for p in tarifa.proveedores_excluidos
                            ]
                            if proveedor_orden in excluidos:
                                continue
                        umbral = _comision_con_umbral(
                            oi, tarifa, kg_por_comisionista.get(comisionista.id, Decimal("0"))
                        )
                        if umbral:
                            tipo_snapshot, valor_snapshot, comision = umbral
                        else:
                            comision = _calcular_comision_con_tarifa(oi, tarifa)
                            tipo_snapshot = tarifa.tipo.value
                            valor_snapshot = tarifa.valor
                        lit = LiquidacionItemTarifa(
                            liquidacion_item_id=li.id,
                            comisionista_id=comisionista.id,
                            comisionista_nombre_snapshot=comisionista.nombre,
                            tipo_snapshot=tipo_snapshot,
                            valor_snapshot=valor_snapshot,
                            comision_calculada=comision,
                        )
                        db.add(lit)
```

- [ ] **Step 4: Verificar que pasan**

Run: `cd backend && pytest tests/test_liquidacion_service.py -v && pytest`
Expected: PASS todos (los tests preexistentes no deben romperse: sin umbral configurado el flujo es idéntico).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/liquidacion.py backend/tests/test_liquidacion_service.py
git commit -m "feat(liquidacion): regla de comisión por umbral de volumen acumulado"
```

---

### Task 8: Paridad frontend del umbral (preview y exportación)

**Files:**
- Modify: `src/lib/export-utils.ts`
- Modify: `src/components/liquidacion/LiquidacionTab.tsx`

**Interfaces:**
- Consumes: `umbralKg`/`valorSobreUmbral` en `TarifaClienteProducto` y `TarifaComision` (Task 6).
- Produces:
  - `getCantidadParaTarifaKg(item: OrdenItem): number` pasa a ser exportada.
  - `calcularDetalleComision(item, comisionista, tarifas, kgAcumulado?: number)` — 4º parámetro opcional.
  - `calcularComision(item, comisionista, kgAcumulado?: number)` — 3º parámetro opcional.
  - `exportarPDF(...)` y `exportarExcel(...)` aceptan un último parámetro opcional `kgAcumuladoPorComisionista?: Map<string, number>`.
  - Sin `kgAcumulado`, el comportamiento es idéntico al actual (los reportes de ReportesTab NO aplican umbral: la regla es por liquidación, no por rango de fechas).

- [ ] **Step 1: Helper de umbral y cantidad exportada**

En `src/lib/export-utils.ts`:

1. Línea 52: `function getCantidadParaTarifaKg` → `export function getCantidadParaTarifaKg`.
2. Después de `getCantidadParaTarifaKg` (línea 117), agregar:

```ts
// Regla por volumen: paridad obligatoria con _comision_con_umbral() de
// backend/app/services/liquidacion.py. El acumulado es por comisionista
// dentro de la liquidación en curso.
function comisionConUmbral(
  item: OrdenItem,
  tarifa: { umbralKg?: number | string | null; valorSobreUmbral?: number | string | null },
  kgAcumulado?: number
): { comision: number; tarifasLabel: string } | undefined {
  if (tarifa.umbralKg == null || tarifa.valorSobreUmbral == null) return undefined;
  const umbralKg = Number(tarifa.umbralKg);
  const valorSobreUmbral = Number(tarifa.valorSobreUmbral);
  if ((kgAcumulado ?? 0) < umbralKg) return undefined;
  return {
    comision: getCantidadParaTarifaKg(item) * valorSobreUmbral,
    tarifasLabel: `$${valorSobreUmbral.toFixed(3)}/kg (≥${umbralKg} kg)`,
  };
}
```

- [ ] **Step 2: Enhebrar kgAcumulado en el cálculo**

1. `calcularComision` (línea 249) — nueva firma y chequeo de umbral por tarifa global:

```ts
export function calcularComision(item: OrdenItem, comisionista: Comisionista | undefined, kgAcumulado?: number): number {
  if (!comisionista) return 0;
  const proveedorOrden = normalizarTexto(item.proveedor || '');
  return comisionista.tarifas.reduce((sum, tarifa) => {
    if (tarifa.proveedoresExcluidos?.length) {
      const excluidos = tarifa.proveedoresExcluidos.map(normalizarTexto);
      if (excluidos.includes(proveedorOrden)) {
        return sum;
      }
    }
    const umbral = comisionConUmbral(item, tarifa, kgAcumulado);
    if (umbral) return sum + umbral.comision;
    return sum + calcularComisionPorTarifa(item, tarifa);
  }, 0);
}
```

2. `calcularDetalleComision` (línea 298) — nueva firma:

```ts
export function calcularDetalleComision(
  item: OrdenItem,
  comisionista: Comisionista,
  tarifas: TarifaClienteProducto[],
  kgAcumulado?: number
): { comision: number; tarifasLabel: string } {
  const tarifaEspecifica = encontrarTarifaEspecifica(item, comisionista.id, tarifas);
  if (tarifaEspecifica) {
    const umbral = comisionConUmbral(item, tarifaEspecifica, kgAcumulado);
    if (umbral) return umbral;
    return {
      comision: calcularComisionPorTarifaEspecifica(item, tarifaEspecifica),
      tarifasLabel: getTarifaLabel(tarifaEspecifica),
    };
  }

  // Si el comisionista tiene tarifas específicas configuradas pero ninguna
  // aplica a este item, no debe hacer fallback a tarifas globales.
  const tieneTarifasEspecificas = tarifas.some(
    (t) => t.comisionistaId === comisionista.id
  );
  if (tieneTarifasEspecificas) {
    return { comision: 0, tarifasLabel: '—' };
  }

  return {
    comision: calcularComision(item, comisionista, kgAcumulado),
    tarifasLabel: getTarifasLabel(comisionista) || 'Sin tarifa configurada',
  };
}
```

3. `exportarPDF` (línea 326) y `exportarExcel` (línea 515): agregar último parámetro `kgAcumuladoPorComisionista?: Map<string, number>` y en sus tres llamadas internas a `calcularDetalleComision(item, com, tarifasClienteProducto)` (líneas 426, 447 y 601) pasar `kgAcumuladoPorComisionista?.get(comId)` como 4º argumento.

- [ ] **Step 3: LiquidacionTab — acumulado y paso a cálculo/exports**

En `src/components/liquidacion/LiquidacionTab.tsx`:

1. Importar `getCantidadParaTarifaKg` junto a `calcularDetalleComision` (línea 8).
2. Después de `selectedFiltered`... — ojo: `itemsConComision` (línea 92) se calcula antes; declarar el acumulado ANTES de `itemsConComision`, después de `toggleTodos` (línea 88):

```ts
  // Volumen acumulado por comisionista sobre las órdenes SELECCIONADAS
  // (paridad con crear_liquidacion del backend, que acumula sobre los ítems enviados).
  const kgPorComisionista = useMemo(() => {
    const map = new Map<string, number>();
    filteredItems
      .filter(i => !excludedIds.has(ordenKey(i)))
      .forEach(item => {
        item.comisionistas.forEach(a => {
          map.set(a.comisionistaId, (map.get(a.comisionistaId) || 0) + getCantidadParaTarifaKg(item));
        });
      });
    return map;
  }, [filteredItems, excludedIds]);
```

3. En `itemsConComision` (línea 99), pasar el acumulado:

```ts
          ...calcularDetalleComision(item, comisionista, tarifasClienteProducto, kgPorComisionista.get(a.comisionistaId)),
```

y agregar `kgPorComisionista` al array de dependencias del `useMemo` (línea 105) y `excludedIds` indirectamente ya entra vía `kgPorComisionista`.

4. En `handleExportPDF` (línea 161) y `handleExportExcel` (línea 171), pasar el mapa como último argumento:

```ts
    exportarPDF(selectedFiltered, comisionistas, 'Liquidacion', com?.nombre, tarifasClienteProducto, undefined, kgPorComisionista);
    exportarExcel(selectedFiltered, comisionistas, 'Liquidacion', com?.nombre, tarifasClienteProducto, undefined, kgPorComisionista);
```

(el 6º parámetro `comisionesSnapshot` queda `undefined`, igual que hoy que se omite).

Nota asumida: los ítems excluidos que siguen visibles en la tabla se muestran con el acumulado de la selección actual; es informativo, no se guardan.

- [ ] **Step 4: Verificar paridad manualmente**

Run: `pnpm build && pnpm lint`
Expected: sin errores.

Con backend corriendo (`docker-compose up` + `pnpm dev`): crear una tarifa con umbral 1000 / valor 3,50 para un comisionista, cargar dos órdenes de 600 kg asignadas a él, marcarlas pagadas, y comprobar que (a) el preview de Liquidación muestra `$3.500/kg (≥1000 kg)` y comisión 4200, y (b) al guardar la liquidación, el historial muestra la misma cifra (snapshot del backend). **Si difieren, es un bug de paridad: detenerse y corregir antes de continuar.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/export-utils.ts src/components/liquidacion/LiquidacionTab.tsx
git commit -m "feat(liquidacion): paridad frontend de la regla por umbral de volumen"
```

---

### Task 9: Backend — grupos de proveedores

**Files:**
- Create: `backend/app/models/grupo.py`
- Modify: `backend/app/models/proveedor.py`
- Create: `backend/alembic/versions/f8b2c3d4e5a6_crear_grupos_y_grupo_en_proveedores.py`
- Create: `backend/app/schemas/grupo.py`
- Modify: `backend/app/schemas/proveedor.py`
- Create: `backend/app/routers/grupos.py`
- Modify: `backend/app/routers/proveedores.py`
- Modify: `backend/app/main.py` (registrar router)
- Test: `backend/tests/test_grupos.py` (nuevo)

**Interfaces:**
- Produces:
  - Tabla `grupos` (id, nombre unique, created_at) y columna `proveedores.grupo_id` (FK nullable, `ON DELETE SET NULL`).
  - `GET/POST /api/v1/grupos/`, `PUT/DELETE /api/v1/grupos/{id}`.
  - `PUT /api/v1/proveedores/{id}` con body `{"grupo_id": UUID | null}`.
  - `GET /api/v1/proveedores/` ahora incluye `grupoId` y `grupo` (nombre) por proveedor.

- [ ] **Step 1: Test que falla**

Crear `backend/tests/test_grupos.py`:

```python
from app.models.proveedor import Proveedor


def test_crud_grupos_y_asignacion_a_proveedor(authenticated_client, db_session):
    proveedor = Proveedor(nombre="PROVEEDOR TEST GRUPO")
    db_session.add(proveedor)
    db_session.commit()

    # Crear grupo
    resp = authenticated_client.post("/api/v1/grupos/", json={"nombre": "Grupo Santa Priscila"})
    assert resp.status_code == 201
    grupo_id = resp.json()["id"]

    # Listar
    resp = authenticated_client.get("/api/v1/grupos/")
    assert resp.status_code == 200
    assert any(g["nombre"] == "Grupo Santa Priscila" for g in resp.json())

    # Asignar a proveedor
    resp = authenticated_client.put(
        f"/api/v1/proveedores/{proveedor.id}", json={"grupo_id": grupo_id}
    )
    assert resp.status_code == 200
    assert resp.json()["grupoId"] == grupo_id
    assert resp.json()["grupo"] == "Grupo Santa Priscila"

    # El listado de proveedores incluye el grupo
    resp = authenticated_client.get("/api/v1/proveedores/")
    encontrado = next(p for p in resp.json() if p["nombre"] == "PROVEEDOR TEST GRUPO")
    assert encontrado["grupo"] == "Grupo Santa Priscila"

    # Desasignar
    resp = authenticated_client.put(
        f"/api/v1/proveedores/{proveedor.id}", json={"grupo_id": None}
    )
    assert resp.status_code == 200
    assert resp.json()["grupoId"] is None

    # Eliminar grupo
    resp = authenticated_client.delete(f"/api/v1/grupos/{grupo_id}")
    assert resp.status_code == 204


def test_grupo_nombre_duplicado(authenticated_client):
    resp = authenticated_client.post("/api/v1/grupos/", json={"nombre": "Repetido"})
    assert resp.status_code == 201
    resp = authenticated_client.post("/api/v1/grupos/", json={"nombre": "Repetido"})
    assert resp.status_code == 409
```

Run: `cd backend && pytest tests/test_grupos.py -v`
Expected: FAIL (404, rutas inexistentes).

- [ ] **Step 2: Modelos**

Crear `backend/app/models/grupo.py`:

```python
from sqlalchemy import Column, String
from app.models.base import BaseModel


class Grupo(BaseModel):
    """Grupo de empresas al que pertenecen las razones sociales (proveedores).

    ponytail: modelado plano; los "sectores" del grupo quedan fuera hasta que
    haya un caso de uso concreto (ver spec 2026-07-01).
    """

    __tablename__ = "grupos"

    nombre = Column(String, nullable=False, unique=True)
```

`backend/app/models/proveedor.py` — reemplazar por:

```python
from sqlalchemy import Column, ForeignKey, String, Uuid
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class Proveedor(BaseModel):
    __tablename__ = "proveedores"

    nombre = Column(String, nullable=False, unique=True)
    grupo_id = Column(
        Uuid, ForeignKey("grupos.id", ondelete="SET NULL"), nullable=True
    )

    grupo = relationship("Grupo")
```

Registrar el modelo en `backend/app/models/__init__.py`: agregar `from app.models.grupo import Grupo` (después del import de `Proveedor`, línea 10) y `"Grupo",` a la lista `__all__`.

- [ ] **Step 3: Migración**

Crear `backend/alembic/versions/f8b2c3d4e5a6_crear_grupos_y_grupo_en_proveedores.py`:

```python
"""crear grupos y grupo_id en proveedores

Revision ID: f8b2c3d4e5a6
Revises: e7a1b2c3d4f5
Create Date: 2026-07-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f8b2c3d4e5a6"
down_revision: Union[str, None] = "e7a1b2c3d4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "grupos",
        sa.Column("nombre", sa.String(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("nombre"),
    )
    op.add_column("proveedores", sa.Column("grupo_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_proveedores_grupo_id", "proveedores", "grupos", ["grupo_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_proveedores_grupo_id", "proveedores", type_="foreignkey")
    op.drop_column("proveedores", "grupo_id")
    op.drop_table("grupos")
```

- [ ] **Step 4: Schemas**

Crear `backend/app/schemas/grupo.py`:

```python
from __future__ import annotations

from uuid import UUID
from pydantic import BaseModel, ConfigDict


class GrupoCreate(BaseModel):
    nombre: str


class GrupoResponse(BaseModel):
    id: UUID
    nombre: str

    model_config = ConfigDict(from_attributes=True)
```

`backend/app/schemas/proveedor.py` — reemplazar por:

```python
from __future__ import annotations

from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class ProveedorResponse(BaseModel):
    id: UUID
    nombre: str
    grupo_id: Optional[UUID] = Field(default=None, alias="grupoId")
    grupo: Optional[str] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ProveedorUpdate(BaseModel):
    grupo_id: Optional[UUID] = None
```

- [ ] **Step 5: Routers**

Crear `backend/app/routers/grupos.py`:

```python
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.grupo import Grupo
from app.models.user import User
from app.schemas.grupo import GrupoCreate, GrupoResponse

router = APIRouter()


@router.get("/", response_model=list[GrupoResponse])
def listar_grupos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Grupo).order_by(Grupo.nombre).all()


@router.post("/", response_model=GrupoResponse, status_code=status.HTTP_201_CREATED)
def crear_grupo(
    data: GrupoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    grupo = Grupo(nombre=data.nombre.strip())
    db.add(grupo)
    try:
        db.commit()
        db.refresh(grupo)
        return grupo
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un grupo con ese nombre",
        ) from exc


@router.put("/{id}", response_model=GrupoResponse)
def actualizar_grupo(
    id: uuid.UUID,
    data: GrupoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    grupo = db.query(Grupo).filter(Grupo.id == id).first()
    if not grupo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grupo no encontrado")
    grupo.nombre = data.nombre.strip()
    try:
        db.commit()
        db.refresh(grupo)
        return grupo
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un grupo con ese nombre",
        ) from exc


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_grupo(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    grupo = db.query(Grupo).filter(Grupo.id == id).first()
    if not grupo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grupo no encontrado")
    db.delete(grupo)
    db.commit()
```

`backend/app/routers/proveedores.py` — reemplazar por:

```python
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.proveedor import Proveedor
from app.models.user import User
from app.schemas.proveedor import ProveedorResponse, ProveedorUpdate

router = APIRouter()


def _serializar(p: Proveedor) -> ProveedorResponse:
    return ProveedorResponse(
        id=p.id,
        nombre=p.nombre,
        grupoId=p.grupo_id,
        grupo=p.grupo.nombre if p.grupo else None,
    )


@router.get("/", response_model=list[ProveedorResponse])
def listar_proveedores(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    proveedores = (
        db.query(Proveedor)
        .options(selectinload(Proveedor.grupo))
        .order_by(Proveedor.nombre)
        .all()
    )
    return [_serializar(p) for p in proveedores]


@router.put("/{id}", response_model=ProveedorResponse)
def actualizar_proveedor(
    id: uuid.UUID,
    data: ProveedorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    proveedor = db.query(Proveedor).filter(Proveedor.id == id).first()
    if not proveedor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado"
        )
    proveedor.grupo_id = data.grupo_id
    db.commit()
    db.refresh(proveedor)
    return _serializar(proveedor)
```

`backend/app/main.py`: agregar `grupos` al import de routers (línea 15) y registrar después de proveedores (línea 129):

```python
app.include_router(
    grupos.router,
    prefix="/api/v1/grupos",
    tags=["grupos"],
)
```

- [ ] **Step 6: Verificar**

Run: `cd backend && pytest tests/test_grupos.py -v && pytest`
Expected: PASS todos.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/ backend/app/schemas/ backend/app/routers/ backend/app/main.py backend/alembic/versions/f8b2c3d4e5a6_crear_grupos_y_grupo_en_proveedores.py backend/tests/test_grupos.py
git commit -m "feat(grupos): entidad grupo y asignación de proveedores a grupos"
```

---

### Task 10: Frontend — sección Proveedores con asignación de grupo

**Files:**
- Modify: `src/types/index.ts` (interfaz `Proveedor` + nueva `Grupo`)
- Modify: `src/lib/api.ts`
- Modify: `src/components/Header.tsx` (nueva pestaña)
- Create: `src/app/proveedores/page.tsx`
- Create: `src/components/proveedores/ProveedoresTab.tsx`

**Interfaces:**
- Consumes: endpoints de Task 9.
- Produces: página `/proveedores` con lista de proveedores, selector de grupo por proveedor y CRUD mínimo de grupos. Tipos: `Grupo { id, nombre }`, `Proveedor` extendido con `grupoId?: string; grupo?: string`.

- [ ] **Step 1: Tipos y API**

`src/types/index.ts` — reemplazar la interfaz `Proveedor` (línea 3) y agregar `Grupo`:

```ts
export interface Grupo {
  id: string;
  nombre: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  grupoId?: string;
  grupo?: string;
}
```

`src/lib/api.ts` — junto a `fetchProveedores` (línea 383):

```ts
export async function updateProveedor(id: string, grupoId: string | null) {
  const res = await api.put(`/api/v1/proveedores/${id}`, toSnakeCase({ grupoId }));
  return toCamelCase(res.data);
}

export async function fetchGrupos() {
  const res = await api.get('/api/v1/grupos/');
  return toCamelCase<Grupo[]>(res.data);
}

export async function createGrupo(nombre: string) {
  const res = await api.post('/api/v1/grupos/', { nombre });
  return toCamelCase<Grupo>(res.data);
}

export async function deleteGrupo(id: string) {
  await api.delete(`/api/v1/grupos/${id}`);
}
```

(agregar `Grupo` al import de tipos del archivo).

- [ ] **Step 2: Página y navegación**

`src/components/Header.tsx` — agregar a la lista de tabs (después de 'comisionistas', línea 17), importando `Truck` de `lucide-react`:

```ts
  { value: 'proveedores', label: 'Proveedores', href: '/proveedores', icon: Truck },
```

Crear `src/app/proveedores/page.tsx`:

```tsx
import { Shell } from '@/components/Shell';
import { ProveedoresTab } from '@/components/proveedores/ProveedoresTab';

export default function ProveedoresPage() {
  return (
    <Shell>
      <ProveedoresTab />
    </Shell>
  );
}
```

- [ ] **Step 3: Componente ProveedoresTab**

Crear `src/components/proveedores/ProveedoresTab.tsx` (React Query directo, sin pasar por AppContext):

```tsx
'use client';

import { useState } from 'react';
import { Plus, Trash2, Truck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProveedores, fetchGrupos, updateProveedor, createGrupo, deleteGrupo } from '@/lib/api';
import { Proveedor, Grupo } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';

export function ProveedoresTab() {
  const queryClient = useQueryClient();
  const [nuevoGrupo, setNuevoGrupo] = useState('');

  const { data: proveedores = [] } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: fetchProveedores,
  });
  const { data: grupos = [] } = useQuery<Grupo[]>({
    queryKey: ['grupos'],
    queryFn: fetchGrupos,
  });

  const asignarGrupoMutation = useMutation({
    mutationFn: ({ id, grupoId }: { id: string; grupoId: string | null }) => updateProveedor(id, grupoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast.success('Proveedor actualizado');
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Error al actualizar proveedor'),
  });

  const crearGrupoMutation = useMutation({
    mutationFn: createGrupo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grupos'] });
      setNuevoGrupo('');
      toast.success('Grupo creado');
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Error al crear grupo'),
  });

  const eliminarGrupoMutation = useMutation({
    mutationFn: deleteGrupo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grupos'] });
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast.success('Grupo eliminado');
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Error al eliminar grupo'),
  });

  const handleCrearGrupo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoGrupo.trim()) {
      toast.error('Ingresa un nombre de grupo');
      return;
    }
    crearGrupoMutation.mutate(nuevoGrupo.trim());
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">Grupos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleCrearGrupo} className="flex gap-2">
            <Input
              placeholder="Nombre del nuevo grupo..."
              value={nuevoGrupo}
              onChange={(e) => setNuevoGrupo(e.target.value)}
              className="bg-white border-slate-200 rounded-xl w-72"
            />
            <Button type="submit" className="btn-primary-dark rounded-xl">
              <Plus className="h-4 w-4 mr-2" />
              Crear Grupo
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {grupos.length === 0 ? (
              <p className="text-sm text-slate-500">No hay grupos creados</p>
            ) : (
              grupos.map((g) => (
                <Badge key={g.id} variant="secondary" className="flex items-center gap-2 bg-slate-100 text-slate-700 border-0 py-1.5 px-3">
                  {g.nombre}
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`¿Eliminar el grupo "${g.nombre}"? Los proveedores asignados quedarán sin grupo.`)) {
                        eliminarGrupoMutation.mutate(g.id);
                      }
                    }}
                    className="text-slate-400 hover:text-red-600"
                    aria-label={`Eliminar grupo ${g.nombre}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </Badge>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {proveedores.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
          <Truck className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700">No hay proveedores</h3>
        </div>
      ) : (
        <Card className="rounded-2xl border-slate-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-100 hover:bg-transparent">
                <TableHead className="text-slate-500 font-medium">Razón social (proveedor)</TableHead>
                <TableHead className="text-slate-500 font-medium w-72">Grupo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proveedores.map((p) => (
                <TableRow key={p.id} className="border-slate-100">
                  <TableCell className="font-medium text-slate-900">{p.nombre}</TableCell>
                  <TableCell>
                    <Select
                      value={p.grupoId || ''}
                      onValueChange={(v) => asignarGrupoMutation.mutate({ id: p.id, grupoId: v || null })}
                    >
                      <SelectTrigger className="w-64 rounded-xl border-slate-200 bg-white h-9 text-sm text-slate-900">
                        <span className="flex flex-1 truncate text-left">{p.grupo || 'N/A'}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">N/A (sin grupo)</SelectItem>
                        {grupos.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificar**

Run: `pnpm build && pnpm lint`
Expected: sin errores. Manual: crear grupo, asignarlo a un proveedor, ver "N/A" en los no asignados.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/api.ts src/components/Header.tsx src/app/proveedores/ src/components/proveedores/
git commit -m "feat(proveedores): sección de proveedores con asignación de grupos"
```

---

### Task 11: Exportación — una hoja por razón social (proveedor) + columna Grupo

**Files:**
- Modify: `src/lib/export-utils.ts` (`exportarExcel`, línea 515)
- Modify: `src/components/liquidacion/LiquidacionTab.tsx` (`handleExportExcel`)

**Interfaces:**
- Consumes: `Proveedor` con `grupo` (Task 10), `normalizarTexto` de `./normalization`.
- Produces: `exportarExcel(items, comisionistas, titulo, nombreComisionista?, tarifasClienteProducto?, comisionesSnapshot?, kgAcumuladoPorComisionista?, proveedores?: Proveedor[])`. Con o sin `proveedores`, los ítems se agrupan en una hoja por `item.proveedor` (fallback `'Sin proveedor'`); cada hoja lleva columna "Grupo" (nombre del grupo de ese proveedor o `'N/A'`). Los callers que exportan snapshots de historial siguen funcionando: los ítems sin `proveedor` caen todos en la hoja `'Sin proveedor'` (los snapshots no guardan proveedor — limitación anotada en el spec).

- [ ] **Step 1: Reestructurar exportarExcel**

En `src/lib/export-utils.ts`:

1. Agregar `Proveedor` al import de tipos (línea 4).
2. Reemplazar la función `exportarExcel` completa (líneas 515-646) por:

```ts
function nombreHojaValido(nombre: string, usados: Set<string>): string {
  // Excel: máx 31 chars, sin []:*?/\
  let base = nombre.replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sin proveedor';
  let candidato = base;
  let n = 2;
  while (usados.has(candidato)) {
    candidato = `${base.slice(0, 28)} ${n}`;
    n += 1;
  }
  usados.add(candidato);
  return candidato;
}

export function exportarExcel(
  items: OrdenItem[],
  comisionistas: Comisionista[],
  titulo: string,
  nombreComisionista?: string,
  tarifasClienteProducto: TarifaClienteProducto[] = [],
  comisionesSnapshot?: Map<string, { comision: number; tarifasLabel: string }>,
  kgAcumuladoPorComisionista?: Map<string, number>,
  proveedores: Proveedor[] = []
) {
  const comisionistaMap = new Map(comisionistas.map(c => [c.id, c]));
  const wb = XLSX.utils.book_new();

  const nombresMes = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // Razón social = proveedor. Grupo del proveedor vía catálogo (match normalizado).
  const grupoPorProveedor = new Map(
    proveedores.map(p => [normalizarTexto(p.nombre), p.grupo || 'N/A'])
  );

  // Agrupar ítems por proveedor (una hoja por razón social)
  const itemsPorProveedor = new Map<string, OrdenItem[]>();
  items.forEach(item => {
    const prov = item.proveedor?.trim() || 'Sin proveedor';
    const arr = itemsPorProveedor.get(prov);
    if (arr) arr.push(item); else itemsPorProveedor.set(prov, [item]);
  });

  const nombresProveedor = Array.from(itemsPorProveedor.keys()).sort((a, b) => a.localeCompare(b, 'es'));
  const nombresHojaUsados = new Set<string>();

  nombresProveedor.forEach(nombreProveedor => {
    const itemsProveedor = itemsPorProveedor.get(nombreProveedor)!;
    const grupo = grupoPorProveedor.get(normalizarTexto(nombreProveedor)) || 'N/A';

    // Agrupar items por comisionista, luego por mes (formato original por hoja)
    const itemsPorComisionista = new Map<string, Map<string, OrdenItem[]>>();
    itemsProveedor.forEach(item => {
      const comIds = item.comisionistas.length > 0
        ? item.comisionistas.map(asig => asig.comisionistaId || 'sin-asignar')
        : ['sin-asignar'];
      comIds.forEach(comId => {
        if (!itemsPorComisionista.has(comId)) {
          itemsPorComisionista.set(comId, new Map());
        }
        const fecha = new Date(item.fecha);
        const mesKey = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        const mesMap = itemsPorComisionista.get(comId)!;
        if (!mesMap.has(mesKey)) {
          mesMap.set(mesKey, []);
        }
        mesMap.get(mesKey)!.push(item);
      });
    });

    const comisionistaIds = Array.from(itemsPorComisionista.keys()).sort((a, b) => {
      const comA = comisionistaMap.get(a);
      const comB = comisionistaMap.get(b);
      return (comA?.nombre || '').localeCompare(comB?.nombre || '');
    });

    const data: any[] = [];
    let totalProveedor = 0;

    data.push([`Razón social: ${nombreProveedor}`, '', `Grupo: ${grupo}`]);
    data.push([]);

    comisionistaIds.forEach(comId => {
      const com = comisionistaMap.get(comId);
      const comNombre = com?.nombre || 'Sin asignar';
      const mesesMap = itemsPorComisionista.get(comId)!;
      const meses = Array.from(mesesMap.keys()).sort();

      meses.forEach(mesKey => {
        const itemsDelGrupo = mesesMap.get(mesKey)!;
        const [anio, mes] = mesKey.split('-');
        const nombreMes = nombresMes[parseInt(mes) - 1];
        const ultimoDia = getUltimoDiaMes(parseInt(mes), parseInt(anio));

        data.push(['INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA.LTDA.']);
        data.push(['Sistema de Liquidación de Comisiones']);
        data.push([`Comisionista: ${comNombre} del 1 al ${ultimoDia} de ${nombreMes} ${anio}`]);
        data.push([]);
        data.push(['Fecha', 'Factura', 'Nombre', 'Cantidad', 'Tipo Comisión', 'Valor de Comisión', 'Estado', 'Sector', 'Grupo']);

        let totalGrupo = 0;
        itemsDelGrupo.forEach(item => {
          let comision = 0;
          let tarifasLabel = '-';
          const snapshotKey = `${item.id}|${comId}`;
          if (comisionesSnapshot?.has(snapshotKey)) {
            const snap = comisionesSnapshot.get(snapshotKey)!;
            comision = snap.comision;
            tarifasLabel = snap.tarifasLabel;
          } else {
            const detalle = com
              ? calcularDetalleComision(item, com, tarifasClienteProducto, kgAcumuladoPorComisionista?.get(comId))
              : undefined;
            comision = detalle?.comision || 0;
            tarifasLabel = detalle?.tarifasLabel || '-';
          }
          totalGrupo += comision;
          data.push([
            item.fecha,
            item.numeroOrden,
            item.producto,
            item.cantidad,
            tarifasLabel,
            `$ ${comision.toFixed(2).replace('.', ',')}`,
            item.estado || 'pagada',
            item.sector || item.finca || '-',
            grupo,
          ]);
        });

        data.push(['', '', '', '', '', `$ ${totalGrupo.toFixed(2).replace('.', ',')}`, '', '', '']);
        data.push([]);

        totalProveedor += totalGrupo;
      });
    });

    data.push(['', '', '', '', '', 'TOTAL', `$ ${totalProveedor.toFixed(2).replace('.', ',')}`, '', '']);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 12 },
      { wch: 20 },
      { wch: 25 },
      { wch: 10 },
      { wch: 16 },
      { wch: 16 },
      { wch: 10 },
      { wch: 10 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, nombreHojaValido(nombreProveedor, nombresHojaUsados));
  });

  XLSX.writeFile(wb, `${titulo.replace(/\s+/g, '_')}.xlsx`);
}
```

Nota: el bloque de agrupación por comisionista/mes es el existente reubicado dentro del bucle por proveedor; la deduplicación del caso `sin-asignar` se simplificó con `comIds`.

- [ ] **Step 2: Pasar proveedores desde LiquidacionTab**

En `src/components/liquidacion/LiquidacionTab.tsx`:

1. Importar `useQuery` de `@tanstack/react-query` y `fetchProveedores` de `@/lib/api`; importar el tipo `Proveedor` de `@/types`.
2. Dentro del componente (junto a los otros hooks, después de la línea 46):

```ts
  const { data: proveedores = [] } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: fetchProveedores,
  });
```

3. En `handleExportExcel`, pasar el catálogo como último argumento:

```ts
    exportarExcel(selectedFiltered, comisionistas, 'Liquidacion', com?.nombre, tarifasClienteProducto, undefined, kgPorComisionista, proveedores);
```

4. Revisar los demás callers de `exportarExcel` (`grep -rn "exportarExcel(" src/`): compilan sin cambios porque los dos parámetros nuevos son opcionales; sus ítems sin `proveedor` caen en la hoja `'Sin proveedor'`.

- [ ] **Step 3: Verificar**

Run: `pnpm build && pnpm lint`
Expected: sin errores. Manual: exportar Excel desde Liquidación con órdenes de 2 proveedores distintos → el archivo tiene una hoja por proveedor con la columna "Grupo" ("N/A" para proveedores sin grupo).

- [ ] **Step 4: Commit**

```bash
git add src/lib/export-utils.ts src/components/liquidacion/LiquidacionTab.tsx
git commit -m "feat(exportacion): hoja por razón social (proveedor) y columna de grupo"
```

---

## Verificación final

- [ ] `cd backend && pytest` — todo verde.
- [ ] `pnpm build && pnpm lint` — sin errores.
- [ ] `cd backend && alembic upgrade head` contra la BD de dev — aplica `e7a1b2c3d4f5` y `f8b2c3d4e5a6` sin errores.
- [ ] Prueba de paridad del umbral (Task 8 Step 4) ejecutada y las cifras de preview y snapshot coinciden.
