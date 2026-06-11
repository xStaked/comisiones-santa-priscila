# Migracion de tarifas externas

## Contexto

El archivo `COMISIONES EXTERNAS RESUMEN.pdf` contiene tarifas externas para Santa Priscila y otros clientes. La base actual ya no usa productos abreviados como `PAST GRAN`; por consulta directa a PostgreSQL, el catalogo activo usa nombres largos de ECU-BACILLUS y productos como `CITRIUS-011`, `NATUXTRACT-ECUCITRIUS` y `NITRATO DE CALCIO`.

La migracion debe ser aditiva e idempotente. No debe borrar las 460 tarifas existentes ni depender del Excel general de comisiones.

## Mapeo aprobado

| Columna PDF | Producto destino |
| --- | --- |
| ECU-BACILLUS SUELO-PASTILLA TH | ECU-BACILLUS SUELO PASTILLA TH |
| ECU-BACILLUS SUELO-PASTILLA / PASTILLA | ECU-BACILLUS SUELO PASTILLA TH |
| ECU-BACILLUS SALUD | ECU-BACILLUS SALUD |
| ECU-BACILLUS AGUA | ECU-BACILLUS AGUA |
| ECU-BACILLUS SUELO POLVO | ECU-BACILLUS SUELO |
| CITRIUS | CITRIUS-011 |
| NITRATO DE CALCIO | NITRATO DE CALCIO |
| NATUXTRACT / NATRUXTACT-ECUCITRIUS | NATUXTRACT-ECUCITRIUS |
| MORTAL CONTROL | MORTAL C |
| MORTAL SHELL | MORTAL SHELL |

## Enfoque

Crear `backend/app/commands/seed_tarifas_externas.py` como comando Python idempotente. El comando crea o reutiliza comisionistas, clientes, productos, aliases y tarifas especificas. Las tarifas se guardan en `tarifas_cliente_producto` con `proveedor = ""` y `proveedores_excluidos = []`.

Para Santa Priscila, cada tarifa usa el `finca_id` normalizado desde el sector del PDF. Para otros clientes, cada tarifa usa `finca_id = null`.

## Reglas de tipo de tarifa

Los productos ECU-BACILLUS se cargan como `fijo_kg`, porque la nota del PDF dice que el valor es por kg de producto. El calculo existente convierte tachos a kg usando `tacho_kilos`, y estos productos tienen `tacho_kilos = 10`.

Las excepciones se cargan asi:

| Producto | Regla PDF | Tipo |
| --- | --- | --- |
| CITRIUS-011 | por litro | `fijo_kg` |
| NITRATO DE CALCIO | por saco | `fijo_unidad` |
| NATUXTRACT-ECUCITRIUS | por tacho | `fijo_unidad` |
| MORTAL C | por litro | `fijo_unidad` |
| MORTAL SHELL | por litro | `fijo_unidad` |

`CITRIUS-011` se carga como `fijo_kg` porque las ordenes reales lo usan como `canecas` y `tachos`; el calculo actual convierte canecas a 20 y permite comisionar por litro/kg equivalente. Para `NITRATO DE CALCIO`, las ordenes reales vienen en `sacos`, asi que `fijo_unidad` respeta el valor por saco.

## Datos a crear

Comisionistas externos faltantes se crean por nombre, sin tarifas globales.

Clientes faltantes a crear como `individual`, `retencion_porcentaje = 1.75`, `activo = true`:

- `EXPALSA`
- `PINGUIMAR`
- `CAMPROEX`
- `PROMARISCO`

Producto faltante:

- `MORTAL SHELL`, `unidad_comision = "litro"`

Aliases recomendados:

- `NATRUXTACT`, `NATRUXTACT-ECUCITRIUS`, `NATUXTRACT-ECUCITRIUS` -> `NATUXTRACT-ECUCITRIUS`
- `MORTAL CONTROL` -> `MORTAL C`
- `NITRATO DED CALCIO` -> `NITRATO DE CALCIO`
- `ECU-BACILLUS PASTILLA`, `ECU-BACILLUS SUELO-PASTILLA` -> `ECU-BACILLUS SUELO PASTILLA TH`

## Idempotencia

La clave logica de tarifa es:

`comisionista_id + cliente_id + producto_id + finca_id + proveedor`

Si existe una tarifa con esa clave, el comando actualiza `tipo`, `valor`, `proveedores_excluidos` y `activo = true`. Si no existe, la inserta.

Hay un caso intencional en Santa Priscila: dos columnas del PDF apuntan al mismo producto destino (`past_th` y `pastilla`). Para evitar duplicados con la misma clave, el comando debe consolidar por clave. Si ambas columnas traen valores distintos para la misma fila, se conserva el valor de la columna `past_th` y se reporta el conflicto.

## Verificacion

La verificacion minima es:

- Ejecutar el comando en entorno de prueba o contra la base configurada.
- Confirmar que no baja el conteo de tarifas existentes.
- Confirmar que existen los clientes y producto nuevos.
- Confirmar que se insertaron/actualizaron tarifas para los comisionistas externos.
- Ejecutar `python -m compileall app tests` desde `backend`.

No se requiere cambio frontend para esta migracion.
