# AGENTS.md — Dinacuamar Comisiones

> Archivo de referencia para agentes de código. Todo el proyecto está en español.

## Visión General del Proyecto

**Dinacuamar — Sistema de Liquidación de Comisiones** es una aplicación web interna para INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA.LTDA. Su propósito es gestionar la liquidación de comisiones a comisionistas por órdenes de compra de productos acuícolas (camarón, tilapia, insumos, etc.).

La aplicación es **full-stack**: un frontend en Next.js (App Router) se comunica con un backend en FastAPI que persiste los datos en PostgreSQL. La autenticación es requerida para acceder a cualquier funcionalidad.

### Funcionalidades clave
- Autenticación con JWT (access token en `localStorage`, refresh token en cookie httpOnly).
- CRUD de comisionistas con tarifas globales múltiples (porcentaje, fijo por kg, fijo por unidad).
- Catálogos normalizados de **clientes** (con fincas) y **productos** (con alias para matching OCR/PDF).
- Tarifas específicas por comisionista + cliente + producto + finca, con fallback inteligente.
- Carga de órdenes de compra desde **PDF** o **imagen** mediante extracción posicional (PyMuPDF/easyocr) y extracción asistida por **IA (OpenAI)** con previsualización obligatoria antes de guardar.
- Asignación de comisionistas a ítems de orden (múltiples comisionistas por ítem).
- Cálculo automático de comisiones según tarifas específicas (prioritarias) o tarifas globales (fallback).
- Guardado de liquidaciones mensuales en historial, con restauración a órdenes activas.
- Exportación de liquidaciones a **PDF** y **Excel** (generados en el frontend).
- Dashboard con KPIs y gráficos (barras, pie).
- Reportes filtrados por fecha, finca, producto, comisionista y cliente.

---

## Stack Tecnológico

### Frontend

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.4 |
| React | React | 19.2.4 |
| Lenguaje | TypeScript | 5.9.3 |
| Estilos | Tailwind CSS | 4.3.0 |
| UI Components | shadcn/ui (`base-nova` style) + `@base-ui/react` | ^1.4.1 |
| Iconos | lucide-react | ^1.14.0 |
| Gráficos | recharts | ^3.8.1 |
| Estado servidor | @tanstack/react-query | ^5.100.13 |
| HTTP client | axios | ^1.16.1 |
| PDF (generación) | jspdf + jspdf-autotable | ^4.2.1 / ^5.0.7 |
| Excel | xlsx | ^0.18.5 |
| Toast | sonner | ^2.0.7 |
| Fechas | date-fns | ^4.1.0 |
| Temas | next-themes | ^0.4.6 |
| Gestor de paquetes | pnpm | 11.2.2 |
| Node requerido | >= 22.13.0 | — |

### Backend

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | FastAPI | 0.115.0 |
| Servidor | Uvicorn | 0.32.0 |
| ORM | SQLAlchemy | 2.0.36 |
| Migraciones | Alembic | 1.14.0 |
| Base de datos | PostgreSQL | 16 |
| Driver | psycopg2-binary | 2.9.10 |
| Validación | Pydantic + pydantic-settings | 2.9.0 / 2.6.0 |
| Auth JWT | python-jose[cryptography] | 3.3.0 |
| Hash passwords | passlib[bcrypt] | 1.7.4 |
| PDF extracción | PyMuPDF | 1.24.14 |
| OCR (imágenes) | easyocr + pillow | 1.7.2 / 11.0.0 |
| Extracción IA | openai | 2.38.0 |
| Excel (seed) | openpyxl | 3.1.5 |
| Testing | pytest | 8.3.5 |
| HTTP test client | httpx | 0.28.1 |
| Email validation | email-validator | 2.3.0 |

### Infraestructura / DevOps

