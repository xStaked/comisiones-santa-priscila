# Diseño: Migración a Backend FastAPI + PostgreSQL

> Proyecto: Dinacuamar — Sistema de Liquidación de Comisiones
> Fecha: 2026-05-22
> Estado: Aprobado por diseño, pendiente implementación

---

## 1. Resumen Ejecutivo

Este documento describe el diseño para migrar Dinacuamar de una aplicación 100% cliente (Next.js + localStorage) a una arquitectura cliente-servidor con backend FastAPI, PostgreSQL y autenticación JWT. El frontend Next.js se mantiene y se refactoriza para consumir la API REST.

**Scope:** Migración completa del estado de localStorage a backend persistente, incluyendo autenticación, CRUD de negocio, reportes agregados, extracción de PDF en backend y base para OCR futuro.

**Out of scope (fases futuras):** OCR de imágenes (Fase 5), deploy en producción (Fase 6), CI/CD, tests automatizados exhaustivos.

---

## 2. Arquitectura General

### 2.1 Estructura del monorepo

```
dinacuamar-comisiones/
├── backend/                    # FastAPI + Python
│   ├── app/
│   │   ├── main.py             # Entry point, crea FastAPI app
│   │   ├── config.py           # Settings con pydantic-settings
│   │   ├── database.py         # SQLAlchemy engine, session, Base
│   │   ├── models/             # Tablas SQLAlchemy
│   │   │   ├── user.py
│   │   │   ├── comisionista.py
│   │   │   ├── orden.py
│   │   │   └── liquidacion.py
│   │   ├── schemas/            # Pydantic models (request/response)
│   │   ├── routers/            # Endpoints agrupados
│   │   │   ├── auth.py
│   │   │   ├── comisionistas.py
│   │   │   ├── ordenes.py
│   │   │   ├── liquidaciones.py
│   │   │   └── reportes.py
│   │   ├── services/           # Lógica de negocio
│   │   ├── dependencies.py     # get_db, get_current_user
│   │   └── security.py         # Hash passwords, JWT encode/decode
│   ├── alembic/                # Migraciones de base de datos
│   ├── requirements.txt
│   ├── Dockerfile
│   └── docker-compose.yml      # Postgres + backend
│
├── frontend/                   # Next.js (movido desde raíz)
│   ├── src/
│   ├── package.json
│   └── ...
│
├── docs/superpowers/specs/     # Design docs
└── README.md
```

**Nota:** El código Next.js existente se mueve a `frontend/`. La raíz contiene `docker-compose.yml` y configuración compartida.

### 2.2 Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Backend | FastAPI | ^0.115.0 |
| Servidor | Uvicorn | ^0.32.0 |
| ORM | SQLAlchemy | 2.0.36 |
| Migraciones | Alembic | ^1.14.0 |
| Base de datos | PostgreSQL | 16 |
| Driver | psycopg2-binary | ^2.9.10 |
| Auth | python-jose + passlib | ^3.3.0 / ^1.7.4 |
| PDF extraction | PyMuPDF (fitz) | ^1.24.14 |
| OCR (futuro) | EasyOCR | ^1.7.2 |
| Frontend data fetching | TanStack Query (React Query) | v5 |

---

## 3. Modelo de Datos

### 3.1 Diagrama entidad-relación

```
users
├── id (PK, UUID)
├── username (unique, string)
├── email (unique, string)
├── hashed_password (string)
├── is_active (boolean, default true)
├── is_superuser (boolean, default false)
├── created_at (timestamp)
└── updated_at (timestamp)

refresh_tokens
├── id (PK, UUID)
├── user_id (FK → users.id)
├── token_hash (unique, string)
├── expires_at (timestamp)
└── created_at (timestamp)

comisionistas
├── id (PK, UUID)
├── nombre (string)
├── created_at (timestamp)
└── updated_at (timestamp)

tarifas
├── id (PK, UUID)
├── comisionista_id (FK → comisionistas.id)
├── tipo (enum: 'porcentaje' | 'fijo_kg')
├── valor (numeric)
└── created_at (timestamp)

orden_items
├── id (PK, UUID)
├── fecha (date)
├── numero_orden (string)
├── finca (string)
├── producto (string)
├── cantidad (numeric)
├── unidad (string)
├── precio_unitario (numeric)
├── total (numeric)
├── sector (string, nullable)
├── estado (enum: 'activo' | 'liquidado' | 'anulado')
├── created_at (timestamp)
└── updated_at (timestamp)

asignaciones
├── id (PK, UUID)
├── orden_item_id (FK → orden_items.id)
├── comisionista_id (FK → comisionistas.id)
└── created_at (timestamp)

 UNIQUE(orden_item_id, comisionista_id)

liquidaciones
├── id (PK, UUID)
├── nombre (string)
├── mes (string, formato YYYY-MM)
├── fecha_creacion (timestamp)
└── created_at (timestamp)

liquidacion_items
├── id (PK, UUID)
├── liquidacion_id (FK → liquidaciones.id)
├── orden_item_id (FK → orden_items.id, nullable)
├── fecha_snapshot (date)
├── numero_orden_snapshot (string)
├── finca_snapshot (string)
├── producto_snapshot (string)
├── cantidad_snapshot (numeric)
├── unidad_snapshot (string)
├── precio_unitario_snapshot (numeric)
├── total_snapshot (numeric)
├── sector_snapshot (string)
└── estado_snapshot (string)

liquidacion_item_tarifas
├── id (PK, UUID)
├── liquidacion_item_id (FK → liquidacion_items.id)
├── comisionista_id (FK → comisionistas.id)
├── comisionista_nombre_snapshot (string)
├── tipo_snapshot (enum: 'porcentaje' | 'fijo_kg')
├── valor_snapshot (numeric)
└── comision_calculada (numeric)
```

