# Comisiones externas resumen

Fuente: `COMISIONES EXTERNAS RESUMEN.pdf`

## Reglas del documento

El valor a comisionar es en dolares por kg de producto, excepto:

| Producto en PDF | Unidad de la comision | Producto del sistema sugerido | Tipo de tarifa sugerido |
| --- | --- | --- | --- |
| CITRIUS | por litro | CITRIUS-011 | `fijo_kg` |
| NITRATO DE CALCIO | por saco de 25 kg | NITRATO DE CALCIO | `fijo_unidad` |
| NATUXTRACT / NATRUXTACT-ECUCITRIUS | por tacho de 15 kg | NATUXTRACT-ECUCITRIUS | `fijo_unidad` |
| MORTAL CONTROL | por litro | MORTAL C | `fijo_unidad` |
| MORTAL SHELL | por litro | Producto nuevo: MORTAL SHELL | `fijo_unidad` |

Para los productos ECU-BACILLUS, la tarifa debe cargarse como `fijo_kg`.

## Mapeo al sistema

### Entidades

| Dato del PDF | Campo del sistema | Observacion |
| --- | --- | --- |
| COMISIONISTA | `comisionistas.nombre` | Crear si no existe. Puede cargarse con tarifas globales vacias y usar solo tarifas especificas. |
| CLIENTE SANTA PRISCILA | `clientes.nombre = Santa Priscila` | Usar cliente grupo existente. |
| SECTOR | `fincas.nombre` | Normalizar `ADM` / `ADMINISTRACION` con la logica actual. |
| EMPRESA en Otros clientes | `clientes.nombre` | Usar clientes individuales. Hay nombres que no existen exactamente en el seed actual. |
| Producto/columna | `productos.nombre` | Usar aliases cuando el nombre del PDF difiere. |
| Valor | `tarifas_cliente_producto.valor` | Con `proveedor = ""`, salvo que se necesite restringir por proveedor. |

### Productos

| Columna PDF | Producto actual / sugerido | Estado |
| --- | --- | --- |
| ECU-BACILLUS SUELO-PASTILLA TH | ECU-BACILLUS SUELO PASTILLA TH | Existe en la base real. |
| ECU-BACILLUS SUELO-PASTILLA / ECU-BACILLUS PASTILLA | ECU-BACILLUS SUELO PASTILLA TH | Decision aprobada: cargar tambien contra este producto. |
| ECU-BACILLUS SALUD | ECU-BACILLUS SALUD | Existe. |
| ECU-BACILLUS AGUA | ECU-BACILLUS AGUA | Existe. |
| ECU-BACILLUS SUELO POLVO | ECU-BACILLUS SUELO | Existe. |
| CITRIUS | CITRIUS-011 | Existe, unidad `caneca`; para comisionar por litro se usa `fijo_kg` y la conversion de canecas/galones/tachos disponibles. |
| NITRATO DE CALCIO | NITRATO DE CALCIO | Existe; las ordenes reales vienen en `sacos`, por lo que se usa `fijo_unidad` para valor por saco. |
| NATRUXTACT-ECUCITRIUS TACHO | NATUXTRACT-ECUCITRIUS | Existe, conviene agregar alias por el error de escritura `NATRUXTACT`. |
| MORTAL CONTROL | MORTAL C | Existe como `MORTAL C`; conviene agregar alias `MORTAL CONTROL`. |
| MORTAL SHELL | MORTAL SHELL | No aparece en el catalogo base actual. |

## Cliente Santa Priscila

Columnas:

- `past_th`: ECU-BACILLUS SUELO PASTILLA TH, `fijo_kg`.
- `pastilla`: ECU-BACILLUS SUELO PASTILLA TH, `fijo_kg`.
- `salud`: ECU-BACILLUS SALUD, `fijo_kg`.
- `agua`: ECU-BACILLUS AGUA, `fijo_kg`.
- `suelo_polvo`: ECU-BACILLUS SUELO, `fijo_kg`.
- `citrius_litro`: CITRIUS-011, `fijo_kg`.
- `nitrato_saco`: NITRATO DE CALCIO, `fijo_unidad`.
- `natuxtract_tacho`: NATUXTRACT-ECUCITRIUS, `fijo_unidad`.
- `mortal_control_litro`: MORTAL C, `fijo_unidad`.

