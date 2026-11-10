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
- **Matcher frontend** (`src/lib/export-utils.test.ts`): `pnpm test:matcher` — cubre AGUA/SALUD, PASTILLAS TH/GRANDES y fincas hermanas; corre en CI.
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

### Matching de tarifas: IDs primero, difuso solo para typos

- Si ambos lados traen ID (`clienteId`, `productoId`, `fincaId`), **el ID manda**. No se cae a nombre ni a difuso cuando los IDs difieren.
- El fallback difuso solo aplica a datos legacy sin ID y solo acepta typos dentro de una misma palabra. **Nunca** acepta sustituir una variante completa: `AGUA ≠ SALUD`, `PAST TH ≠ PASTILLAS GRANDES`, `CALCIUM ≠ CALCINIT`, `CORVINERO A ≠ CORVINERO C`.
- Implementación en paridad: `src/lib/normalization.ts` (`esCoincidenciaSegura`) y `backend/app/services/fuzzy_matching.py` (`es_coincidencia_segura`).
- Regresión cubierta por `pnpm test:matcher` y `backend/tests/test_fuzzy_matching.py`.

## Retención — por periodo de vigencia

La retención NO se guarda por cliente: vive en la tabla `retenciones`, con una
sola columna `vigente_desde` por periodo (cada periodo termina donde empieza el
siguiente). La retención de una factura es la del periodo con el mayor
`vigente_desde <= orden_item.fecha`.

**Se ancla a la fecha de EMISIÓN de la factura, no a `_fecha_efectiva()`**, que
resuelve la vigencia de las *tarifas* por fecha de pago. Son dos anclas
temporales distintas a propósito: el cliente pidió explícitamente que la
retención aplique "por fecha de factura, no por fecha de liquidación". No
unificarlas "por consistencia".

La resolución vive en dos archivos que deben mantenerse en paridad:
- `backend/app/services/retencion.py` → `retencion_para()`
- `src/lib/export-utils.ts` → `retencionPara()`

Los tramos se cargan por migración, no desde la UI. Agregar un tramo nuevo es
una migración con un `op.bulk_insert` de una fila.

## Cálculo de comisiones — jerarquía no obvia

1. Tarifa específica exacta (comisionista + cliente + producto + finca)
2. Tarifa específica sin finca (`finca_id IS NULL`)
3. Tarifas globales (`Tarifa`) **solo** si el comisionista no tiene ninguna específica configurada
4. Si tiene específicas pero ninguna aplica → comisión = **0** (no hay fallback a globales)

Implementado tanto en frontend (`src/lib/export-utils.ts`) como backend (`backend/app/services/liquidacion.py`).

Tipos de tarifa: `porcentaje` (sobre total menos la retención vigente por periodo — ver sección Retención), `fijo_kg`, `fijo_unidad`.

## Unidades: la cantidad no siempre significa lo mismo

Órdenes de compra y facturas conviven en la tabla `ordenes`, pero expresan la cantidad distinto:

- **OC:** `cantidad` = número de envases (63 tachos, 1700 sacos). El PDF nombra el envase en `unidad`.
- **Factura:** no trae columna de unidad; `cantidad` viene en **kg** (o litros). El prompt de `openai_extractor.py` le prohíbe a la IA nombrar un envase acá — si pone "tachos", la comisión se multiplica por 10.

De ahí que cada tipo de tarifa se cobre en su propia unidad:

```
fijo_kg     → cantidad_en_kg × valor
fijo_unidad → cantidad_en_envases × valor    ($/saco, $/tacho, $/litro)
```

La conversión kg↔envases sale de `producto`: `tacho_kilos` (default 10), `saco_kilos` (default 25), caneca = 20. Si `unidad` nombra un envase, la cantidad está en envases; si no, ya está en kg.

Según la matriz de tarifas del cliente, el valor en $ es **por kg**, salvo: CITRIUS y MORTAL CONTROL/SHELL (por litro, ≈ kg), CALCINIT/NITRATO DE CALCIO (por saco de 25 kg) y NATUXTRACT (por tacho de 15 kg). Estos dos últimos van como `fijo_unidad`; cargarlos como `fijo_kg` paga 25x y 15x de más.