| Componente | Tecnología |
|-----------|-----------|
| Contenedores | Docker + Docker Compose |
| Reverse proxy | nginx |
| E2E Testing | Playwright (@playwright/test ^1.52.0) |
| CI/CD | GitHub Actions (`.github/workflows/ci.yml`) |

**Nota importante sobre Next.js:** esta versión (16.x) tiene cambios significativos respecto a versiones anteriores. Antes de escribir código, consulta la guía en `node_modules/next/dist/docs/` y respeta los avisos de deprecación.

---

## Estructura de Carpetas

```
src/                          # Frontend Next.js
├── app/                      # App Router de Next.js (páginas)
│   ├── page.tsx              # Dashboard (tablero principal)
│   ├── layout.tsx            # Root layout con providers + fuente IBM Plex Sans
│   ├── globals.css           # Tailwind v4 + variables CSS + utilidades custom
│   ├── login/page.tsx        # Página de inicio de sesión
│   ├── comisionistas/page.tsx
│   ├── clientes/page.tsx     # Gestión de clientes y fincas
│   ├── productos/page.tsx    # Gestión de productos y alias
│   ├── tarifas/page.tsx      # Tarifas específicas cliente-producto
│   ├── ordenes/page.tsx
│   ├── liquidacion/page.tsx
│   ├── historial/page.tsx
│   ├── historial/[id]/page.tsx   # Detalle de liquidación guardada
│   └── reportes/page.tsx
├── components/
│   ├── Shell.tsx             # Layout envolvente con Header y max-width
│   ├── Header.tsx            # Navegación principal + botón "Restaurar demo"
│   ├── AuthGuard.tsx         # Protege rutas privadas (redirige a /login)
│   ├── QueryProvider.tsx     # Proveedor de React Query
│   ├── dashboard/DashboardTab.tsx
│   ├── comisionistas/ComisionistasTab.tsx
│   ├── clientes/ClientesTab.tsx
│   ├── productos/ProductosTab.tsx
│   ├── tarifas/TarifasTab.tsx
│   ├── ordenes/OrdenesTab.tsx
│   ├── liquidacion/LiquidacionTab.tsx
│   ├── historial/HistorialTab.tsx
│   ├── reportes/ReportesTab.tsx
│   └── ui/                   # Componentes de shadcn/ui
├── context/
│   ├── AppContext.tsx        # Estado global vía React Query + mutaciones API
│   └── AuthContext.tsx       # Auth: user, login, logout, loadUser
├── hooks/
│   └── useLocalStorage.ts    # Hook con hidratación segura para SSR
├── lib/
│   ├── utils.ts              # `cn()` para merge de clases Tailwind
│   ├── id.ts                 # `generarId()` — crypto.randomUUID o fallback
│   ├── demo-data.ts          # Datos de demostración precargados
│   ├── pdf-extractor.ts      # Parser de PDFs de órdenes (cliente, legacy)
│   ├── export-utils.ts       # Cálculo de comisiones + export PDF/Excel + reportes
│   ├── normalization.ts      # Normalización de texto para matching entidades
│   ├── api.ts                # Cliente axios + endpoints de la API REST
│   └── transform.ts          # Conversión snake_case ↔ camelCase recursiva
└── types/
    └── index.ts              # Interfaces TypeScript del dominio

backend/                      # Backend FastAPI
├── app/
│   ├── main.py               # Punto de entrada FastAPI, routers, middlewares
│   ├── config.py             # Pydantic Settings (env vars)
│   ├── database.py           # Engine, SessionLocal, Base declarativa
│   ├── dependencies.py       # get_db, get_current_user, get_current_superuser
│   ├── security.py           # Hash/verify passwords, JWT encode/decode
│   ├── rate_limit.py         # Rate limiting por endpoint
│   ├── models/               # SQLAlchemy models
│   │   ├── base.py           # BaseModel abstracto (id UUID, created_at)
│   │   ├── user.py
│   │   ├── refresh_token.py
│   │   ├── comisionista.py   # Comisionista + Tarifa (globales)
│   │   ├── cliente.py        # Cliente + Finca
│   │   ├── producto.py       # Producto + ProductoAlias
│   │   ├── tarifa_cliente_producto.py  # Tarifas específicas
│   │   ├── orden.py          # Orden + OrdenItem + Asignacion + EstadoOrden
│   │   └── liquidacion.py    # Liquidacion + LiquidacionItem + LiquidacionItemTarifa
│   ├── routers/              # FastAPI routers (API endpoints)
│   │   ├── auth.py           # Login, refresh, logout, register, me
│   │   ├── comisionistas.py
│   │   ├── clientes.py       # CRUD clientes + fincas anidadas
│   │   ├── productos.py      # CRUD productos + alias anidados
│   │   ├── tarifas_cliente_producto.py
│   │   ├── ordenes.py
│   │   ├── liquidaciones.py
│   │   ├── reportes.py
│   │   ├── upload.py         # Subida PDF/imagen + extracción posicional
│   │   └── admin.py          # Seed real (catálogos + Excel), seed demo
│   ├── schemas/              # Pydantic schemas (validación + serialización)
│   │   ├── auth.py
│   │   ├── comisionista.py
│   │   ├── cliente.py
│   │   ├── producto.py
│   │   ├── tarifa_cliente_producto.py
│   │   ├── orden.py
│   │   └── liquidacion.py
│   ├── services/             # Lógica de negocio
│   │   ├── pdf_extractor.py           # Extracción posicional PDF (PyMuPDF)
│   │   ├── ocr_extractor.py           # Extracción imagen (easyocr)
│   │   ├── ai_extractor.py            # Abstracción de extracción IA
│   │   ├── openai_extractor.py        # Implementación OpenAI (gpt-4.1-mini)
│   │   ├── order_extraction_models.py # Modelos Pydantic para extracción
│   │   ├── order_extraction_normalizer.py
│   │   ├── order_extraction_validator.py
│   │   ├── catalog_normalization.py   # Normalización de nombres (debe sincronizarse con frontend)
│   │   └── liquidacion.py             # Cálculo y persistencia de liquidaciones
│   └── commands/             # Comandos CLI
│       ├── create_superuser.py
│       ├── seed_catalogos.py
│       ├── seed_demo.py
│       └── seed_tarifas_excel.py
├── tests/                    # Tests pytest
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_comisionistas.py
│   ├── test_clientes.py
│   ├── test_ordenes.py
│   ├── test_liquidacion_service.py
│   ├── test_pdf_extractor.py
│   ├── test_ai_config.py
│   ├── test_ai_extractor.py
│   ├── test_ai_upload.py
│   ├── test_order_extraction_normalizer.py
│   └── test_order_extraction_validator.py
├── alembic/                  # Migraciones de base de datos
├── requirements.txt
├── Dockerfile
├── entrypoint.sh             # Arranque: alembic upgrade head + uvicorn
└── .env.example

e2e/                          # Tests End-to-End con Playwright
├── helpers/
│   └── auth.ts               # Utilidades de login para tests
├── auth.spec.ts
├── comisionistas.spec.ts
└── ordenes.spec.ts

nginx/
└── nginx.conf                # Configuración de reverse proxy (prod)
```

