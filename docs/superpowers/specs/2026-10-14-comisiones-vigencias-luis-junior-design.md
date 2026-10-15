# Diseño: vigencias de tarifas de Luis Castro y umbral de Junior Naranjo

## Objetivo

Automatizar dos reglas de comisión sin cambiar la prioridad temporal del sistema:

1. Luis Castro usa sus tarifas actuales al 2% para pagos hasta el 31/07/2026 y una copia equivalente al 5% para pagos desde el 01/08/2026.
2. Junior Naranjo conserva la regla existente de volumen: cuando las facturas incluidas en una liquidación acumulan al menos 1.000 kg de los productos ECU-Bacillus aplicables, todas esas líneas usan $3,50/kg.

La fecha de pago (`fechaPago` / `fecha_pago`) es la única fecha que decide la tarifa. La fecha de emisión no participa en estas dos decisiones.

## Alcance

### Luis Castro

- Cerrar todas las tarifas antiguas de Luis el 31/07/2026.
- Crear desde el 01/08/2026 tarifas nuevas, independientes de las antiguas, para FRIGOLANDIA, PLUMONT - EXPALSA, FILACAS - EXPALSA y CALIMMO - EXPALSA.
- Las nuevas tarifas cubren ECU-Bacillus Pastillas TH, Pastillas Grandes, Pastillas Alimentador, Salud, Agua y Suelo Polvo.
- Todas las nuevas tarifas son `5%` sobre la venta después de restar la retención vigente.
- No copiar los alcances internos anteriores ni crear clientes/productos fuera de la segunda hoja del PDF.
- La identificación de Luis aceptará el nombre normalizado `LUIS CASTRO` o el nombre histórico exacto `CASTRO`; la carga debe fallar con mensaje explícito si hay más de un resultado.

### Junior Naranjo

- No se rediseña el cálculo de umbral existente.
- La acumulación se hace sobre los ítems seleccionados para la liquidación, que son los determinados por fecha de pago.
- Se mantiene el comportamiento retroactivo existente: al alcanzar 1.000 kg, todas las líneas aplicables incluidas en esa liquidación reciben $3,50/kg.
- Se verifican/cargan las tarifas específicas de Junior para ECU-Bacillus Pastillas TH, Grandes, Alimentador y Salud.
- La configuración de umbral será `umbral_kg = 1000` y `valor_sobre_umbral = 3.50`.

## Modelo de datos

Agregar campos de vigencia a las dos fuentes de tarifas:

- `TarifaClienteProducto`: ya tiene `vigente_hasta`; agregar `vigente_desde` nullable.
- `Tarifa`: agregar `vigente_desde` y `vigente_hasta` nullable para que las tarifas globales tengan la misma semántica.

La regla común será:

```text
vigente_desde es NULL o vigente_desde <= fecha_pago
Y
vigente_hasta es NULL o fecha_pago <= vigente_hasta
```

La migración de datos de Luis será idempotente. No debe crear una segunda copia si ya existe una tarifa con la misma combinación, valor y rango de vigencia.

## Flujo de cálculo

1. El backend carga las tarifas candidatas.
2. Filtra por vigencia usando `fecha_pago`; si no hay fecha de pago, conserva el fallback existente a la fecha de factura para órdenes aún no pagadas.
3. Aplica la jerarquía existente de tarifas específicas y globales.
4. Calcula la comisión.
5. El frontend replica la misma condición para previsualización, exportación y totales.
6. La liquidación guarda snapshots con la tarifa y el valor efectivos, por lo que liquidaciones históricas no cambian después de una modificación futura.

La regla de umbral de Junior continúa usando el acumulado de la liquidación en backend y frontend. No se sustituye por mes calendario ni se usa la fecha de emisión.

## Migraciones y carga inicial

- Crear una migración Alembic para las columnas de vigencia.
- Crear una migración/seed idempotente que cierre las tarifas antiguas de Luis y cargue las tarifas externas nuevas definidas por el PDF.
- Actualizar schemas Pydantic, tipos TypeScript, transformaciones necesarias y endpoints de tarifas para exponer las nuevas fechas.
- Actualizar la carga de tarifas de Junior sin duplicar filas existentes.
- Mantener la lógica de normalización existente para localizar productos ECU-Bacillus.

## Pruebas y aceptación

Backend:

- Una tarifa de Luis con pago el 31/07/2026 devuelve 2%.
- La misma combinación con pago el 01/08/2026 devuelve 5%.
- Una factura emitida meses antes, pagada desde agosto, devuelve 5%.
- Las tarifas específicas conservan cliente/producto/finca/proveedor y sus excepciones.
- La migración o seed puede ejecutarse dos veces sin duplicar tarifas.
- Junior aplica $3,50/kg cuando el acumulado seleccionado llega a 1.000 kg y conserva la tarifa base cuando no llega.
- Junior aplica la tarifa de umbral a todas las líneas aplicables de la liquidación, incluidas las anteriores al ítem que completa el umbral.

Frontend:

- La previsualización coincide con el backend para pagos antes y después del corte.
- La selección de tarifas vigentes usa `fechaPago`, no `fecha`.
- La exportación y los totales conservan el valor calculado.

## Fuera de alcance

- Cambiar la prioridad global de fecha de pago.
- Rediseñar la pantalla de tarifas.
- Convertir tarifas fijas de Luis a porcentajes.
- Cambiar la regla de retenciones, que mantiene su propia ancla por fecha de emisión.
- Modificar el formato visual de las exportaciones ya ajustado.
