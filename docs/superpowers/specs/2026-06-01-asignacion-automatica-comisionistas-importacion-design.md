# Asignación Automática de Comisionistas en Importación

## Objetivo

Al subir una orden de compra en PDF o imagen, cada producto extraído debe incluir por defecto todos los comisionistas con tarifas activas aplicables. La asignación debe aparecer en la vista previa y persistirse cuando el usuario confirme la carga.

## Regla de Coincidencia

La tarifa aplicable depende de la estructura del cliente:

- Cliente con fincas registradas: coincidencia exacta por `cliente_id + producto_id + finca_id`.
- Cliente sin fincas registradas: coincidencia por `cliente_id + producto_id` con `finca_id IS NULL`.

Una coincidencia puede devolver varios comisionistas. Los IDs se incluyen una sola vez aunque existan datos duplicados.

Si no se normaliza cliente, producto o la finca requerida, el producto permanece sin comisionistas para revisión manual.

## Arquitectura

La resolución vive en `backend/app/services/order_extraction_normalizer.py`, junto a la normalización de cliente, finca y producto. Después de vincular los IDs de catálogo, el normalizador consulta `TarifaClienteProducto` activas y rellena `item.comisionistas`.

La respuesta de PDF e imagen debe serializar `item.comisionistas` en lugar de reemplazarlo por una lista vacía. El frontend ya transporta las asignaciones de la vista previa al endpoint de creación de órdenes.

## Compatibilidad

No se elimina `finca_id` de las tarifas existentes. Las tarifas sin finca continúan aplicando únicamente a clientes sin fincas registradas. Las tarifas con finca continúan aplicando únicamente a la finca exacta.

## Pruebas

- Grupo con finca exacta asigna varios comisionistas.
- Grupo con finca distinta no asigna comisionistas.
- Cliente sin fincas asigna por cliente y producto.
- Tarifa inactiva no asigna comisionistas.
- El PDF real `93133 SEM 15 ECU-BACILLUS.pdf` conserva las asignaciones resueltas en su respuesta.