### Convenciones de código
- **Idioma:** todo el código, comentarios, nombres de variables visibles al usuario y documentación están en **español**.
- **Alias de rutas:** se usa `@/` mapeado a `./src/*` (ver `tsconfig.json`).
- **Componentes UI:** todos los componentes base están en `src/components/ui/` y siguen el patrón de shadcn/ui (usando `@base-ui/react` primitives + `cva` + `cn`).
- **Estilos:** se usa Tailwind CSS v4 con `@import "tailwindcss"` en `globals.css`. Las utilidades custom se definen en `@layer utilities`.
- **Client components:** la gran mayoría de componentes usan `'use client'` porque dependen de estado local, contexto o interacciones del DOM.
- **Backend Python:** código en español; rutas de API en kebab-case; modelos SQLAlchemy en snake_case; schemas Pydantic usan camelCase en los campos expuestos al frontend.

---

## Flujo de Datos y Estado

### Frontend: React Query + AppContext

El estado ya no vive en `localStorage` (salvo el `access_token` JWT). En su lugar, el frontend usa **@tanstack/react-query** para sincronizar datos con el backend:

1. **`comisionistas`** — se obtienen vía `fetchComisionistas()` (GET `/api/v1/comisionistas`).
2. **`clientes`** — se obtienen vía `fetchClientes()` (GET `/api/v1/clientes`).
3. **`productos`** — se obtienen vía `fetchProductos()` (GET `/api/v1/productos`).
4. **`tarifasClienteProducto`** — se obtienen vía `fetchTarifasClienteProducto()` (GET `/api/v1/tarifas-cliente-producto`).
5. **`ordenItems`** — se obtienen vía `fetchOrdenes()` (GET `/api/v1/ordenes`).
6. **`liquidaciones`** — se obtienen vía `fetchLiquidaciones()` (GET `/api/v1/liquidaciones`).

