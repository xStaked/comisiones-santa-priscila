# Diseño — Observaciones del cliente (julio 2026)

Fecha: 2026-07-01
Estado: aprobado por el usuario (diseño verbal), pendiente plan de implementación.

## Contexto

El cliente entregó una lista de observaciones agrupadas en: órdenes y liquidación, tarifas, totales, y exportación/grupos. Tras explorar el código se determinó el estado actual de cada área y las decisiones de diseño se validaron con el usuario:

- Regla de Naranjo: umbral sobre volumen **acumulado dentro de la liquidación**, valor **3,50 $/kg** (`fijo_kg`). "Naranjo" no existe aún en el sistema; la regla se configura como dato, no como código.
- "Razón social" = **Proveedor** (no Cliente).
- Grupos: modelado **plano** (sin entidad sector por ahora).
- **Corrección (2026-07-02):** los grupos son conjuntos de **clientes**, no de proveedores. `grupo_id` vive en `clientes`; la columna "Grupo" del export muestra el grupo del cliente de cada fila y las hojas siguen siendo por razón social (proveedor).

## Alcance (6 ítems, en orden de ejecución)

### 1. Totales en orden alfabético

Estado actual: `LiquidacionTab` ya ordena el resumen por comisionista alfabéticamente. `ReportesTab` ordena por monto descendente vía `agruparPorFinca/Producto/Comisionista/Cliente` en `src/lib/export-utils.ts` (líneas ~732, 762, 803, 833).

Cambio: los 4 sorts pasan a `a.nombre.localeCompare(b.nombre, 'es')` (o el campo de nombre correspondiente). Sin cambios de backend.

### 2. Marcar órdenes como pagadas en masa

Estado actual: el estado se cambia orden por orden (`Select` en `OrdenesTab.tsx` → `PUT /api/v1/ordenes/grupos/{id}/estado`).

Cambios:
- **Backend**: nuevo endpoint `PUT /api/v1/ordenes/grupos/estado-masivo` con body `{ ordenIds: UUID[], estado: string }`. Reutiliza las validaciones del endpoint individual (rechaza `liquidada` como destino, omite órdenes con ítems liquidados) en una sola transacción. Respuesta: `{ actualizadas: n, omitidas: [ids] }`.
- **Frontend** (`OrdenesTab.tsx`): checkbox por orden + checkbox maestro + botón "Marcar como pagadas (N)" visible con selección activa. Mutación nueva en `AppContext`/`api.ts` que invalida `['ordenes']`.

### 3. Seleccionar qué órdenes se liquidan

**Ya implementado.** `LiquidacionTab` tiene selección por orden (modelo de exclusión, todo marcado por defecto) y el backend acepta `orden_item_ids` explícitos en `POST /liquidaciones/`. No se toca; se demuestra al cliente y solo se retrabaja si pide otra UX.

### 4. Edición múltiple de tarifas

Estado actual: `TarifasTab.tsx` edita una tarifa a la vez en un Dialog; no hay endpoint bulk.

Cambios:
- **Backend**: `PUT /api/v1/tarifas-cliente-producto/masivo` con body `{ ids: UUID[], cambios: { tipo?, valor?, activo? } }`. Solo aplica los campos presentes; los omitidos no se tocan. Una transacción; 404 si algún id no existe.
- **Frontend**: checkboxes en la tabla de tarifas + botón "Editar seleccionadas (N)" → modal reducido con tipo, valor y activo (campos vacíos = sin cambio).

### 5. Regla de comisión por umbral de volumen (caso Naranjo)

Estado actual: tarifas planas (`tipo` + `valor`); cálculo estrictamente por ítem sin acumulados, duplicado en `backend/app/services/liquidacion.py` y `src/lib/export-utils.ts`.