| Comisionista | Finca/Sector PDF | Finca normalizada | past_th | pastilla | salud | agua | suelo_polvo | citrius_litro | nitrato_saco | natuxtract_tacho | mortal_control_litro |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ALBURQUERQUE EDGAR | AFRICA ADMINISTRACION | AFRICA | 1.00 | 1.00 | 1.00 | 1.00 |  |  |  |  |  |
| ALEMAN ROBERT | BAJEN ADM A | BAJEN A | 0.50 | 0.50 | 0.50 | 0.50 | 0.50 | 0.10 |  |  |  |
| ALEMAN ROBERT | BAJEN ADM B | BAJEN B | 0.50 | 0.50 | 0.50 | 0.50 | 0.50 | 0.10 |  |  |  |
| AUGURTO MANUEL | TAURA ADM A | TAURA A | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 0.15 | 1.00 | 2.00 | 2.00 |
| AUGURTO MANUEL | TAURA ADM B | TAURA B | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 0.15 | 1.00 | 2.00 | 2.00 |
| AUGURTO MANUEL | TAURA ADM C | TAURA C | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 0.15 | 1.00 | 2.00 | 2.00 |
| AUGURTO MANUEL | TAURA ADM D | TAURA D | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 0.15 | 1.00 | 2.00 | 2.00 |
| ASUNCION REGIS | CALIFORNIA ADM A | CALIFORNIA A | 1.50 | 1.50 | 1.50 |  |  | 0.05 | 0.50 | 1.00 | 0.50 |
| ASUNCION REGIS | CALIFORNIA ADM B | CALIFORNIA B | 1.50 | 1.50 | 1.50 |  |  | 0.05 | 0.50 | 1.00 | 0.50 |
| CORDOVA JUAN CARLOS | CORVINERO ADM A | CORVINERO A | 0.50 | 0.50 | 0.50 | 0.50 |  | 0.08 |  |  |  |
| CORDOVA JUAN CARLOS | CORVINERO ADM B | CORVINERO B | 0.50 | 0.50 | 0.50 | 0.50 |  | 0.08 |  |  |  |
| CORDOVA ROGER | ASIA ADMINISTRACION | ASIA | 1.00 | 1.00 | 1.00 | 1.00 |  |  |  |  |  |
| JAIME MARTIN | TAURA ADM A | TAURA A | 1.00 | 1.00 |  | 1.00 | 2.00 |  |  | 2.00 |  |
| NARANJO JUNIOR | CALIFORNIA ADM A | CALIFORNIA A | 3.00 | 3.00 | 3.00 |  |  | 0.15 | 0.50 | 2.00 |  |
| NARANJO JUNIOR | CALIFORNIA ADM B | CALIFORNIA B | 3.00 | 3.00 | 3.00 |  |  | 0.15 | 0.50 | 2.00 |  |
| QUEVEDO RUBEN | CHANDUY | CHANDUY | 1.00 | 1.00 |  | 1.00 | 1.00 | 0.07 | 0.50 |  |  |
| QUEVEDO RUBEN | PAÑAMAO | PAÑAMAO | 1.00 | 1.00 |  | 1.00 | 1.00 | 0.07 | 0.50 |  |  |
| RUEDA JORGE | AFRICA ADMINISTRACION | AFRICA | 2.00 | 1.00 |  | 2.00 | 2.00 | 0.15 | 1.00 |  |  |
| RUEDA JORGE | ASIA ADMINISTRACION | ASIA | 1.00 |  |  |  |  |  |  |  |  |
| RUEDA JORGE | BAJEN ADM A | BAJEN A | 2.00 |  | 2.00 |  |  |  |  |  |  |
| RUEDA JORGE | CORVINERO ADM A | CORVINERO A | 2.00 |  |  |  |  |  |  |  |  |
| RUEDA JORGE | CORVINERO ADM B | CORVINERO B | 2.00 |  |  |  |  |  |  |  |  |
| RUEDA JORGE | CHANDUY | CHANDUY | 1.00 |  |  |  |  |  |  |  |  |
| RUEDA JORGE | DAULAR ADMINISTRACION | DAULAR | 1.00 |  |  |  |  |  |  |  |  |
| RUGEL ANGEL | PAÑAMAO | PAÑAMAO | 1.00 | 1.00 | 1.00 | 1.00 |  |  |  |  |  |
| ZARATE TEOBALDO | DAULAR - ADMINISTRACION | DAULAR | 1.00 | 1.00 | 1.00 | 1.00 |  |  |  |  |  |
| ZARATE TEOBALDO | DAULAR - CURAZAO | DAULAR CURAZAO | 1.00 | 1.00 | 1.00 | 1.00 |  |  |  |  |  |