`AppContext.tsx` expone funciones (add, update, delete, assign) que internamente ejecutan **mutaciones** de React Query. Tras una mutación exitosa, se invalidan las queries correspondientes para refrescar la UI.

### Backend: SQLAlchemy + PostgreSQL

El backend persiste todo en PostgreSQL mediante SQLAlchemy ORM:

- **Comisionista** → `comisionistas` (1:N con `tarifas` globales).
- **Cliente** → `clientes` (1:N con `fincas`).
- **Producto** → `productos` (1:N con `producto_alias`).
- **TarifaClienteProducto** → `tarifas_cliente_producto` (tarifas específicas por comisionista-cliente-producto-finca).
- **Orden** → `ordenes` (1:N con `items`, que a su vez tienen `asignaciones`).
- **OrdenItem** → `orden_items` (con campos nullable `cliente_id`, `producto_id`, `finca_id` para normalización progresiva).
- **Liquidacion** → `liquidaciones` (1:N con `liquidacion_items`, cada uno con snapshot de datos y tarifas aplicadas).
- **User** → `users` (autenticación local).
- **RefreshToken** → `refresh_tokens` (rotación de tokens, almacenados como hash SHA-256).

### Datos de demo / reales
Si la base de datos está vacía, se puede ejecutar el seed de catálogos y tarifas reales vía el endpoint `POST /api/v1/admin/seed-real` (requiere superusuario). Este endpoint:
1. Limpia todas las tablas.
2. Inserta clientes y productos desde `backend/app/commands/seed_catalogos.py`.
3. Lee el archivo `Copia de COMISIONES GENERAL.xlsx` para crear comisionistas, fincas y tarifas específicas.

---

## Autenticación

La app utiliza un flujo **JWT dual token**:

- **Access token:** JWT de corta duración (15 min por defecto) almacenado en `localStorage` (`access_token`). Se envía en el header `Authorization: Bearer <token>`.
- **Refresh token:** token de larga duración (7 días por defecto) almacenado en una cookie **httpOnly**, **secure** (en prod) y **SameSite=strict/lax**. Se rota en cada uso.

### Flujo
1. Usuario hace login en `/login` → backend devuelve access token + user, y setea refresh cookie.
2. El frontend guarda el access token en `localStorage` y el `AuthContext` carga el usuario.
3. `AuthGuard` protege rutas privadas: si no hay sesión, redirige a `/login`.
4. Si una petición API recibe 401, el interceptor de axios intenta refresh silencioso (`POST /api/v1/auth/refresh`).
5. Si el refresh falla, se limpia el token y se redirige a `/login`.
6. Logout elimina el refresh token de la base de datos y de la cookie.

