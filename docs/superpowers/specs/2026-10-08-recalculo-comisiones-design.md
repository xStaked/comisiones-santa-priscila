# Recálculo de comisiones y frescura entre módulos

Fecha: 2026-10-08

## Problema

Dos reportes del usuario en beta, con la misma raíz conceptual (dato congelado en el
momento de la subida) pero distinto fix:

**1. La comisión no se repara sin borrar y resubir la factura.**
Al subir, el sistema congela qué comisionistas aplican. Si después se corrige la causa
(falta una tarifa, se agrega un alias al cliente/producto, se registra un sector, se crea
un comisionista, se edita la finca/producto/cliente del ítem), la única vía para que la
comisión aparezca en Liquidación es borrar la factura y volverla a subir. No es viable
para el cliente, menos en beta donde los catálogos cambian a diario.

**2. Liquidación muestra data vieja al volver a ella.**
Borrar → resubir → pasar a la pestaña Liquidación no refleja lo nuevo; solo el reload
manual lo arregla. Pero el usuario **no** quiere refetch en cada cambio de módulo.

## Causa raíz (verificada en código)

**Problema 1 — asignaciones congeladas.**
La subida resuelve comisionistas con los catálogos de ese momento
(`order_extraction_normalizer.py:199` en el preview, `routers/ordenes.py:28`
`_comisionistas_aplicables` al confirmar) y los persiste como filas `Asignacion`.
Tanto el preview (`LiquidacionTab.tsx:191`, `item.comisionistas.flatMap(...)`) como el
guardado (`liquidacion.py:561` `_pendientes`) calculan la tarifa **en vivo pero solo
sobre asignaciones existentes**. Un ítem sin asignación se liquida con comisión $0
(`liquidacion.py:570-572`, loop vacío) y sale de pendientes sin dejar rastro.

| Cambio posterior a la subida | ¿Se refleja solo hoy? |
|---|---|
| Valor/tipo/vigencia de tarifa, con asignación existente | Sí (cálculo en vivo) |
| Tarifa nueva donde no había, alias nuevo, sector ahora registrado, comisionista nuevo | No (no hay `Asignacion`) |
| Edición de `finca_id`/`producto_id`/`cliente_id` del ítem (`PUT /{id}` no toca asignaciones) | No |
| Carga manual (no valida tarifas al cargar) | No |
| `fecha_pago` (mueve `_fecha_efectiva`), con asignación existente | Sí |
| Liquidación ya guardada | No, y está bien (snapshot inmutable) |

Vías reales por las que un ítem queda sin asignación (el preview de subida bloquea con
`problemas`, así que no es por ahí): carga manual, tarifa creada después, comisionista
creado después, edición posterior de FKs de catálogo, asignación quitada a mano.

**Problema 2 — caché pegado.**
`AppProvider` vive en `app/layout.tsx:38`: el `useQuery(['ordenes'])` **nunca se
desmonta** al navegar entre `/ordenes` y `/liquidacion`. Con `staleTime: 30s` y
`refetchOnWindowFocus: false` (`QueryProvider.tsx:12-13`), cambiar de módulo no dispara
fetch: la frescura depende 100% de la invalidación post-mutación. En el flujo
borrar → resubir, dos invalidaciones disparan dos GETs solapados; si el primero resuelve
último (o arrancó antes del commit del POST), el caché termina con la respuesta vieja y
nada lo corrige (sin remontaje ni foco, no hay refetch). Es silencioso además:
`Shell.tsx:111` usa `isLoading`, no `isFetching`.

## Decisiones

1. **Recálculo explícito, no automático.** Al guardar tarifa/cliente/producto/alias no se
   toca ninguna asignación: lo automático pisaría asignaciones manuales y produciría
   efectos sorpresa en beta. El usuario elige qué facturas recalcular.
2. **Candidatos = comisionistas con al menos una tarifa específica activa.** Paridad con
   lo que el extractor asigna al subir. No se activa por sorpresa el fallback global
   (comisionistas solo-globales hoy nunca se asignan en la subida).
3. **Modo `agregar` por defecto** (solo inserta faltantes, jamás borra: respeta lo manual).
   Modo `sincronizar` opt-in que además elimina pendientes que ya no aplican, con
   advertencia de que puede quitar una asignación manual.
4. **Lo liquidado no se toca.** Ítem en `liquidada`, grupo con ítems liquidados o
   asignación con `liquidacion_id` (liquidación parcial por persona) se omite e informa.
   Sin columna `origen_asignacion`: distinguir auto vs. manual exigiría migración; queda
   como follow-up si el modo `sincronizar` resulta brusco.