En exportaciones (Excel/PDF), la vista de Liquidación y los reportes, la columna de cantidad muestra la **cantidad base** con la que se cobra la tarifa `fijo_kg` (`getCantidadMostrar` / `_cantidad_para_tarifa_kg`: envases → kg o litros; las facturas en kg/litros no cambian). El dato original de la OC se conserva en la columna `Envases` de la hoja principal. En liquidaciones guardadas se usa `cantidad_kg_snapshot`, congelado al liquidar, para que el histórico no dependa del tamaño de envase actual del producto.

## Autenticación

Flujo JWT dual-token con refresh silencioso en el interceptor de axios (`src/lib/api.ts`):
- 401 → intenta `POST /api/v1/auth/refresh` → si falla, redirige a `/login`
- Registro de usuarios solo para superusuarios (`is_superuser = true`)
- En producción: `CORS_ORIGINS` sin wildcards (levanta `RuntimeError` en startup), `JWT_SECRET_KEY` >= 32 chars

## Extracción de órdenes (PDF/imagen)

- Backend usa PyMuPDF (PDF) y easyocr (imágenes). Endpoints: `POST /api/v1/upload/pdf` e `POST /api/v1/upload/imagen`.
- IA opcional con OpenAI (`AI_EXTRACTION_ENABLED`, modelo gpt-4.1-mini por defecto). Requiere `OPENAI_API_KEY`: con el flag encendido y la key vacía el backend no arranca.
- Las OC de DINACUAMAR se extraen con el parser posicional, no con IA: la IA confunde la columna PEDIDO con la cantidad. La IA se usa para formatos no reconocidos y como respaldo si el parser no encuentra ítems.
- **Cuadre obligatorio:** la suma de los ítems extraídos debe coincidir con el `SUB-TOTAL` impreso (tolerancia 0,1%). Si no cuadra, `extraer_orden_de_pdf` lanza error y la orden no se carga; nunca se guarda un parseo parcial. Aplica también al respaldo de IA.
- **Corpus de regresión:** toda OC real que falle se guarda en `backend/tests/fixtures/ordenes/` como `<caso>.pdf` + `<caso>.json` (salida esperada de `extraer_orden_de_pdf`). El JSON se genera desde el parser pero se revisa a mano contra el PDF (líneas, cantidades y SUB-TOTAL) antes de commitear. CI corre todos los casos; no borrar fixtures.
- El cliente (comprador) de una OC se detecta desde el encabezado comparando contra el catálogo; el selector de la vista previa sigue mandando si se eligió uno.
- **Nunca** registres en logs el contenido de archivos subidos ni el texto extraído.
- El frontend conserva `src/lib/pdf-extractor.ts` (legacy cliente-side), pero las subidas reales van contra backend.

## Datos y migraciones

- **La configuración (catálogos + tarifas) vive en migraciones de Alembic**, no en seeds ni Excel. `alembic upgrade head` (lo corre `entrypoint.sh`) la aplica sin borrar órdenes ni liquidaciones.
- Las 3 matrices vigentes están congeladas en `backend/alembic/versions/a7b8c9d0e1f2_datos_matrices_vigentes.py` y los PDFs originales quedan en `backend/matrices/` como respaldo.
- Actualizar tarifas = **una migración nueva** con los cambios (como `retenciones`). No reseed destructivo.
- En el monto fijo el producto define la unidad: `CALCINIT` y `NATUXTRACT` van como `fijo_unidad`; kg y litros como `fijo_kg`.
- La migración desactiva las tarifas activas de esos clientes que ya no figuran en las matrices; CASTRO queda cerrado hasta 31/07/2026 y NARANJO JUNIOR mantiene el umbral de 1.000 kg.
- `python -m app.commands.seed_demo` sigue existiendo solo para datos de demostración.
- **Deuda conocida:** la cadena de migraciones no puede crear una base desde cero (la base original se creó con `metadata.create_all` y quedó estampada; faltan tablas base como `liquidacion_items` y los enums se crearon a mano). En bases existentes `alembic upgrade head` funciona; para instalaciones nuevas hay que hacer un squash/baseline antes.

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
- Próximo paso después de `docker-compose up`: crear superusuario (`python -m app.commands.create_superuser`). La configuración se carga sola con `alembic upgrade head`.
- No modificar `backend/app/services/pdf_extractor.py` sin entender su impacto en órdenes reales.
- Componentes en `src/components/ui/` son parte de shadcn/ui con primitivas `@base-ui/react`; no reescribir sin revisar su estructura.
- Agregar dependencia Python → actualizar `backend/requirements.txt`.
- Agregar dependencia Node → usar `pnpm add` (actualiza `pnpm-lock.yaml` automáticamente).
