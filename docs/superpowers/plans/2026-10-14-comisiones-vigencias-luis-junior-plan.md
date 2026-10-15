# Plan de implementación: vigencias de tarifas de Luis Castro y umbral de Junior Naranjo

## 1. Modelo y migración

Archivos:

- `backend/app/models/comisionista.py`
- `backend/app/models/tarifa_cliente_producto.py`
- `backend/alembic/versions/<revision>_agregar_vigencias_tarifas.py`

Cambios:

1. Agregar `vigente_desde` y `vigente_hasta` a `Tarifa`.
2. Agregar `vigente_desde` a `TarifaClienteProducto`, que ya tiene `vigente_hasta`.
3. Crear índices útiles para comisionista y rango de vigencia.
4. Migrar datos existentes sin modificar su comportamiento: `vigente_desde = NULL`; conservar `vigente_hasta` existente.

## 2. Schemas y tipos

Archivos:

- `backend/app/schemas/comisionista.py`
- `backend/app/schemas/tarifa_cliente_producto.py`
- `src/types/index.ts`
- `src/lib/transform.ts` solo si el campo no queda cubierto por la transformación recursiva existente.

Agregar los campos opcionales de fecha en respuestas, creación y actualización. Mantener aliases camelCase en la API.

## 3. Resolución backend por fecha de pago

Archivos:

- `backend/app/services/liquidacion.py`
- `backend/app/routers/tarifas_cliente_producto.py`
- cualquier servicio compartido que consulte tarifas.

1. Crear predicado reutilizable de vigencia:
   - `vigente_desde IS NULL OR vigente_desde <= fecha_efectiva`.
   - `vigente_hasta IS NULL OR vigente_hasta >= fecha_efectiva`.
2. Usar `_fecha_efectiva()` ya existente, que prioriza `orden.fecha_pago` y solo cae a `orden_item.fecha` cuando falta pago.
3. Aplicarlo a tarifas específicas y globales antes de resolver la jerarquía actual.
4. Mantener intacta la prioridad exacta/finca/global y la regla de retención por fecha de emisión.
5. Asegurar que una sola tarifa válida sea elegida de forma determinista, ordenando por especificidad y vigencia.

## 4. Resolución frontend

Archivos:

- `src/lib/export-utils.ts`
- `src/components/tarifas/TarifasTab.tsx` si muestra o edita campos de vigencia.

1. Extender el filtro de `encontrarTarifaEspecifica` con `vigenteDesde`.
2. Conservar `fechaEfectiva = item.fechaPago || item.fecha` para que la previsualización coincida con backend.
3. No tocar `retencionPara(item.fecha)`.
4. Mostrar las fechas existentes en la UI solo donde ya se administran tarifas; no agregar una pantalla nueva.

## 5. Carga idempotente de Luis

Crear una migración de datos o comando dedicado bajo `backend/app/commands/` siguiendo el patrón idempotente existente.

1. Buscar exactamente un comisionista cuyo nombre normalizado sea `LUIS CASTRO` o el nombre histórico `CASTRO`; fallar claramente si hay duplicados.
2. Cerrar sus tarifas antiguas el `2026-07-31`, sin reutilizar sus alcances como tarifas externas.
3. Cargar desde `2026-08-01` tarifas específicas al 5% para FRIGOLANDIA, PLUMONT - EXPALSA, FILACAS - EXPALSA y CALIMMO - EXPALSA.
4. Crear filas para Pastillas TH, Pastillas Grandes, Pastillas Alimentador, Salud, Agua y Suelo Polvo, sin finca ni proveedor específico.
5. Aplicar la idempotencia por combinación comisionista/cliente/producto/fecha de inicio y eliminar copias externas obsoletas.
6. No crear clientes, productos ni alcances fuera de la segunda hoja del PDF.

## 6. Configuración de Junior

Archivos probables:

- `backend/app/commands/seed_tarifas_externas.py` o un comando de datos separado.
- `backend/tests/test_liquidacion_service.py`.

1. Localizar por normalización las cuatro familias: Pastillas TH, Grandes, Alimentador y Salud.
2. Crear o actualizar solo las tarifas de Junior que existan para esas combinaciones.
3. Configurar `umbral_kg = 1000` y `valor_sobre_umbral = 3.50`.
4. No modificar `_comision_con_umbral()` ni su contraparte frontend.

## 7. Pruebas

Backend:

- Test de corte 31/07 → 2%.
- Test de corte 01/08 → 5%.
- Test de factura antigua pagada después del corte → 5%.
- Test de preservación de cliente/producto/finca/proveedor/exclusiones.
- Test de idempotencia del comando de carga.
- Mantener y ejecutar los tests actuales de umbral de 1.000 kg.

Frontend:

- Test o smoke de `encontrarTarifaEspecifica` antes/después del corte usando `fechaPago`.
- Verificar que la exportación usa el valor calculado vigente.

Verificación final:

- `pytest` desde `backend/`.
- `pnpm build`.
- `pnpm lint` y reportar únicamente errores preexistentes si persisten.

## Orden de ejecución

1. Migración de columnas.
2. Modelos, schemas y tipos.
3. Predicados de vigencia backend/frontend.
4. Carga idempotente de Luis.
5. Configuración idempotente de Junior.
6. Tests y smoke de cálculo.
7. Build y revisión del diff.