5. **Sin refetch por navegación.** Se mantiene `staleTime: 30s` y sin refetch al enfocar.
   La frescura se garantiza cancelando GETs en vuelo al mutar e invalidando en `onSettled`.
6. **Sin migración.** No hay cambio de esquema: solo asignaciones (tabla existente) y
   backfill de FKs hoy NULL.

## Estado actual del código

| Punto | Ubicación | Comportamiento hoy |
|---|---|---|
| Filtro de aplicables al guardar | `backend/app/routers/ordenes.py:28-45` | itera solo los `comisionista_ids` recibidos |
| Creación de `Asignacion` | `backend/app/routers/ordenes.py:275-298` | una vez, al confirmar la carga |
| Pendientes por liquidar | `backend/app/services/liquidacion.py:559-578` | solo asignaciones existentes |
| Ítem sin asignación al liquidar | `backend/app/services/liquidacion.py:570,624` | pasa el filtro pero el loop no emite tarifa → $0 |
| Preview en vivo (solo asignados) | `src/components/liquidacion/LiquidacionTab.tsx:189-206` | `flatMap` sobre asignados |
| Invalidación post-mutación | `src/context/AppContext.tsx` (cada `onSuccess`) | sin `cancelQueries`, mayormente solo en `onSuccess` |
| Stale compartido | `src/components/QueryProvider.tsx:12-13` | 30s, sin refetch por foco |
| Bloqueo de factura repetida | `backend/app/routers/ordenes.py:64-83` | 409 obliga a borrar antes de resubir (lo que el fix vuelve innecesario) |

## Componentes

### Backend — endpoints de recálculo (mismo `routers/ordenes.py`, requiere auth como el resto)

- **`POST /api/v1/ordenes/grupos/{orden_id}/recalcular`** — una factura. Body: `{ modo?: "agregar" | "sincronizar" }`.
- **`POST /api/v1/ordenes/recalcular`** — masivo. Body:
  `{ orden_ids?: UUID[], orden_item_ids?: UUID[], modo?: "agregar" | "sincronizar" }`.
  Sin ids = todo lo pendiente (útil en beta). Sin choque de rutas: los `POST` existentes
  son `/`, `/limpiar`, `/asignar-global` y `/{id}/comisionistas` (distinto nº de segmentos
  o distinto método que `/{id}`).
- Lógica por ítem (reusar helpers existentes, no duplicarlos):
  - Omitir con motivo si `estado == liquidada`, si su grupo tiene ítems en `liquidada`
    (reusar `_item_o_grupo_tiene_items_liquidados`, `ordenes.py:132`), o si tiene
    asignaciones con `liquidacion_id` (reusar `_tiene_asignaciones_liquidadas`,
    `ordenes.py:127`). La liquidación parcial por persona no se reabre.
  - Candidatos: ids de comisionistas con ≥1 `TarifaClienteProducto` activa.
  - Aplicables: `_comisionistas_aplicables(db, oi, candidatos)` — la misma función que
    manda al liquidar (no la del normalizer de subida, que tiene matices distintos).
  - `agregar`: insertar `Asignacion` para aplicables faltantes. No borrar nada.
  - `sincronizar`: además borrar pendientes (`liquidacion_id IS NULL`) cuyo comisionista
    ya no aplica.
  - Backfill: si `cliente_id`/`producto_id`/`finca_id` es NULL y ahora resuelve (alias
    nuevo), rellenarlo. **Solo NULLs, nunca sobrescribir.** Reusar `_buscar_cliente`,
    `_buscar_producto`, `_buscar_finca` de `order_extraction_normalizer.py` (privados
    pero importables; exponerlos sin guion si se prefiere).
  - No tocar `estado`, `fecha_pago`, cantidades, totales.
- Respuesta: `{ actualizados, agregadas, quitadas, omitidas: [{ id, motivo }] }`.
- Tests: `backend/tests/test_recalculo.py` con fixtures existentes (`db_session`,
  `authenticated_client` de `conftest.py`):
  - Ítem manual sin tarifa → crear tarifa → recalc → asignación aparece → al liquidar,
    comisión > 0 (cierra el loop del reporte).
  - Backfill: ítem manual con texto de producto sin `producto_id` → crear producto con
    ese nombre → recalc rellena `producto_id` y asigna.
  - `agregar` no borra una asignación manual que ya no aplica; `sincronizar` sí la quita.
  - Ítem `liquidada` y asignación parcialmente liquidada → omitidos, nada cambia.
  - 401 sin token (convención del resto del router).

