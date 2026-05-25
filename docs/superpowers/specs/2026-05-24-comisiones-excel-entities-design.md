# Design Document: Entidades Cliente, Producto, Finca y Tarifas Específicas

> Fecha: 2026-05-24  
> Contexto: Incorporar datos del Excel "COMISIONES GENERAL" al sistema Dinacuamar  
> Estado: Aprobado

---

## 1. Resumen Ejecutivo

El sistema actual calcula comisiones con tarifas globales por comisionista. El Excel "COMISIONES GENERAL" define tarifas específicas por **Comisionista + Cliente + Producto**. Este diseño crea las entidades necesarias (Cliente, Producto, Finca) y remodela las tarifas para soportar este modelo.

### Decisiones clave tomadas

| Decisión | Valor |
|----------|-------|
| Jerarquía de clientes | Cliente → Fincas opcionales |
| Modelo de tarifas | Puramente específico (Comisionista + Cliente + Producto) |
| Catálogo de productos | Sí, tabla `productos` con `unidad_comision` |
| Unidad del fijo | Propiedad del Producto (kg / litro / tacho) |
| Orden vincula a | Cliente (obligatorio) + Finca (opcional) |
| Retención | Propiedad del Cliente, default 1.75% |
| Enfoque de implementación | Faseado en 3 fases |

---

## 2. Arquitectura de Datos

### 2.1 Tablas nuevas

#### `clientes`

| Campo | Tipo | Constraints |
|-------|------|-------------|
| `id` | UUID | PK, default uuid4 |
| `nombre` | VARCHAR(255) | NOT NULL, UNIQUE |
| `tipo` | VARCHAR(20) | CHECK IN ('grupo', 'individual'), default 'individual' |
| `retencion_porcentaje` | NUMERIC(5,2) | NOT NULL, DEFAULT 1.75 |
| `activo` | BOOLEAN | NOT NULL, DEFAULT true |
| `created_at` | TIMESTAMP | server_default now() |

**Notas:**
- `tipo = 'grupo'` para Santa Priscila (tiene múltiples fincas).
- `tipo = 'individual'` para empresas como BRUMESA, FRIGOLANDIA (sin fincas).
- `retencion_porcentaje` se aplica al calcular comisiones porcentuales: `base = total * (1 - retencion / 100)`.

#### `fincas`

| Campo | Tipo | Constraints |
|-------|------|-------------|
| `id` | UUID | PK, default uuid4 |
| `nombre` | VARCHAR(255) | NOT NULL |
| `cliente_id` | UUID | FK → clientes.id, ON DELETE CASCADE, NOT NULL |
| `activo` | BOOLEAN | NOT NULL, DEFAULT true |
| `created_at` | TIMESTAMP | server_default now() |

**Constraint adicional:** UNIQUE(`cliente_id`, `nombre`) — un cliente no puede tener dos fincas con el mismo nombre.

#### `productos`

| Campo | Tipo | Constraints |
|-------|------|-------------|
| `id` | UUID | PK, default uuid4 |
| `nombre` | VARCHAR(255) | NOT NULL, UNIQUE |
| `unidad_comision` | VARCHAR(20) | CHECK IN ('kg', 'litro', 'tacho', 'unidad'), NOT NULL, DEFAULT 'kg' |
| `tacho_kilos` | NUMERIC(5,2) | NULLABLE — solo aplica cuando `unidad_comision = 'tacho'` |
| `activo` | BOOLEAN | NOT NULL, DEFAULT true |
| `created_at` | TIMESTAMP | server_default now() |

**Productos a cargar desde el Excel:**
- PAST TH, PAST GRAN, PAST ALIM, SALUD, AGUA, SUELO / POLVO, CITRIUS, NATUXTRACT, CALCINIT, MORTAL C
- ECULÁCTICAS, CALCIUM POTASIUM MAGNESIUM (solo en OTRAS EMPRESAS)

**Unidades:**
- kg: PAST TH, PAST GRAN, PAST ALIM, SALUD, AGUA, SUELO/POLVO, CALCINIT
- litro: CITRIUS, MORTAL C
- tacho: NATUXTRACT (15 kg por tacho)

#### `tarifas` (reemplaza modelo actual de tarifas globales)