### 3.2 Decisiones de diseño del modelo

- **Tabla `tarifas` separada:** Un comisionista puede tener N tarifas (porcentaje + fijo/kg). Relación 1:N.
- **Tabla `asignaciones` intermedia:** Relación many-to-many entre órdenes y comisionistas. Una orden tiene varios comisionistas; un comisionista está en varias órdenes.
- **`orden_items.estado`:** `'activo'` = editable, aparece en pestaña Órdenes. `'liquidado'` = forma parte de una liquidación guardada. `'anulado'` = eliminación lógica.
- **Snapshot en liquidaciones:** Las tablas `liquidacion_items` y `liquidacion_item_tarifas` congelan el estado exacto de cada orden al momento de liquidar. Si un comisionista cambia su tarifa posteriormente, las liquidaciones pasadas permanecen inmutables.
- **`orden_item_id` nullable en `liquidacion_items`:** Referencia trazable al original, pero la fuente de verdad histórica son los campos `_snapshot`. Si el `orden_item` original se elimina físicamente, la referencia se vuelve `NULL` pero el snapshot permanece intacto.

### 3.3 Índices

- `users(username)` — único
- `users(email)` — único
- `refresh_tokens(token_hash)` — único
- `tarifas(comisionista_id)`
- `asignaciones(orden_item_id, comisionista_id)` — único compuesto
- `orden_items(fecha, estado)`
- `orden_items(numero_orden)`
- `liquidacion_items(liquidacion_id)`
- `liquidacion_item_tarifas(liquidacion_item_id)`

---

## 4. API REST

### 4.1 Convenciones

- Base URL: `/api/v1/`
- Auth: JWT Bearer token en header `Authorization`
- Respuesta estándar: `{ "data": ..., "message": "..." }`
- Listas paginadas: `{ "items": [], "total": N }`
- Errores: HTTP status + `{ "detail": "mensaje" }`

### 4.2 Endpoints

#### Auth

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| POST | `/auth/login` | Login, devuelve access_token + set-cookie refresh_token | Público |
| POST | `/auth/refresh` | Renueva access_token usando refresh cookie | Público |
| GET | `/auth/me` | Devuelve usuario autenticado | Requerido |
| POST | `/auth/logout` | Invalida refresh_token | Requerido |
| POST | `/auth/register` | Crea nuevo usuario | Superuser only |

#### Comisionistas

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/comisionistas` | Lista con tarifas | Requerido |
| POST | `/comisionistas` | Crea comisionista + tarifas | Requerido |
| PUT | `/comisionistas/{id}` | Actualiza nombre y reemplaza tarifas | Requerido |
| DELETE | `/comisionistas/{id}` | Elimina (valida que no esté en órdenes activas) | Requerido |

#### Órdenes (orden_items)

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/ordenes` | Lista activas, filtros: `?finca=&producto=&fecha_desde=&fecha_hasta=` | Requerido |
| POST | `/ordenes` | Batch insert de items | Requerido |
| PUT | `/ordenes/{id}` | Actualiza campos editables | Requerido |
| DELETE | `/ordenes/{id}` | Soft delete (estado = anulado). Asignaciones se mantienen para trazabilidad pero el item no aparece en listados. | Requerido |
| POST | `/ordenes/{id}/comisionistas` | Asigna comisionista | Requerido |
| DELETE | `/ordenes/{id}/comisionistas/{comisionista_id}` | Desasigna comisionista | Requerido |
| POST | `/ordenes/asignar-global` | Asigna comisionistas a múltiples órdenes | Requerido |