## Otros clientes

Columnas:

- `pastilla`: ECU-BACILLUS SUELO PASTILLA TH, `fijo_kg`.
- `salud`: ECU-BACILLUS SALUD, `fijo_kg`.
- `agua`: ECU-BACILLUS AGUA, `fijo_kg`.
- `suelo_polvo`: ECU-BACILLUS SUELO, `fijo_kg`.
- `citrius_litro`: CITRIUS-011, `fijo_kg`.
- `nitrato_saco`: NITRATO DE CALCIO, `fijo_unidad`.
- `natuxtract_tacho`: NATUXTRACT-ECUCITRIUS, `fijo_unidad`.
- `mortal_control_litro`: MORTAL C, `fijo_unidad`.
- `mortal_shell_litro`: MORTAL SHELL, `fijo_unidad`.

| Comisionista | Empresa PDF | Cliente sugerido | pastilla | salud | agua | suelo_polvo | citrius_litro | nitrato_saco | natuxtract_tacho | mortal_control_litro | mortal_shell_litro |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| TOALA FRANCISCO | EXPALSA | Pendiente: EXPALSA generico no existe en seed | 1.00 | 1.00 | 1.00 |  |  |  |  |  |  |
| GUALPA EDWARD | FRIGOLANDIA | FRIGOLANDIA | 2.00 | 2.00 | 2.00 |  |  |  |  |  |  |
| ULLOA RONALD | CAMPONIO | ASOC INT CAMPONIO | 9.00 | 9.00 | 9.00 | 9.00 |  |  |  |  |  |
| ULLOA RONALD | INTEDECAM | INTEDECAM | 9.00 | 9.00 | 9.00 | 9.00 |  |  |  |  |  |
| ULLOA RONALD | INTEDECAM ISLA PALO SANTO | INT ISL PALO SANTO | 9.00 | 9.00 | 9.00 | 9.00 |  |  |  |  |  |
| ULLOA RONALD | GOLDENSHRIMP | GOLDENSHRIMP | 9.00 | 9.00 | 9.00 | 9.00 |  |  |  |  |  |
| ULLOA RONALD | AQUALITORAL | AQUALITORAL | 9.00 | 9.00 | 9.00 | 9.00 |  |  |  |  |  |
| ULLOA RONALD | PINGUIMAR | Pendiente: no existe en seed | 9.00 | 9.00 | 9.00 | 9.00 |  |  |  |  |  |
| ULLOA RONALD | CAMPROEX | Pendiente: no existe en seed | 9.00 | 9.00 | 9.00 | 9.00 |  |  |  |  |  |
| CONTRERAS FRANKLIN | PROMARISCO | Pendiente: no existe en seed |  |  |  |  |  |  |  |  | 3.00 |

## Pendientes antes de importar

1. Agregar o mapear clientes faltantes: `EXPALSA` generico, `PINGUIMAR`, `CAMPROEX`, `PROMARISCO`.
2. Crear producto `MORTAL SHELL` con unidad de comision `litro`.
3. Agregar aliases sugeridos:
   - `NATRUXTACT`, `NATRUXTACT-ECUCITRIUS`, `NATUXTRACT-ECUCITRIUS` -> `NATUXTRACT-ECUCITRIUS`.
   - `MORTAL CONTROL` -> `MORTAL C`.
   - `NITRATO DED CALCIO` -> `NITRATO DE CALCIO`.
   - `ECU-BACILLUS PASTILLA` y `ECU-BACILLUS SUELO-PASTILLA` -> `ECU-BACILLUS SUELO PASTILLA TH`.

## Forma de carga recomendada

Cada celda con valor debe convertirse en una fila de `tarifas_cliente_producto`:

```json
{
  "comisionistaId": "<id del comisionista>",
  "clienteId": "<id del cliente>",
  "productoId": "<id del producto>",
  "fincaId": "<id de finca o null>",
  "proveedor": "",
  "proveedoresExcluidos": [],
  "tipo": "fijo_kg | fijo_unidad",
  "valor": 1.00
}
```

Para Santa Priscila, usar `fincaId` segun el sector. Para otros clientes, usar `fincaId = null`.