| Campo | Tipo | Constraints |
|-------|------|-------------|
| `id` | UUID | PK, default uuid4 |
| `comisionista_id` | UUID | FK → comisionistas.id, ON DELETE CASCADE, NOT NULL |
| `cliente_id` | UUID | FK → clientes.id, ON DELETE CASCADE, NOT NULL |
| `producto_id` | UUID | FK → productos.id, ON DELETE CASCADE, NOT NULL |
| `tipo` | VARCHAR(20) | CHECK IN ('porcentaje', 'fijo'), NOT NULL |
| `valor` | NUMERIC(10,4) | NOT NULL |
| `activo` | BOOLEAN | NOT NULL, DEFAULT true |
| `created_at` | TIMESTAMP | server_default now() |

**Constraint único:** UNIQUE(`comisionista_id`, `cliente_id`, `producto_id`)

### 2.2 Tablas modificadas

#### `orden_items`

Agregar columnas (nullable en Fase 1-2, NOT NULL en Fase 3):

| Columna nueva | Tipo | FK |
|---------------|------|-----|
| `cliente_id` | UUID | → clientes.id |
| `producto_id` | UUID | → productos.id |
| `finca_id` | UUID (nullable) | → fincas.id |

El campo existente `finca` (VARCHAR) se mantiene temporalmente para compatibilidad backward durante la migración.

#### `liquidacion_items`

Agregar snapshots:

| Columna nueva | Tipo |
|---------------|------|
| `cliente_snapshot` | VARCHAR(255) |
| `producto_snapshot` | VARCHAR(255) |
| `finca_snapshot` | VARCHAR(255) (nullable) |
| `retencion_porcentaje_snapshot` | NUMERIC(5,2) |

### 2.3 Tablas existentes sin cambios

- `comisionistas`: se mantiene igual. Sus tarifas actuales (relación 1:N con tabla `tarifas` vieja) quedan en standby hasta Fase 3.
- `users`, `refresh_tokens`: sin cambios.

---

## 3. Cálculo de Comisiones (nueva fórmula)

### 3.1 Tarifa porcentaje

```
base_imponible = orden_item.total * (1 - cliente.retencion_porcentaje / 100)
comision = base_imponible * (tarifa.valor / 100)
```

### 3.2 Tarifa fija

```
si producto.unidad_comision == 'kg':
    cantidad = orden_item.cantidad_en_kg  # convierte libras si aplica
si producto.unidad_comision == 'litro':
    cantidad = orden_item.cantidad  # asume que cantidad ya está en litros
si producto.unidad_comision == 'tacho':
    cantidad = orden_item.cantidad * producto.tacho_kilos
si producto.unidad_comision == 'unidad':
    cantidad = orden_item.cantidad

comision = cantidad * tarifa.valor
```

### 3.3 Múltiples tarifas por comisionista

Un comisionista puede tener **varias tarifas para el mismo cliente+producto** si el negocio lo requiere (aunque el constraint UNIQUE lo evita). Si en el futuro se necesita, se relajaría el constraint. Por ahora, una sola tarifa por combinación.

### 3.4 Múltiples comisionistas por ítem

Se mantiene el comportamiento actual: un ítem puede tener N comisionistas asignados. Para cada asignación, se busca la tarifa específica (Comisionista + Cliente del ítem + Producto del ítem). Si no existe tarifa, la comisión es 0.

---

## 4. Frontend — Nuevos tipos y estados

### 4.1 Tipos TypeScript

```typescript
interface Cliente {
  id: string;
  nombre: string;
  tipo: 'grupo' | 'individual';
  retencionPorcentaje: number;
  activo: boolean;
  createdAt: string;
}

interface Finca {
  id: string;
  nombre: string;
  clienteId: string;
  activo: boolean;
  createdAt: string;
}

interface Producto {
  id: string;
  nombre: string;
  unidadComision: 'kg' | 'litro' | 'tacho' | 'unidad';
  tachoKilos?: number;
  activo: boolean;
  createdAt: string;
}

interface Tarifa {
  id: string;
  comisionistaId: string;
  clienteId: string;
  productoId: string;
  tipo: 'porcentaje' | 'fijo';
  valor: number;
  activo: boolean;
  createdAt: string;
}
```