#### Liquidaciones

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/liquidaciones` | Lista liquidaciones | Requerido |
| POST | `/liquidaciones` | Crea liquidación + snapshots, marca órdenes como liquidado | Requerido |
| GET | `/liquidaciones/{id}` | Detalle con items snapshot y comisiones | Requerido |
| DELETE | `/liquidaciones/{id}` | Elimina liquidación, restaura órdenes a activo | Requerido |
| POST | `/liquidaciones/{id}/restaurar` | Crea nuevos `orden_items` con estado `activo` copiando los datos de snapshot, elimina la liquidación y sus snapshots. | Requerido |

#### Reportes

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/reportes/resumen` | KPIs dashboard | Requerido |
| GET | `/reportes/por-finca` | Agrupación por finca | Requerido |
| GET | `/reportes/por-producto` | Agrupación por producto | Requerido |
| GET | `/reportes/por-comisionista` | Agrupación por comisionista | Requerido |

#### Upload (Fase 4 y 5)

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| POST | `/upload/pdf` | Extrae órdenes de PDF, devuelve candidatos | Requerido |
| POST | `/upload/imagen` | OCR de imagen, devuelve candidatos (Fase 5) | Requerido |

### 4.3 Dependencias y middleware

- `get_db`: Sesión SQLAlchemy por request, auto-commit/rollback
- `get_current_user`: Valida JWT, carga usuario, rechaza si `is_active = false`
- `require_superuser`: Dependencia extra para `/auth/register`

---

## 5. Autenticación y Autorización

### 5.1 Estrategia JWT dual

| Token | Duración | Almacenamiento frontend |
|-------|----------|------------------------|
| **Access** | 15 minutos | `localStorage` |
| **Refresh** | 7 días | `httpOnly` cookie (secure, sameSite) |

### 5.2 Flujo

1. **Login:** Frontend envía credenciales → Backend valida → devuelve `access_token` en body + `Set-Cookie` con `refresh_token`.
2. **Request autenticado:** Frontend lee `access_token` de `localStorage`, lo envía en header `Authorization: Bearer <token>`.
3. **Access expirado (401):** Frontend intercepta 401, hace `POST /auth/refresh` (cookie se envía automáticamente), obtiene nuevo `access_token`, reintenta request original.
4. **Logout:** Frontend borra `access_token` de `localStorage` + llama `POST /auth/logout` (backend invalida `refresh_token` en DB).

### 5.3 Frontend auth architecture

```tsx
<AuthProvider>     // tokens, usuario, login, logout, refresh
  <ApiProvider>    // Axios instance con interceptors (Bearer + 401 refresh)
    <AppProvider>  // estado de negocio: comisionistas, ordenes, liquidaciones
```

### 5.4 Roles

- **Admin (`is_superuser = true`):** CRUD completo + crear usuarios.
- **Operador (`is_superuser = false`):** CRUD de negocio (comisionistas, órdenes, liquidaciones, reportes). No puede crear usuarios.

El primer usuario se crea vía script CLI: `python -m app.commands.create_superuser`.

---

## 6. Estrategia de Migración Frontend

### 6.1 Data fetching: TanStack Query v5

React Query maneja caché inteligente, revalidación, estados de loading/error y invalidación de queries tras mutaciones.

### 6.2 Refactor de AppContext

La interfaz pública de `AppContextType` se mantiene estable. Cada función que antes mutaba `localStorage` ahora realiza una llamada async a la API:

```tsx
// Antes
const addComisionista = useCallback((c) => {
  setComisionistas(prev => [...prev, { ...c, id: generarId() }]);
  toast.success('Comisionista creado');
}, [setComisionistas]);

// Después
const addComisionista = useCallback(async (c) => {
  const nuevo = await api.comisionistas.create(c);
  queryClient.invalidateQueries({ queryKey: ['comisionistas'] });
  toast.success('Comisionista creado');
}, []);
```

### 6.3 Migración por sub-fases

| Sub-fase | Feature | Descripción |
|----------|---------|-------------|
| 3a | Comisionistas | CRUD más simple, independiente |
| 3b | Órdenes | Items + asignaciones. PDF upload temporalmente en frontend |
| 3c | Liquidaciones | Guardar, listar, eliminar, restaurar |
| 3d | Reportes y Dashboard | KPIs y gráficos consumiendo endpoints de agregación |
| 3e | Export PDF/Excel | Migración opcional al backend |

