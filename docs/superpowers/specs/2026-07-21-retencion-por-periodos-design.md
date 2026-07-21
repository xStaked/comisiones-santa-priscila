# Retención por periodos de vigencia

Fecha: 2026-07-21

## Problema

La retención del cliente vive en un único campo escalar `clientes.retencion_porcentaje`
(default 1.75%). No tiene noción de vigencia temporal, así que al cambiarla se recalculan
de inmediato **todas** las facturas aún no liquidadas, incluidas las emitidas meses antes
bajo la tasa anterior.

El cliente comunicó el cambio de tasa (WhatsApp, 2026-07-21):

> Todas las facturas emitidas hasta el 28 de febrero 2026 se considera una retención del
> 1.75% del valor facturado. Toda factura a partir del 1 de marzo 2026 se considera una
> retención del 2% del valor facturado.
> Aplica **por fecha de factura, no por fecha de liquidación**.

## Reglas acordadas

1. La retención de una factura es la **vigente en `orden_item.fecha`** (fecha de emisión),
   no la de la fecha de liquidación.
2. La tasa es **global**: la misma para todos los clientes. No se negocia por cliente.
3. Tramos iniciales: `< 2026-03-01` → **1,75%**; `>= 2026-03-01` → **2,00%**.
4. Lo **ya liquidado no se toca**. Su `retencion_porcentaje_snapshot` queda como está,
   aunque corresponda a una factura emitida después del 2026-03-01.
5. Se **elimina** la columna `clientes.retencion_porcentaje`.

La retención solo interviene en tarifas de tipo `porcentaje`. Las de `fijo_kg` y
`fijo_unidad` no la usan y no cambian su resultado.

## Divergencia deliberada con la vigencia de tarifas

El sistema maneja **tres** fechas distintas, y retención y tarifas se anclan a fechas
diferentes **a propósito**:

| Fecha | Campo | Qué decide |
|---|---|---|
| Emisión de la factura | `orden_item.fecha` | **la retención vigente** (esta spec) |
| Pago | `orden.fecha_pago` | la tarifa vigente (`_fecha_efectiva`, `liquidacion.py:82-91`) |
| Liquidación | `liquidacion.fecha_creacion` | nada, en materia de vigencias |

`_fecha_efectiva()` resuelve la vigencia de **tarifas** por fecha de pago (con fallback a
fecha de factura), porque "el cliente liquida cuando le pagan". La **retención no usa esa
función**: el cliente pidió explícitamente "facturas *emitidas* hasta el 28 de febrero",
o sea fecha de emisión.

Consecuencia aceptada: una factura emitida el 2026-02-20 y pagada el 2026-05-10 recibe
**tarifa de mayo** y **retención de febrero**. Es correcto según lo pedido.

**No unificar retención con `_fecha_efectiva()` "por consistencia".** Es una divergencia
intencional, no un descuido.

## Estado actual del código

| Punto | Ubicación | Comportamiento hoy |
|---|---|---|
| Cálculo en vivo (backend) | `backend/app/services/liquidacion.py:336-341` | lee `orden_item.cliente.retencion_porcentaje` |
| Cálculo en vivo (frontend) | `src/lib/export-utils.ts:107-108` | lee `item.cliente.retencionPorcentaje` |
| Congelado al liquidar | `backend/app/services/liquidacion.py:478-480` | snapshot del valor actual del cliente |
| Fuente del dato | `clientes.retencion_porcentaje` | escalar único, sin fecha |

`OrdenItem` ya expone `fecha` (`backend/app/models/orden.py:89`, y en
`OrdenItemResponse`), así que la fecha de corte está disponible en ambos lados sin
cambios de esquema en órdenes.

Llamadores del cálculo en frontend (solo dos, ambos pueden recibir los periodos como
parámetro):

- `src/components/liquidacion/LiquidacionTab.tsx:130`
- `src/components/comisionistas/ComisionistasTab.tsx:54`

## Modelo de datos

```
retenciones: id | vigente_desde (date, UNIQUE, NOT NULL) | porcentaje (numeric 5,2, NOT NULL)
```

Filas iniciales:

| vigente_desde | porcentaje |
|---|---|
| 1900-01-01 | 1.75 |
| 2026-03-01 | 2.00 |

**Una sola columna de fecha, sin `vigente_hasta`.** Cada periodo termina donde empieza el
siguiente (intervalos semiabiertos), lo que hace imposible por construcción registrar
huecos o solapes.

**Resolución:** el `porcentaje` del mayor `vigente_desde <= fecha_factura`. Si la tabla
estuviera vacía, fallback a `1.75`. Con el tramo sembrado en `1900-01-01` el fallback no
se activa en la práctica; queda como red de seguridad.

## Componentes

### Backend

- **`backend/app/models/retencion.py`** — modelo `Retencion` sobre `BaseModel`.
- **Migración Alembic** — crea `retenciones`, inserta los dos tramos y elimina la columna
  `clientes.retencion_porcentaje`.
- **`backend/app/services/retencion.py`** — dos funciones:
  - `cargar_periodos(db)` → lista de periodos ordenada por `vigente_desde` descendente.
  - `retencion_para(periodos, fecha)` → el primer periodo con `vigente_desde <= fecha`;
    fallback `Decimal("1.75")`.
- **`backend/app/services/liquidacion.py`** — `_calcular_comision_especifica` y
  `crear_liquidacion` resuelven la retención por `oi.fecha`. Los periodos se cargan
  **una sola vez por liquidación** y se pasan a las funciones de cálculo, no se consultan
  por ítem (evita N+1).
- **`backend/app/routers/retenciones.py`** — solo `GET /api/v1/retenciones`, que devuelve
  la lista de periodos. Registrar en `backend/app/main.py`.
- **Limpieza de `retencion_porcentaje`** en `backend/app/schemas/cliente.py`,
  `backend/app/routers/clientes.py` y los seeds que lo referencian
  (`seed_catalogos.py:116,130` y `seed_tarifas_externas.py:444`).

### Frontend

- **`src/types/index.ts`** — nuevo tipo `Retencion { id, vigenteDesde, porcentaje }`;
  quitar `retencionPorcentaje` de `Cliente` (línea 91) y del cliente anidado en
  `OrdenItem` (línea 56).
- **`src/lib/api.ts`** — `getRetenciones()`.
- **`src/lib/export-utils.ts`** — `calcularComisionPorTarifaEspecifica` y
  `calcularDetalleComision` reciben los periodos y resuelven por `item.fecha`.
- **`LiquidacionTab.tsx` y `ComisionistasTab.tsx`** — obtienen los periodos con React
  Query y los pasan al cálculo.
- **`ClientesTab.tsx`** — quitar el campo de retención del formulario (líneas 324-333 y
  el estado asociado) y el texto `Retención: X%` del listado (línea 588).

## Paridad frontend/backend

La regla de resolución queda escrita en dos lenguajes, igual que ya ocurre con el cálculo
de comisiones (`src/lib/export-utils.ts` ↔ `backend/app/services/liquidacion.py`) y con la
normalización de texto. Se agrega la nota correspondiente a `AGENTS.md`: si se cambia la
resolución de retención en un lado, hay que replicarla en el otro.

## Verificación

`backend/tests/test_retencion.py` cubre los casos donde esto se rompe:

- Factura del **2026-02-28** resuelve 1,75%; factura del **2026-03-01** resuelve 2,00%
  (el borde exacto entre tramos).
- Comisión de tarifa `porcentaje` calculada sobre la base correcta en cada tramo.
- Al liquidar, `retencion_porcentaje_snapshot` congela la retención **de la fecha de la
  factura**, no la vigente el día de la liquidación.
- Tarifas `fijo_kg` y `fijo_unidad` no cambian su resultado.

## Fuera de alcance (decidido explícitamente)

- **CRUD de periodos desde la UI.** Un tramo nuevo es una migración de una línea y ocurre
  cada varios años (es un cambio legal, no operativo). Se puede agregar encima sin rehacer
  nada si más adelante se necesita autonomía sin deploy.
- **Recálculo de liquidaciones existentes.** Las facturas emitidas desde el 2026-03-01 que
  ya se liquidaron con snapshot 1,75% quedan congeladas tal cual.