### 4.2 Modificaciones a tipos existentes

```typescript
interface OrdenItem {
  // ...campos existentes...
  clienteId?: string;
  productoId?: string;
  fincaId?: string;
  // finca (string) se mantiene temporalmente
}
```

### 4.3 Estado en AppContext

Nuevas queries de React Query:
- `fetchClientes()` → GET `/api/v1/clientes`
- `fetchFincas(clienteId?)` → GET `/api/v1/fincas`
- `fetchProductos()` → GET `/api/v1/productos`
- `fetchTarifas()` → GET `/api/v1/tarifas`

---

## 5. Plan de Implementación Faseado

### Fase 1: Entidades Base (Cliente, Producto, Finca)

**Backend:**
1. Crear modelos SQLAlchemy: `Cliente`, `Finca`, `Producto`
2. Crear schemas Pydantic
3. Crear routers CRUD: `/api/v1/clientes`, `/api/v1/fincas`, `/api/v1/productos`
4. Crear migration Alembic
5. Crear comando CLI para seed de datos del Excel (clientes, productos, fincas)

**Frontend:**
1. Agregar tipos `Cliente`, `Finca`, `Producto`
2. Agregar queries React Query
3. Crear componentes de UI para listar/gestionar clientes, productos, fincas
4. Agregar navegación en Header

**Datos a cargar:**
- 22 clientes de Santa Priscila (1 grupo + 22 fincas)
- 22 clientes de Otras Empresas (individuales)
- 12 productos (10 compartidos + 2 exclusivos de OTRAS EMPRESAS)

**Compatibilidad:** El sistema de comisiones actual sigue funcionando exactamente igual. Las nuevas entidades son catálogos informativos.

### Fase 2: Nuevo Modelo de Tarifas

**Backend:**
1. Crear modelo `Tarifa` (Comisionista + Cliente + Producto)
2. Crear schema Pydantic y router CRUD: `/api/v1/tarifas`
3. Crear endpoints de búsqueda: `GET /tarifas?comisionista_id=&cliente_id=&producto_id=`
4. Crear script/management command para migrar las 464 tarifas del Excel (324 de Santa Priscila + 140 de Otras Empresas)
5. Migration Alembic

**Frontend:**
1. Agregar tipo `Tarifa`
2. Crear UI para gestionar tarifas específicas (tabla/grilla: Comisionista × Cliente × Producto)
3. Agregar vista de importación/masiva de tarifas

**Compatibilidad:** Las tarifas nuevas existen en BD pero el cálculo de comisiones sigue usando las tarifas globales actuales.

### Fase 3: Integración en Órdenes y Cálculo

**Backend:**
1. Modificar `OrdenItem` para agregar `cliente_id`, `producto_id`, `finca_id`
2. Actualizar schema `OrdenItemCreate` / `OrdenItemResponse`
3. Actualizar `crear_liquidacion()` para usar tarifas específicas en lugar de tarifas globales
4. Actualizar `_calcular_comision()` para soportar `unidad_comision` del producto y `retencion_porcentaje` del cliente
5. Actualizar PDF extractor para mapear fincas extraídas a `cliente_id` + `finca_id`
6. Actualizar todos los endpoints de reportes para usar el nuevo modelo
7. Actualizar `LiquidacionItem` snapshots
8. Migration Alembic

**Frontend:**
1. Actualizar `OrdenItem` tipo con campos nuevos
2. Modificar `OrdenesTab`: formulario de creación/edición ahora selecciona Cliente → Finca (opcional) → Producto (del catálogo)
3. Actualizar tabla de órdenes para mostrar Cliente y Producto
4. Actualizar cálculo de comisiones en `export-utils.ts`
5. Actualizar asignación de comisionistas: ahora se valida que exista tarifa para el cliente+producto
6. Actualizar reportes y exportaciones PDF/Excel

**Activación:** Una vez desplegada Fase 3, las tarifas globales antiguas quedan obsoletas. Se puede crear una migration para marcarlas como inactivas o eliminarlas.

---

## 6. Migración de Datos del Excel

### 6.1 Mapeo de datos