### Frontend

- **`src/lib/api.ts`** — `recalcularOrden(ordenId, modo?)` y
  `recalcularOrdenesMasivo({ ordenIds?, ordenItemIds?, modo? })` (con `toSnakeCase`
  como el resto).
- **`src/context/AppContext.tsx`** — mutación `recalcularComisiones`:
  `onMutate` cancela `['ordenes']`, `onSettled` la invalida, toast con conteos
  ("3 asignaciones agregadas · 1 omitida por liquidada"). Exponer en el contexto.
- **`src/components/ordenes/OrdenesTab.tsx`** —
  - Botón por factura a nivel de grupo (junto a estado/editar/eliminar).
  - Botón masivo sobre `selectedOrdenIds` (reusa la selección existente).
  - `agregar` directo; `sincronizar` con confirmación que advierte que quita pendientes
    (mismo patrón `confirm()` del borrado masivo, `OrdenesTab.tsx:855`).
- **`src/components/liquidacion/LiquidacionTab.tsx`** — donde hoy muestra "Sin asignar"
  (`:607`), hint: "sin comisionista asignado al subir — recalcúlala desde Facturas".

### Frescura — cambios en `src/context/AppContext.tsx` (sin tocar `QueryProvider`)

- En **toda** mutación que invalide `['ordenes']` (crear/editar/borrar orden, borrado
  masivo, limpiar, estados individual/masivo, asignar/desasignar/global, crear/borrar/
  restaurar liquidación, borrar comisionista, editar cliente, seed): agregar
  `onMutate: () => queryClient.cancelQueries({ queryKey: ['ordenes'] })` y mover la
  invalidación a `onSettled` (hoy casi todas solo invalidan en `onSuccess`; el borrado
  masivo ya invalida también en `onError` — generalizar ese patrón). Sin optimistic
  updates: no hay rollback que gestionar; el `onSettled` re-dispara el GET limpio.
- Liquidaciones: igual para `['liquidaciones']` en sus tres mutaciones.
- No cambiar `cargando` (sigue `isLoading`): el refetch sigue silencioso, que es lo pedido.

## Verificación

- `cd backend && pytest -q` (incluye el nuevo `test_recalculo.py`).
- `pnpm build` (type-check) y `pnpm lint`.
- Manual (el bug de frescura es de carrera: repetir 3 veces, idealmente con throttling en
  DevTools): borrar factura → resubir → ir a Liquidación **sin recargar** → la factura
  aparece con la comisión; repetir con edición de tarifa entre medias.
- Manual recalc: factura manual sin tarifa → crear tarifa → "Recalcular" en Facturas →
  aparece asignada en Liquidación con comisión > 0, sin borrar nada.
- E2E (`e2e/ordenes.spec.ts` ya navega ordenes→liquidación; el backend corre aparte y
  solo Chromium): opcional; si alcanza el tiempo, caso de recalc vía UI.

## Fuera de alcance (decidido explícitamente)

- Recalcular liquidaciones ya guardadas (snapshots inmutables, igual que en la spec de
  retención por periodos).
- Auto-recálculo al guardar tarifa/cliente/producto/alias.
- Polling, websockets, refetch al enfocar o al cambiar de módulo, indicador "actualizando".
- Columna `origen_asignacion` para distinguir manual vs. automática (follow-up posible).
- Recalcular al editar FKs en `PUT /{id}`: el endpoint nuevo es la vía de reparación.
- Cambios a `AGENTS.md`: no hay nueva regla de paridad (se reusan las funciones que
  mandan al liquidar).

## Fase de implementación (orden sugerido)

- [ ] **Task 1 — endpoints de recálculo + tests** (`routers/ordenes.py`,
  `tests/test_recalculo.py`). Criterio: `pytest tests/test_recalculo.py -v` verde.
- [ ] **Task 2 — UI de recálculo** (`api.ts`, `AppContext.tsx`, `OrdenesTab.tsx`,
  hint en `LiquidacionTab.tsx`). Criterio: `pnpm build` + `pnpm lint` verdes.
- [ ] **Task 3 — frescura** (`AppContext.tsx`: `cancelQueries` en `onMutate` +
  invalidación en `onSettled` en las mutaciones listadas). Criterio: verificación manual
  de carrera (arriba) sin recargar.
- [ ] **Task 4 — verificación completa**: `pytest -q`, `pnpm build`, `pnpm lint`,
  flujo manual de extremo a extremo de ambos fixes.