Cambios:
- **Datos**: en `Tarifa` y `TarifaClienteProducto`, campos nullable `umbral_kg` (Numeric) y `valor_sobre_umbral` (Numeric, $/kg). Migración Alembic. `umbral_kg IS NULL` → comportamiento actual intacto. Actualizar schemas Pydantic, `src/types/index.ts` y transformaciones si aplica.
- **Semántica**: se acumulan los kg de **todos** los ítems del comisionista dentro de la liquidación (reutilizando la conversión a kg existente, `_cantidad_para_tarifa_kg` / `getCantidadParaTarifaKg`). Si el acumulado ≥ `umbral_kg`, la comisión de sus ítems con esa tarifa se calcula como `fijo_kg` con `valor_sobre_umbral`; si no, aplica la tarifa normal.
- **Backend** (`crear_liquidacion`): pre-agregar kg por comisionista sobre los ítems seleccionados antes del bucle; pasar el acumulado a las funciones de cálculo.
- **Frontend** (`export-utils.ts`, `LiquidacionTab`): replicar la misma lógica en la previsualización. **Paridad frontend/backend obligatoria** — cualquier divergencia hace que la previsualización no cuadre con la liquidación guardada.
- **UI tarifas**: dos inputs opcionales en el modal: "Umbral (kg)" y "Valor sobre umbral ($/kg)".
- La regla de Naranjo se carga como dato: una tarifa suya con `umbral_kg = 1000` y `valor_sobre_umbral = 3,50`.
- **Test**: caso backend con dos comisionistas (uno supera el umbral, otro no) verificando ambas ramas.

### 6. Grupos + exportación con pestaña por razón social (= Proveedor)

Estado actual: `Proveedor` es entidad mínima (solo `nombre`), sin UI de gestión; en las órdenes el proveedor viaja como string libre. `exportarExcel` genera una sola hoja "Liquidación" y no muestra proveedor ni grupo. No existe entidad de grupo de empresas (el `tipo: 'grupo'` de Cliente agrupa fincas, es otra cosa).

Cambios:
- **Datos**: tabla `grupos` (id, nombre único) + `grupo_id` nullable (FK) en `proveedores`. Migración Alembic. Schemas y tipos frontend.
- **Backend**: CRUD mínimo de grupos (router `grupos` o dentro de `proveedores`) + `PUT /proveedores/{id}` para asignar/desasignar grupo. El GET de proveedores incluye el grupo anidado.
- **UI**: sección "Proveedores" mínima: lista de proveedores con selector de grupo por fila + CRUD simple de grupos (crear/renombrar/eliminar). Cubre "crear campo para asignar una razón social a un grupo".
- **Exportación** (`exportarExcel`): una hoja por proveedor (mismo formato interno actual) en lugar de la hoja única + columna "Grupo" con el nombre del grupo o "N/A". Matching del string `proveedor` del ítem contra la tabla `proveedores` usando `normalizarTexto` (existente). Ítems sin match → hoja "Sin proveedor", grupo "N/A".
- **Fuera de alcance (anotado)**: entidad "sector" dentro del grupo. El cliente definió los grupos como empresas que pueden tener sectores; se modela plano ahora y la jerarquía se agrega cuando haya un caso de uso concreto. El campo `sector` string de `OrdenItem` no se toca.

## Riesgos

1. **Paridad frontend/backend en el ítem 5**: la lógica de umbral vive en dos lugares; el plan debe incluir verificación cruzada (misma liquidación → mismo número en preview y en snapshot).
2. **Matching de proveedores en el ítem 6**: strings libres pueden no matchear con la tabla; el fallback "Sin proveedor"/"N/A" evita pérdida de datos pero puede requerir limpieza de datos en prod.
3. **Datos de producción**: las tarifas de prod vienen del PDF, no del seed Excel; no correr `seed-real`. La tarifa de Naranjo se crea manualmente en prod.

## No incluido

- Cambios a la UX de selección de liquidación (ítem 3, ya existe).
- Entidad sector / jerarquía de grupos.
- Edición masiva de tarifas globales (`Tarifa`): la UI actual solo gestiona `TarifaClienteProducto`; el bulk-edit cubre solo estas.