**Clientes (Santa Priscila):**
- 1 cliente grupo: "Santa Priscila" (retención: 1.75%)
- 22 fincas: AFRICA, ASIA, BAJEN A, BAJEN B, CALIFORNIA A, CALIFORNIA B, CORVINERO A, CORVINERO B, CORVINERO C, CHANDUY, CHURUTE, DAULAR, DAULAR CURAZAO, GOLFO, KOREA, PAÑAMAO, SABANA JAMAICA, SABANA SINGAPUR, TAURA A, TAURA B, TAURA C, TAURA D

**Clientes (Otras Empresas):**
- 22 clientes individuales: ASOC INT CAMPONIO, INTEDECAM, INT ISL PALO SANTO, GOLDENSHRIMP, SABANETA CORP, AQUALITORAL, BRUMESA, ARIRANG, PESQUESOL, PESYCAM, GOODEC, INDALSUD, ALFASHRIMP, FAGUILL, MAR DE ORO, ROSSCAMARONERA, SAN ROLANDO, FRIGOLANDIA, PLUMONT - EXPALSA, CALIMMO - EXPALSA, FILACAS - EXPALSA, PUROCONGO

**Productos:**
- PAST TH → kg
- PAST GRAN → kg
- PAST ALIM → kg
- SALUD → kg
- AGUA → kg
- SUELO / POLVO → kg
- CITRIUS → litro
- NATUXTRACT → tacho (15 kg)
- CALCINIT → kg
- MORTAL C → litro
- ECULÁCTICAS → kg
- CALCIUM POTASIUM MAGNESIUM → kg

### 6.2 Tarifas

- **Santa Priscila**: 324 tarifas (192 porcentuales + 132 fijas de MALAVE)
- **Otras Empresas**: 140 tarifas (todas porcentuales)

**Script de migración:**
Un script Python (comando CLI o notebook) que lee el Excel con `openpyxl` y crea los registros en BD vía SQLAlchemy o API REST.

---

## 7. Consideraciones de UI/UX

### 7.1 Navegación

Nuevos items en el Header/Shell:
- "Clientes" (gestión de clientes y fincas)
- "Productos" (catálogo)

### 7.2 Gestión de Tarifas

Vista tipo matriz o tabla filtrable:
- Filtros: Comisionista, Cliente, Producto
- Tabla: Comisionista | Cliente | Producto | Tipo | Valor | Acciones
- Import masivo desde Excel

### 7.3 Formulario de Órdenes (Fase 3)

Secuencia:
1. Seleccionar Cliente (dropdown)
2. Si el cliente es tipo "grupo", mostrar selector de Finca
3. Seleccionar Producto del catálogo (dropdown)
4. El resto de campos (cantidad, precio, etc.)
5. Asignar comisionistas (dropdown multi-select, filtrado por comisionistas que tienen tarifa para este Cliente+Producto)

### 7.4 Reportes

Nuevos agrupamientos posibles:
- Por Cliente
- Por Cliente + Finca
- Por Cliente + Producto
- Por Comisionista + Cliente

---

## 8. Seguridad y Validaciones

- Todos los nuevos endpoints requieren autenticación JWT
- Solo superusuarios pueden crear/editar/eliminar clientes, productos y tarifas
- Los usuarios normales pueden ver clientes/productos/tarifas (solo lectura)
- Validar que `tacho_kilos` solo se permita cuando `unidad_comision == 'tacho'`
- Validar que `finca_id` solo se permita cuando el cliente es tipo "grupo"
- Constraint de unicidad en tarifas evita duplicados

---

## 9. Testing

### Backend
- Tests CRUD para clientes, fincas, productos, tarifas
- Test de cálculo de comisiones con retención y unidades distintas
- Test de liquidación con snapshots de cliente/producto/finca

### Frontend
- Tests de creación de orden con selección de cliente/finca/producto
- Tests de cálculo de comisiones con tarifas específicas

### E2E
- Flujo completo: crear cliente → crear producto → crear tarifa → crear orden → liquidar → verificar cálculo

---

## 10. Notas de Implementación

- **Idioma:** todo en español (código, comentarios, UI)
- **snake_case** en backend (modelos, columnas), **camelCase** en schemas Pydantic expuestos al frontend
- **Alias `@/`** para imports en frontend
- **Tailwind v4** + shadcn/ui para componentes
- **React Query** para estado de servidor
- **Alembic** para migraciones de BD