### Registro de usuarios
El endpoint `POST /api/v1/auth/register` requiere que el usuario autenticado sea **superusuario** (`is_superuser = true`). No es un registro público.

---

## Cálculo de Comisiones

Las comisiones se calculan en `src/lib/export-utils.ts` (frontend) y se validan/replican en el backend al guardar liquidaciones (`backend/app/services/liquidacion.py`):

### Tipos de tarifa
- **porcentaje:** `total * (valor / 100)`
- **fijo_kg:** `cantidad_en_kg * valor` (con conversión automática de libras, canecas, galones, tachos, sacos, etc.)
- **fijo_unidad:** `cantidad_en_unidades * valor` (respeta `peso_por_unidad` del producto cuando la orden viene en kg/litros)

### Jerarquía de tarifas (prioridad descendente)
1. **Tarifa específica** (`TarifaClienteProducto`) que coincida por comisionista + cliente + producto + finca exacta.
2. **Tarifa específica** sin finca (`finca_id IS NULL`) para el mismo comisionista + cliente + producto.
3. **Tarifas globales** del comisionista (`Tarifa`) solo si el comisionista **no tiene ninguna tarifa específica configurada**.
4. Si el comisionista tiene tarifas específicas pero ninguna aplica al ítem actual, la comisión es **0** (no hay fallback a globales).

### Retención en tarifas específicas por porcentaje
Cuando una tarifa específica es de tipo `porcentaje`, se aplica sobre el total **después** de la retención del cliente:
```
base = total * (1 - retencion_porcentaje / 100)
comision = base * (valor / 100)
```
El `retencion_porcentaje` por defecto es `1.75` y se configura por cliente.

### Unidades y conversiones (frontend y backend deben coincidir)
- **Libras → kg:** × 0.453592
- **Caneca → kg:** × 20
- **Galón → kg:** × 3.78541
- **Tacho → kg:** usa `producto.tacho_kilos` (default 15)
- **Saco → kg:** usa `producto.saco_kilos` (default 25)
- **Peso por unidad:** si el producto tiene `peso_por_unidad` y la unidad de la orden no es kg/libras/litros, multiplica `cantidad * peso_por_unidad`

---

## Normalización de Texto para Matching

Tanto el frontend como el backend realizan matching de entidades (cliente, producto, finca) por nombre normalizado. **La lógica debe mantenerse sincronizada** en ambos lados:

- **Frontend:** `src/lib/normalization.ts`
- **Backend:** `backend/app/services/catalog_normalization.py`

Funciones clave:
- `normalizarTexto()` — quita tildes, pasa a mayúsculas, elimina caracteres no alfanuméricos.
- `normalizarNombreFinca()` — elimina tokens `ADM` / `ADMINISTRACION`; corrige `GOLDO` → `GOLFO`.
- `normalizarNombreProducto()` — maneja familias de producto (ECU-BACILLUS → `PAST TH`, `PAST GRAN`, etc.), abreviaturas sueltas (`NATUXTRACT`, `CITRIUS`, `CALCINIT`, `MORTAL C`).

Si modificas una, **debes replicar el cambio en la otra** para evitar inconsistencias entre la vista previa de comisiones y el cálculo persistido en liquidaciones.

---

## Extracción de PDF / Imagen

El backend (`backend/app/services/`) contiene la lógica principal de extracción:

### Extracción posicional (sin IA)
- **PDF:** usa `PyMuPDF` para extraer texto posicional de órdenes de compra DINACUAMAR.
- **Imágenes:** usa `easyocr` (OCR) para extraer datos de órdenes en formato imagen.
- Los endpoints son `POST /api/v1/upload/pdf` e `POST /api/v1/upload/imagen`. Aceptan un parámetro de query opcional `cliente_id` para vincular fincas durante la extracción.

