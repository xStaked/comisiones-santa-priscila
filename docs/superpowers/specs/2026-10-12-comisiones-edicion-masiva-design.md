# Comisiones: edición masiva

## Objetivo

Renombrar la sección de tarifas como **Comisiones** en los textos visibles y permitir actualizar varios registros seleccionados en una sola operación.

## Alcance

La pantalla actual se conserva. Se actualizan sus textos visibles relacionados con “Tarifas” y el formulario de edición masiva.

La edición masiva podrá cambiar opcionalmente:

- Tipo: porcentaje, fijo por kg o fijo por unidad.
- Valor.
- Vigente hasta.
- Umbral en kg.
- Valor sobre umbral.
- Proveedores excluidos.
- Estado: activa, inactiva o sin cambio.

Los campos no modificados conservan su valor actual. Para los campos opcionales se distinguirá entre “sin cambio” y limpiar el valor existente, de modo que el usuario pueda quitar una vigencia, un umbral o los proveedores excluidos.

No se modificarán en masa el comisionista, cliente, producto, sector ni proveedor, porque identifican la combinación de la comisión y un cambio conjunto puede producir duplicados.

## Diseño técnico

- `TarifasTab` conservará la selección existente y ampliará `bulkForm` con los campos nuevos.
- El payload del frontend, el contexto y `api.ts` aceptarán los mismos campos en camelCase, transformados a snake_case por la capa existente.
- `TarifaCambiosMasivos` del backend validará los campos nuevos y permitirá valores nulos explícitos para limpiar campos opcionales.
- El endpoint `PUT /api/v1/tarifas-cliente-producto/masivo` aplicará los cambios dentro de la transacción existente a todos los IDs seleccionados.
- Los textos de éxito y error usarán “comisiones”. La exportación Excel usará nombres relacionados con “Comisiones”.

## Validaciones y errores

- Debe seleccionarse al menos un cambio.
- Los valores numéricos deben ser válidos y no negativos; el valor principal debe ser mayor que cero cuando se informa.
- Una comisión inactiva puede seleccionarse y volver a activarse.
- Si un ID no existe, la operación completa falla como hoy y no se confirma ningún cambio.

## Verificación

- Prueba backend para actualizar en masa valor, tipo, estado, vigencia, umbral, valor sobre umbral y proveedores excluidos.
- Prueba backend para limpiar campos opcionales con `null` o lista vacía.
- `pnpm build` para comprobar tipos y compilación del frontend.
- `pytest backend/tests/test_tarifas_cliente_producto.py` para el flujo backend.
