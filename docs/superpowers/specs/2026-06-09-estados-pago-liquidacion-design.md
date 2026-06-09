# Diseño: Estados de pago para liquidación de comisiones

## Contexto

El sistema liquida comisiones sobre órdenes de compra. Actualmente una orden o ítem solo distingue entre `activo` y `liquidado`, y la pantalla de liquidación calcula comisiones para todo lo que no esté liquidado. Esto permite liquidar órdenes que todavía no han sido pagadas completamente, lo cual no refleja el proceso operativo del cliente.

La nueva regla de negocio es: una orden solo puede calcularse y guardarse en una liquidación cuando está pagada completamente.

## Objetivo

Agregar estados de pago a nivel de orden completa y hacer que la liquidación solo considere órdenes pagadas. La solución debe proteger la regla tanto en frontend como en backend.

## Alcance aprobado

Se implementará el enfoque de regla completa en backend y frontend, sin módulo detallado de pagos.

Estados soportados:

- `pendiente`: orden cargada, sin pago completo confirmado.
- `parcialmente_pagada`: orden con pago incompleto confirmado manualmente.
- `pagada`: orden pagada completamente y habilitada para liquidar.
- `liquidada`: orden incluida en una liquidación guardada.

El estado se administra manualmente desde la pantalla de órdenes. No se registrarán pagos individuales, comprobantes, bancos, métodos de pago ni historial de cambios en esta fase.

## Modelo de datos

El estado canónico estará en `Orden.estado`, porque el pago aplica a la orden completa. `OrdenItem.estado` se conservará por compatibilidad con el modelo actual, relaciones de liquidación, reportes y serialización existente, pero debe sincronizarse automáticamente con el estado de su orden.

Cambios esperados:

- Actualizar `EstadoOrden` en `backend/app/models/orden.py` para incluir los cuatro estados aprobados.
- Crear migración Alembic para actualizar el enum PostgreSQL `estado_orden`.
- Migrar datos existentes:
  - `activo` pasa a `pendiente`.
  - `liquidado` pasa a `liquidada`.
- Asegurar que nuevas órdenes manuales, PDF e imagen entren como `pendiente`.
- Asegurar que cualquier cambio de estado aplicado a una orden agrupada actualice también todos sus ítems.

## Backend

La API debe exponer operaciones consistentes a nivel de orden completa.

Cambios principales:

- Mantener la serialización agrupada de órdenes con el estado de `Orden.estado`.
- Ajustar la actualización de órdenes para permitir cambiar el estado de una orden completa, no solo de un ítem individual.
- Validar transiciones básicas:
  - `pendiente`, `parcialmente_pagada` y `pagada` son estados operativos editables.
  - `liquidada` se asigna al guardar liquidación.
- La creación de liquidaciones debe validar que todos los ítems enviados pertenezcan a una orden en estado `pagada`.
- Si algún ítem enviado no pertenece a una orden `pagada`, el backend debe rechazar la liquidación con error claro. No debe depender del filtro del frontend.
- Al guardar una liquidación, la orden y sus ítems pasan a `liquidada`.
- Al eliminar o restaurar una liquidación, las órdenes relacionadas vuelven a `pagada`, porque ya estaban pagadas antes de liquidarse.

## Frontend

La experiencia debe mostrar claramente qué órdenes están listas para liquidar.

Pantalla de órdenes:

- Mostrar badge de estado por orden agrupada:
  - `Pendiente`
  - `Parcialmente pagada`
  - `Pagada`
  - `Liquidada`
- Agregar control manual por orden para cambiar entre estados operativos.
- Sincronizar visualmente todos los ítems de la orden con el estado de la orden agrupada.
- Mantener órdenes `liquidada` visibles, pero sin acciones que permitan volver a liquidarlas.

Pantalla de liquidación:

- Mostrar y calcular únicamente ítems de órdenes en estado `pagada`.
- Cambiar mensajes vacíos para distinguir entre:
  - no hay órdenes cargadas;
  - hay órdenes cargadas, pero ninguna está pagada;
  - los filtros actuales no tienen órdenes pagadas.