### 6.4 Demo data

El backend expone `POST /api/v1/seed` (solo en desarrollo) que pobla la base de datos con datos de demo. El frontend ya no precarga desde `localStorage`; si la BD está vacía, el usuario ve pantalla vacía o puede clickear "Cargar datos de demo".

---

## 7. Docker y Desarrollo Local

### 7.1 Servicios

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: dinacuamar
      POSTGRES_USER: dinacuamar
      POSTGRES_PASSWORD: dinacuamar
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]

  backend:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql://dinacuamar:dinacuamar@postgres:5432/dinacuamar
      JWT_SECRET_KEY: dev-secret-cambiar-en-produccion
      JWT_ALGORITHM: HS256
      ACCESS_TOKEN_EXPIRE_MINUTES: 15
      REFRESH_TOKEN_EXPIRE_DAYS: 7
      CORS_ORIGINS: http://localhost:3000
    volumes: [./backend:/app]
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000/api/v1
    volumes: [./frontend:/app, /app/node_modules]
    command: pnpm dev
```

### 7.2 Comandos de setup

```bash
docker-compose up -d
docker-compose exec backend alembic upgrade head
docker-compose exec backend python -m app.commands.create_superuser admin admin123
docker-compose exec backend python -m app.commands.seed_demo  # opcional
```

### 7.3 Dependencias Python

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
sqlalchemy==2.0.36
alembic==1.14.0
psycopg2-binary==2.9.10
pydantic==2.9.0
pydantic-settings==2.6.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.17
PyMuPDF==1.24.14
easyocr==1.7.2
pillow==11.0.0
```

---

## 8. OCR y Roadmap

### 8.1 Arquitectura OCR (Fase 5)

```
Frontend (imagen JPG)
    → POST /api/v1/upload/imagen
    → Backend: Preprocess (Pillow: resize, contrast, grayscale)
    → EasyOCR (español + números)
    → Post-process (regex, fuzzy match)
    → Response: candidatos OrdenItem[]
```

**EasyOCR** es la elección inicial por ser puro Python, buen soporte español y fácil instalación. Si la precisión no es suficiente con muestras reales de DINACUAMAR, se evalúa migrar a PaddleOCR o modelo LLM multimodal.

### 8.2 Diseño desacoplado

`/api/v1/upload/imagen` y `/api/v1/upload/pdf` comparten la misma interfaz de salida: array de `OrdenItem` candidatos. El frontend no distingue la fuente. Esto permite implementar PDF backend (Fase 4) sin anticipar OCR, y enchufar OCR después sin tocar el frontend.

### 8.3 Roadmap de fases

| Fase | Entregable | Semanas estimadas |
|------|-----------|-------------------|
| **1** | Backend core (API CRUD + PostgreSQL + seed) + Docker | 1-2 |
| **2** | Auth JWT + refresh tokens + login page + protected routes | 1 |
| **3** | Frontend integración con API (React Query, feature por feature) | 2-3 |
| **4** | PDF extraction migrado a backend (`PyMuPDF`) | 1 |
| **5** | OCR para imágenes (`EasyOCR`) | 1-2 |
| **6** | Seguridad hardening + testing + deploy producción | 1 |

**Total estimado: 7-10 semanas**

### 8.4 Decisiones aplazables

- Hosting cloud: Fase 6
- CI/CD (GitHub Actions): Después de Fase 3
- Tests automatizados (Pytest + Playwright): Fase 6
- Backup de BD en producción: Fase 6

---

## 9. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Migración frontend más compleja de lo estimado | Alto | Mantener interfaz de `useApp()` estable. Migrar feature por feature. Fallback a datos mock si un endpoint falla. |
| OCR con baja precisión en fotos reales | Medio | Fase 5 tiene alternativas evaluadas (PaddleOCR, LLM). Se recolectan muestras reales para ajustar. |
| Datos de demo no representativos | Bajo | El endpoint `/seed` se ajusta con datos reales tan pronto como estén disponibles. |
| Seguridad JWT insuficiente para escenario real | Medio | Fase 6 dedicada a hardening. Por ahora es adecuado para app interna. |

---

## 10. Glosario

- **OrdenItem:** Línea de orden de compra individual (producto, cantidad, precio, finca).
- **Liquidación:** Agrupación mensual de órdenes activas que se archivan con snapshot inmutable.
- **Snapshot:** Copia congelada de datos en el momento de una liquidación, inmune a cambios futuros.
- **Asignación:** Relación entre un comisionista y una orden (many-to-many).

---

*Documento generado mediante proceso de brainstorming. Aprobado para implementación.*
