# AGENTS.md — Dinacuamar Comisiones

> Todo el código, comentarios y documentación están en **español**.
> CLAUDE.md es un alias que apunta a este archivo.

## Arquitectura

- **Frontend:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui (`base-nova` + `@base-ui/react`), React Query v5
- **Backend:** FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL 16
- **Auth:** JWT dual-token (access en localStorage, refresh en cookie httpOnly con rotación)
- **Infra:** Docker Compose (dos archivos: dev y prod), nginx como reverse proxy en prod
- **Gestor de paquetes:** pnpm 11.2.2, Node >= 22.13.0
- **CI:** GitHub Actions — 3 jobs en paralelo: backend-test, frontend-build, frontend-lint

## Comandos

```bash
# Frontend (raíz del repo)
pnpm dev              # http://localhost:3000 (requiere backend en :8000)
pnpm build            # Build + type-check (no hay comando typecheck separado)
pnpm lint             # ESLint con eslint-config-next (core-web-vitals + typescript)
pnpm test:e2e         # Playwright — solo inicia frontend; backend debe correr por separado

# Backend (cd backend/)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pytest                # Usa SQLite en memoria, NO necesita PostgreSQL corriendo
alembic upgrade head
python -m app.commands.create_superuser
python -m app.commands.seed_demo

# Docker dev: backend + postgres (frontend se corre aparte con pnpm dev)
docker-compose up --build

# Docker prod: stack completo
docker-compose -f docker-compose.prod.yml up --build -d
```

## Testing

- **Backend tests** (`backend/tests/`): `pytest` sin PostgreSQL — conftest.py reemplaza el engine por SQLite `:memory:` con `StaticPool`. El CI instala `pytest-asyncio` pero no se usa (los fixtures son síncronos).
- **E2E** (`e2e/`): Playwright solo contra Chromium. `webServer` en config levanta `pnpm dev` (frontend), pero el backend debe estar corriendo aparte.
- Ejecutar un test individual: `pytest backend/tests/test_auth.py::test_login_success -v`

## Convenciones que difieren del default

- **Idioma:** español en código, comentarios, variables, endpoints, nombres de tablas y commits.
- **Alias:** `@/` mapea a `./src/` (tsconfig paths).
- **API routes:** prefijo `/api/v1/`, kebab-case.
- **Modelos SQLAlchemy:** snake_case. **Schemas Pydantic expuestos al frontend:** camelCase.
- **Frontend ↔ Backend serialización:** `src/lib/transform.ts` convierte snake_case ↔ camelCase recursivamente. Toda request se envía con `toSnakeCase()`, toda response se recibe con `toCamelCase()`.
- **Formato numérico:** `1.234,56` (locale español).
- **Fechas:** ISO `YYYY-MM-DD` internamente, `toLocaleDateString('es-ES')` para UI.
- **Tailwind v4:** usa `@import "tailwindcss"` en `globals.css`, utilidades custom en `@layer utilities`. PostCSS con `@tailwindcss/postcss`.
- **Componentes UI:** shadcn/ui con `style: "base-nova"` y `@base-ui/react` primitives.
- **next.config.ts:** `output: "standalone"` para Docker.

## Normalización — sincronización obligatoria

El matching de entidades (cliente, producto, finca) usa normalización de texto en **dos archivos que deben mantenerse idénticos**:
- `src/lib/normalization.ts` (frontend)
- `backend/app/services/catalog_normalization.py` (backend)

Si modificas uno, replica el cambio en el otro. Funciones clave: `normalizarTexto()`, `normalizarNombreFinca()`, `normalizarNombreProducto()`.

## Cálculo de comisiones — jerarquía no obvia

1. Tarifa específica exacta (comisionista + cliente + producto + finca)
2. Tarifa específica sin finca (`finca_id IS NULL`)
3. Tarifas globales (`Tarifa`) **solo** si el comisionista no tiene ninguna específica configurada
4. Si tiene específicas pero ninguna aplica → comisión = **0** (no hay fallback a globales)

Implementado tanto en frontend (`src/lib/export-utils.ts`) como backend (`backend/app/services/liquidacion.py`).

Tipos de tarifa: `porcentaje` (sobre total menos retención del cliente, default 1.75%), `fijo_kg`, `fijo_unidad`.

## Autenticación

Flujo JWT dual-token con refresh silencioso en el interceptor de axios (`src/lib/api.ts`):
- 401 → intenta `POST /api/v1/auth/refresh` → si falla, redirige a `/login`
- Registro de usuarios solo para superusuarios (`is_superuser = true`)
- En producción: `CORS_ORIGINS` sin wildcards (levanta `RuntimeError` en startup), `JWT_SECRET_KEY` >= 32 chars

## Extracción de órdenes (PDF/imagen)

- Backend usa PyMuPDF (PDF) y easyocr (imágenes). Endpoints: `POST /api/v1/upload/pdf` e `POST /api/v1/upload/imagen`.
- IA opcional con OpenAI (`AI_EXTRACTION_ENABLED`, modelo gpt-4.1-mini por defecto).
- **Nunca** registres en logs el contenido de archivos subidos ni el texto extraído.
- El frontend conserva `src/lib/pdf-extractor.ts` (legacy cliente-side), pero las subidas reales van contra backend.

## Seed de datos

- `POST /api/v1/admin/seed-real` (superusuario): limpia tablas y carga catálogos + tarifas desde `Copia de COMISIONES GENERAL.xlsx`.
- `POST /api/v1/admin/seed-demo`: datos de prueba.
- El archivo Excel es fuente de datos real; no mover ni renombrar sin actualizar `backend/app/commands/seed_tarifas_excel.py`.
- Ojo: `seedDemo()` en `src/lib/api.ts` llama a `/admin/seed-real`, no a seed-demo.

## Agregar un nuevo campo

Si añades un campo a `src/types/index.ts`, revisa la cadena completa:
1. Modelo SQLAlchemy (`backend/app/models/`)
2. Schema Pydantic (`backend/app/schemas/`)
3. Router (si expone relaciones anidadas)
4. `src/lib/transform.ts` (si el campo necesita transformación snake/camel)

## Routers backend

Registrados en `backend/app/main.py` con prefijo `/api/v1/`:
- `auth`, `comisionistas`, `clientes`, `productos`, `tarifas_cliente_producto`, `ordenes`, `liquidaciones`, `reportes`, `upload`, `admin`, `proveedores`, `diagnostico`

## Notas rápidas

- `pnpm build` hace type-checking (no existe `pnpm typecheck` separado).
- Backend tests corren con SQLite — no necesitas PostgreSQL para tests unitarios.
- E2E: `pnpm test:e2e` levanta frontend automáticamente pero el backend debe correr aparte.
- Próximo paso después de `docker-compose up`: crear superusuario y hacer seed.
- No modificar `backend/app/services/pdf_extractor.py` sin entender su impacto en órdenes reales.
- Componentes en `src/components/ui/` son parte de shadcn/ui con primitivas `@base-ui/react`; no reescribir sin revisar su estructura.
- Agregar dependencia Python → actualizar `backend/requirements.txt`.
- Agregar dependencia Node → usar `pnpm add` (actualiza `pnpm-lock.yaml` automáticamente).