### Extracción asistida por IA (OpenAI)
- Se activa con las variables de entorno:
  ```
  AI_EXTRACTION_ENABLED=true
  AI_EXTRACTION_PROVIDER=openai
  OPENAI_API_KEY=sk-...
  OPENAI_EXTRACTION_MODEL=gpt-4.1-mini
  AI_EXTRACTION_TIMEOUT_SECONDS=45
  AI_EXTRACTION_MAX_FILE_MB=10
  ```
- Usa la API de respuestas de OpenAI con `json_schema` en modo estricto.
- La IA **solo propone** datos estructurados; el usuario debe revisar la previsualización antes de guardar.
- **Nunca registres** PDFs, imágenes ni texto completo extraído en logs o almacenamiento persistente.

El frontend aún conserva `src/lib/pdf-extractor.ts` (basado en `pdfjs-dist`) para extracción cliente-side, pero la carga de archivos reales se realiza contra los endpoints del backend.

---

## Comandos de Build y Desarrollo

### Frontend

```bash
# Instalar dependencias
pnpm install

# Servidor de desarrollo (requiere backend corriendo en localhost:8000)
pnpm dev              # http://localhost:3000

# Build de producción
pnpm build

# Iniciar en producción (requiere build previo)
pnpm start

# Linting
pnpm lint
```

### Backend

```bash
cd backend

# Crear entorno virtual (recomendado)
python -m venv .venv
source .venv/bin/activate   # macOS/Linux
# .venv\Scripts\activate    # Windows

# Instalar dependencias
pip install -r requirements.txt

# Correr servidor de desarrollo (requiere PostgreSQL)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Ejecutar migraciones de base de datos
alembic upgrade head

# Crear superusuario
python -m app.commands.create_superuser

# Seed de datos de demo / reales
python -m app.commands.seed_demo

# Tests del backend
pytest
```

### E2E Tests (Playwright)

```bash
# Requiere que tanto frontend como backend estén corriendo
pnpm test:e2e         # Ejecuta en headless
pnpm test:e2e:ui      # Ejecuta con UI interactiva
```

### Docker (desarrollo local)

```bash
# Levantar backend + postgres
docker-compose up --build

# El frontend debe correrse por separado con pnpm dev
```

### Docker (producción)

```bash
# Levantar stack completo: nginx + frontend + backend + postgres
docker-compose -f docker-compose.prod.yml up --build -d
```

La imagen del frontend usa `output: "standalone"` y el usuario `nextjs` (no root). El backend usa Python 3.12-slim e instala `torch` CPU-only **antes** que `easyocr` para evitar dependencias CUDA. Nginx actúa como reverse proxy, sirviendo el frontend en `/` y el backend en `/api/`. El `entrypoint.sh` del backend ejecuta `alembic upgrade head` antes de iniciar Uvicorn.

---

## Testing

### Frontend E2E: Playwright
- Tests ubicados en `e2e/`.
- Cubren autenticación, CRUD de comisionistas y carga de órdenes.
- Usan helpers en `e2e/helpers/auth.ts` para login programático.
- Se ejecutan contra Chromium; Firefox y WebKit están comentados.
- Levantan automáticamente el servidor de desarrollo (`pnpm dev`) antes de correr.

### Backend: pytest
- Tests ubicados en `backend/tests/`.
- Usan `httpx` para peticiones HTTP al backend y una base de datos de test.
- Archivos:
  - `test_auth.py` — login, refresh, logout, register protegido
  - `test_comisionistas.py` — CRUD de comisionistas
  - `test_clientes.py` — CRUD de clientes y fincas
  - `test_ordenes.py` — CRUD de órdenes y asignaciones
  - `test_liquidacion_service.py` — cálculo y persistencia de liquidaciones
  - `test_pdf_extractor.py` — extracción posicional de PDFs
  - `test_ai_config.py` — validación de configuración IA
  - `test_ai_extractor.py` — contrato y comportamiento del extractor IA
  - `test_ai_upload.py` — endpoints de subida con IA
  - `test_order_extraction_normalizer.py` — normalización de extracciones
  - `test_order_extraction_validator.py` — validación de extracciones

