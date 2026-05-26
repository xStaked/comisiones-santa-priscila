# Diseño: Órdenes Agrupadas y Liquidación por Productos

## Contexto

La carga actual trata cada producto extraído de una orden como un `OrdenItem` independiente. Aunque todos los productos compartan el mismo número de factura u orden, quedan sueltos en la pantalla, en la asignación de comisionistas y en la liquidación. Esto dificulta la trazabilidad para el cliente: una orden real puede tener varios productos, varios comisionistas y una sola fuente documental.

El cliente confirmó estas reglas de negocio:

- Cuando la tarifa es porcentaje, se calcula sobre el valor total de venta del producto donde comisiona el comisionista.
- Cuando la tarifa es valor fijo, se calcula por la cantidad vendida en la unidad que corresponda al producto: kilogramos, litros, sacos u otra unidad configurada.
- Para efectos de comisión, `sector` y `finca` significan lo mismo.

## Decisión

Se creará una entidad real de cabecera `Orden`, con múltiples líneas `OrdenItem`.

La orden será la unidad de trazabilidad y presentación. Los productos seguirán siendo la unidad de cálculo de comisión, porque cada producto puede tener finca/sector, cantidad, unidad, total y comisionistas distintos.

## Modelo de Datos

### Nueva entidad `Orden`

Campos recomendados:

- `id`
- `fecha`
- `numero_orden`
- `cliente_id`
- `proveedor` o fuente textual cuando venga del extractor
- `semana`
- `archivo_nombre`
- `origen` (`manual`, `pdf`, `imagen`)
- `estado` (`activo`, `liquidado`, `anulado`)
- timestamps heredados del modelo base

### Cambios en `OrdenItem`

`OrdenItem` conservará los campos actuales de producto:

- `producto`
- `producto_id`
- `finca`
- `finca_id`
- `cantidad`
- `unidad`
- `precio_unitario`
- `total`
- `sector` durante transición, mapeado funcionalmente a finca
- relaciones de comisionistas por línea

Se agregará:

- `orden_id` obligatorio para registros nuevos, con migración compatible para datos existentes.

Los campos compartidos como `fecha`, `numero_orden` y `cliente_id` vivirán en `Orden` como fuente principal. Durante una fase de compatibilidad pueden mantenerse en `OrdenItem` hasta actualizar reportes y exportaciones.

## Asignación de Comisionistas

La asignación efectiva seguirá siendo por producto/línea (`OrdenItem -> Asignacion`). Esto evita ambigüedades cuando una sola orden tenga productos con distintos comisionistas.

La interfaz podrá ofrecer una acción de conveniencia: asignar comisionistas a toda la orden y aplicar esa selección a todas sus líneas. Después, el usuario podrá ajustar excepciones por producto.

## Cálculo de Comisión

La búsqueda de tarifa específica debe usar:

`comisionista + cliente + producto + finca`

Como el cliente confirmó que finca y sector son equivalentes, no se agrega una tabla ni campo nuevo de sector para tarifas.

Reglas:

- Tarifa `porcentaje`: `item.total * (valor / 100)`.
- Tarifa fija: `cantidad_comisionable * valor`.
- `cantidad_comisionable` se determina por la unidad de comisión del producto:
  - `kg`: usar kg o convertir desde libras si aplica.
  - `litro`: usar cantidad vendida en litros.
  - `saco`: usar cantidad vendida en sacos.
  - `tacho`: usar cantidad por kilos configurada para el producto si existe.
  - otras unidades futuras deben agregarse al catálogo de productos antes de usarse en tarifas.

El nombre interno `fijo_kg` podrá mantenerse inicialmente por compatibilidad, pero la etiqueta visible debe evolucionar a "fijo por unidad" o "valor fijo por unidad de comisión".

## Flujo de Carga

### PDF o imagen

Al subir un archivo:

1. El backend extrae cabecera e ítems.
2. El frontend muestra una vista previa agrupada:
   - cabecera de la orden
   - productos extraídos
   - total de la orden
3. Al confirmar, se crea una `Orden` con todas sus líneas.

### Manual

El formulario manual debe permitir crear una orden con una o varias líneas antes de guardar. Para una primera implementación, se puede iniciar con una línea y permitir agregar más líneas en la misma orden.

## Pantalla de Órdenes

La pantalla debe mostrar órdenes agrupadas, no una lista plana de productos.

Cada orden mostrará:

- número de orden/factura
- fecha
- cliente
- finca/sector principal o resumen de fincas
- cantidad de productos
- total acumulado
- estado
- comisionistas involucrados

Cada orden será expandible para ver y editar sus productos. Las acciones de borrar/anular deben actuar sobre la orden completa, con opción secundaria de eliminar una línea si aún no está liquidada.

## Liquidación

La liquidación debe presentarse agrupada por orden, pero calcularse por producto.

Al guardar una liquidación:

- Se liquidan las órdenes seleccionadas o todas las órdenes activas, según el flujo existente.
- Se crean snapshots por línea de producto, conservando el número de orden.
- Se debe incluir referencia a `orden_id` en los snapshots para trazabilidad futura.
- El estado de la orden pasa a `liquidado` cuando todas sus líneas activas quedan liquidadas.

La vista de liquidación debe distinguir:

- cantidad de órdenes
- cantidad de productos/líneas
- total vendido
- comisión total

## Migración y Compatibilidad

La migración debe crear cabeceras `Orden` para los `OrdenItem` existentes agrupando por:

- `numero_orden`
- `fecha`
- `cliente_id` cuando exista

Si hay datos inconsistentes, se prioriza no perder información: los ítems se agrupan por número y fecha, y los campos divergentes se mantienen en cada línea.

APIs actuales pueden mantenerse temporalmente:

- `GET /api/v1/ordenes/` puede devolver estructura agrupada en una versión nueva o aceptar un flag de compatibilidad.
- `POST /api/v1/ordenes/` debe evolucionar para recibir cabecera + líneas.
- Las funciones frontend deben adaptarse a `Orden[]` y derivar `OrdenItem[]` solo donde se necesiten cálculos existentes.

## Pruebas

Backend:

- Crear orden con múltiples líneas.
- Crear orden desde payload compatible de carga.
- Asignar comisionistas a líneas.
- Calcular porcentaje sobre total de producto.
- Calcular fijo por unidad de comisión del producto.
- Liquidar orden con múltiples productos y múltiples comisionistas.
- Restaurar liquidación preservando agrupación de orden.

Frontend:

- Vista previa de archivo muestra una sola orden con N productos.
- Confirmar archivo crea una orden agrupada.
- La lista de órdenes muestra cabecera y expansión de líneas.
- Asignar comisionistas a toda la orden aplica a sus productos.
- Ajustar comisionistas por producto afecta el cálculo.
- Liquidación muestra conteo de órdenes y conteo de productos por separado.

## Fuera de Alcance Inicial

- Crear una entidad separada de `Sector`.
- Cambiar el extractor PDF más allá de devolver/usar cabecera e ítems agrupados.
- Soportar liquidación parcial compleja por subconjunto de líneas con estados mixtos avanzados. Puede agregarse luego si el cliente lo requiere.