- En el preview de guardado, indicar que solo se liquidarán órdenes pagadas.
- Antes de guardar, refrescar órdenes y volver a calcular IDs usando el estado `pagada`.

Exportaciones:

- Las exportaciones desde la pantalla de liquidación deben usar el mismo filtro de órdenes `pagada`.
- Las exportaciones históricas deben seguir usando snapshots de liquidaciones guardadas.

## Reportes y dashboard

Los reportes que hoy usan el concepto de órdenes activas deben cambiar de lenguaje y filtro:

- Para comisiones pendientes de liquidar, usar órdenes `pagada`.
- Para carga operativa pendiente, usar órdenes `pendiente` y `parcialmente_pagada`.
- Para histórico, usar liquidaciones guardadas y órdenes `liquidada`.

Los textos visibles deben evitar `activo` como concepto de negocio.

## Reglas de negocio

- Una orden nueva siempre inicia en `pendiente`.
- Una orden `pendiente` no calcula comisión liquidable.
- Una orden `parcialmente_pagada` no calcula comisión liquidable.
- Una orden `pagada` calcula comisión y puede guardarse en liquidación.
- Una orden `liquidada` no vuelve a aparecer en liquidación activa.
- Guardar liquidación cambia las órdenes incluidas a `liquidada`.
- Eliminar o restaurar una liquidación cambia las órdenes relacionadas a `pagada`.
- No debe existir una orden agrupada con ítems en estados distintos después de una operación normal del sistema.

## Pruebas

Backend:

- Crear órdenes nuevas y verificar estado `pendiente`.
- Cambiar estado de orden completa y verificar sincronización de ítems.
- Rechazar liquidación de órdenes `pendiente`.
- Rechazar liquidación de órdenes `parcialmente_pagada`.
- Permitir liquidación de órdenes `pagada`.
- Verificar que guardar liquidación cambia orden e ítems a `liquidada`.
- Verificar que eliminar liquidación devuelve orden e ítems a `pagada`.
- Verificar que restaurar liquidación recrea órdenes en estado `pagada`.
- Verificar serialización de estados hacia el frontend.

Frontend:

- Verificar build TypeScript.
- Ajustar flujos E2E existentes si dependen de `activo`.
- Agregar o actualizar prueba E2E para confirmar que una orden no aparece en liquidación hasta marcarse `pagada`.

## Fuera de alcance

- Registro de pagos individuales.
- Saldos, montos pagados, fechas de pago múltiples o métodos de pago.
- Adjuntos de comprobantes.
- Integración con sistemas externos de cobranza.
- Auditoría histórica de cambios de estado.

## Riesgos y mitigaciones

- Riesgo: datos existentes quedan en un estado no reconocido por el enum.
  Mitigación: migración explícita de `activo` a `pendiente` y `liquidado` a `liquidada`.

- Riesgo: frontend y backend aplican filtros distintos.
  Mitigación: centralizar la regla crítica en backend y reflejarla en frontend.

- Riesgo: código existente sigue usando `activo` como sinónimo de pendiente.
  Mitigación: buscar y actualizar usos de `EstadoOrden.activo`, `estado !== 'liquidado'` y textos visibles relacionados.

- Riesgo: órdenes parcialmente liquidadas por ítem.
  Mitigación: el estado se aplica a la orden completa y los ítems se sincronizan en cada transición.

## Criterio de aceptación

La funcionalidad se considera completa cuando un usuario puede cargar una orden, verla como pendiente, marcarla manualmente como pagada, verla aparecer en liquidación, guardarla como liquidación y comprobar que deja de aparecer en liquidación activa. El backend debe rechazar cualquier intento de liquidar órdenes no pagadas.

## Auto-revisión del spec

- No contiene placeholders ni requisitos pendientes.
- El alcance excluye explícitamente el módulo detallado de pagos.
- El estado canónico queda definido a nivel de orden completa.
- La regla crítica está protegida en backend y reflejada en frontend.
- Las transiciones de liquidación, eliminación y restauración quedan especificadas.