### CI/CD (GitHub Actions)
El workflow `.github/workflows/ci.yml` ejecuta tres jobs en paralelo:
1. **backend-test** — instala dependencias Python y corre `pytest` contra PostgreSQL 16.
2. **frontend-build** — instala pnpm + dependencias y ejecuta `pnpm run build`.
3. **frontend-lint** — instala pnpm + dependencias y ejecuta `pnpm run lint`.

---

## Seguridad y Consideraciones

- **Autenticación obligatoria:** todas las rutas protegidas requieren JWT válido. El endpoint de login tiene rate limiting.
- **JWT en producción:** `JWT_SECRET_KEY` debe tener al menos 32 caracteres. Los orígenes wildcard (`*`) en `CORS_ORIGINS` están prohibidos en producción (levanta `RuntimeError` en startup).
- **Refresh tokens:** se almacenan como hash SHA-256 en la base de datos y se rotan en cada uso. La cookie es httpOnly y secure en producción.
- **Headers de seguridad:** tanto el backend (middleware `SecurityHeadersMiddleware`) como nginx agregan headers de seguridad (X-Content-Type-Options, X-Frame-Options, CSP-like, etc.).
- **Rate limiting:** configurado vía `RATE_LIMIT_PER_MINUTE` (default 60 req/min).
- **Validación de inputs:** el backend valida todos los inputs con Pydantic; en el frontend se usan formularios controlados y toasts de error.
- **Acciones destructivas:** se usa `confirm()` del navegador para eliminar liquidaciones, restaurar demo, etc.
- **Datos sensibles:** nunca se exponen contraseñas en texto plano; todos los hashes usan bcrypt.
- **Extracción IA:** nunca almacenes ni registres en logs el contenido de archivos subidos ni el texto completo extraído.

---

## Notas para el Agente

- Antes de modificar componentes de `src/components/ui/`, verifica si son parte del sistema shadcn/ui; algunos usan primitivas de `@base-ui/react`.
- Si agregas un nuevo campo a los tipos (`src/types/index.ts`), revisa si necesitas:
  1. Actualizar el modelo SQLAlchemy correspondiente en `backend/app/models/`.
  2. Actualizar el schema Pydantic en `backend/app/schemas/` (si existe).
  3. Actualizar la serialización en el router correspondiente si expone relaciones.
  4. Actualizar la transformación camelCase/snakeCase en `src/lib/transform.ts` si es necesario.
- Al trabajar con fechas, usa el formato ISO (`YYYY-MM-DD`) internamente y `toLocaleDateString('es-ES')` para mostrar al usuario.
- El formato numérico visible al usuario usa locale español: `1.234,56`.
- Para nuevas páginas, sigue el patrón: `page.tsx` envuelve `<Shell><MiTab /></Shell>` y debe estar protegida por `AuthGuard` si es privada.
- Las rutas de API en el backend deben seguir el prefijo `/api/v1/` y usar kebab-case.
- Los modelos SQLAlchemy usan snake_case; los schemas Pydantic expuestos al frontend usan camelCase para consistencia con TypeScript.
- No modifiques la lógica de extracción de PDF del backend (`backend/app/services/pdf_extractor.py`) sin entender el impacto en órdenes reales de la empresa.
- Si modificas la normalización de texto (`src/lib/normalization.ts` o `backend/app/services/catalog_normalization.py`), **sincroniza el cambio en ambos archivos**.
- Siempre que agregues una dependencia nueva en el backend, actualiza `backend/requirements.txt`.
- El archivo `Copia de COMISIONES GENERAL.xlsx` en la raíz del backend es la fuente de datos real para el seed de tarifas; no lo muevas ni renombres sin actualizar `backend/app/commands/seed_tarifas_excel.py`.
