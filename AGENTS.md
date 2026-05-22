# AGENTS.md — Dinacuamar Comisiones

> Archivo de referencia para agentes de código. Todo el proyecto está en español.

## Visión General del Proyecto

**Dinacuamar — Sistema de Liquidación de Comisiones** es una aplicación web interna para INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA.LTDA. Su propósito es gestionar la liquidación de comisiones a comisionistas por órdenes de compra de productos acuícolas (camarón, tilapia, etc.).

La app es **100% cliente** (sin backend propio). Los datos se persisten en `localStorage` del navegador. No hay base de datos ni API externa para el estado principal.

### Funcionalidades clave
- CRUD de comisionistas con tarifas múltiples (porcentaje y/o fijo por kg).
- Carga de órdenes de compra desde **PDF** (formato específico de la empresa) y edición manual.
- Asignación de comisionistas a ítems de orden (múltiples comisionistas por ítem).
- Cálculo automático de comisiones según tarifas.
- Guardado de liquidaciones mensuales en historial.
- Exportación de liquidaciones a **PDF** y **Excel**.
- Dashboard con KPIs y gráficos (barras, pie).
- Reportes filtrados por fecha, finca, producto y comisionista.

---

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.4 |
| React | React | 19.2.4 |
| Lenguaje | TypeScript | 5.9.3 |
| Estilos | Tailwind CSS | 4.3.0 |
| UI Components | shadcn/ui (`base-nova` style) + `@base-ui/react` | ^1.4.1 |
| Iconos | lucide-react | ^1.14.0 |
| Gráficos | recharts | ^3.8.1 |
| PDF (generación) | jspdf + jspdf-autotable | ^4.2.1 / ^5.0.7 |
| PDF (extracción) | pdfjs-dist | ^5.7.284 |
| Excel | xlsx | ^0.18.5 |
| Toast | sonner | ^2.0.7 |
| Gestor de paquetes | pnpm | 11.2.2 |
| Node requerido | >= 22.13.0 | — |

**Nota importante sobre Next.js:** esta versión (16.x) tiene cambios significativos respecto a versiones anteriores. Antes de escribir código, consulta la guía en `node_modules/next/dist/docs/` y respeta los avisos de deprecación.

---

## Estructura de Carpetas

```
src/
├── app/                    # App Router de Next.js (páginas)
│   ├── page.tsx            # Dashboard (tablero principal)
│   ├── layout.tsx          # Root layout con AppProvider + fuente IBM Plex Sans
│   ├── globals.css         # Tailwind + variables CSS + utilidades custom
│   ├── comisionistas/page.tsx
│   ├── ordenes/page.tsx
│   ├── liquidacion/page.tsx
│   ├── historial/page.tsx
│   ├── historial/[id]/page.tsx   # Detalle de liquidación guardada
│   └── reportes/page.tsx
├── components/
│   ├── Shell.tsx           # Layout envolvente con Header y max-width
│   ├── Header.tsx          # Navegación principal + botón "Restaurar demo"
│   ├── dashboard/DashboardTab.tsx
│   ├── comisionistas/ComisionistasTab.tsx
│   ├── ordenes/OrdenesTab.tsx
│   ├── liquidacion/LiquidacionTab.tsx
│   ├── historial/HistorialTab.tsx
│   ├── reportes/ReportesTab.tsx
│   └── ui/                 # Componentes de shadcn/ui (button, card, dialog, etc.)
├── context/
│   └── AppContext.tsx      # Estado global: comisionistas, ordenItems, liquidaciones
├── hooks/
│   └── useLocalStorage.ts  # Hook con hidratación segura para SSR
├── lib/
│   ├── utils.ts            # `cn()` para merge de clases Tailwind
│   ├── id.ts               # `generarId()` — crypto.randomUUID o fallback
│   ├── demo-data.ts        # Datos de demostración precargados
│   ├── pdf-extractor.ts    # Parser de PDFs de órdenes de compra
│   └── export-utils.ts     # Cálculo de comisiones + export PDF/Excel + reportes
└── types/
    └── index.ts            # Interfaces TypeScript del dominio
```

### Convenciones de código
- **Idioma:** todo el código, comentarios, nombres de variables visibles al usuario y documentación están en **español**.
- **Alias de rutas:** se usa `@/` mapeado a `./src/*` (ver `tsconfig.json`).
- **Componentes UI:** todos los componentes base están en `src/components/ui/` y siguen el patrón de shadcn/ui (usando `@base-ui/react` primitives + `cva` + `cn`).
- **Estilos:** se usa Tailwind CSS v4 con `@import "tailwindcss"` en `globals.css`. Las utilidades custom se definen en `@layer utilities`.
- **Client components:** la gran mayoría de componentes usan `'use client'` porque dependen de estado local, contexto o interacciones del DOM.

---

## Flujo de Datos y Estado

### AppContext (`src/context/AppContext.tsx`)
Provee el estado global mediante React Context. Los tres arrays principales se guardan en `localStorage`:

1. **`comisionistas`** — agentes con array de `tarifas: { tipo, valor }[]`.
2. **`ordenItems`** — ítems activos (los que se pueden editar y asignar).
3. **`liquidaciones`** — liquidaciones guardadas (archivo histórico).

### Migración de datos
Existe lógica de migración automática de un schema antiguo (legacy) al actual:
- Comisionistas antes tenían un solo `tipo` + `valor`; ahora tienen `tarifas[]`.
- Órdenes antes tenían `comisionistaId: string | null`; ahora tienen `comisionistas: AsignacionComisionista[]`.
- La migración se ejecuta una sola vez si detecta datos legacy en `localStorage`.

### Datos de demo
Si no hay nada en `localStorage`, se precargan automáticamente los datos de demo definidos en `src/lib/demo-data.ts`.

---

## Cálculo de Comisiones

Las comisiones se calculan en `src/lib/export-utils.ts`:

- **Porcentaje:** `total * (valor / 100)`
- **Fijo por kg:** `cantidad_en_kg * valor` (con conversión automática de libras a kg)
- **Múltiples tarifas:** un comisionista puede tener varias tarifas; se suman.
- **Múltiples comisionistas:** un ítem puede tener varios comisionistas asignados; cada uno cobra su comisión independiente.

---

## Extracción de PDF

`src/lib/pdf-extractor.ts` está **altamente especializado** para el formato de PDF "ORDEN DE COMPRA" de DINACUAMAR. No es un parser genérico.

- Usa `pdfjs-dist` con import dinámico para evitar problemas de SSR.
- El worker se carga vía CDN: `https://cdn.jsdelivr.net/npm/pdfjs-dist@.../legacy/build/pdf.worker.mjs`.
- Extrae texto posicional (coordenadas X/Y) para identificar filas de la tabla, fincas, cantidades, precios y totales.
- Si falla la extracción de fecha del PDF, hace fallback al nombre del archivo o a la fecha actual.

**Advertencia:** modificar esta lógica puede romper la carga de PDFs reales de la empresa.

---

## Comandos de Build y Desarrollo

```bash
# Instalar dependencias
pnpm install

# Servidor de desarrollo
pnpm dev              # http://localhost:3000

# Build de producción
pnpm build

# Iniciar en producción (requiere build previo)
pnpm start

# Linting
pnpm lint
```

### Docker
Existe un `Dockerfile` multi-stage que genera una imagen de producción con `output: "standalone"`:

```bash
docker build -t dinacuamar-comisiones .
docker run -p 3000:3000 dinacuamar-comisiones
```

La imagen final usa el usuario `nextjs` (no root) y expone el puerto `3000`.

---

## Testing

**No hay framework de testing configurado** en este proyecto. No existe Jest, Vitest, Playwright ni Cypress. Si se agrega uno, debe respetar las convenciones del proyecto y preferirmente usar pnpm.

---

## Seguridad y Consideraciones

- **Sin autenticación:** la app es pública una vez desplegada. No hay login ni roles.
- **Datos locales:** toda la información sensible (nombres de comisionistas, montos) vive en `localStorage` del navegador del usuario. No se transmite a ningún servidor.
- **No hay API externa:** salvo el CDN de `pdfjs-dist` para el worker, la app no hace peticiones de red para funcionalidades principales.
- **Validación de inputs:** se usa confirmación nativa del navegador (`confirm()`) para acciones destructivas (eliminar liquidaciones, restaurar demo).

---

## Notas para el Agente

- Antes de modificar componentes de `src/components/ui/`, verifica si son parte del sistema shadcn/ui; algunos usan primitivas de `@base-ui/react`.
- Si agregas un nuevo campo a los tipos (`src/types/index.ts`), revisa si necesitas actualizar la lógica de migración en `AppContext.tsx`.
- Al trabajar con fechas, usa el formato ISO (`YYYY-MM-DD`) internamente y `toLocaleDateString('es-ES')` para mostrar al usuario.
- El formato numérico visible al usuario usa locale español: `1.234,56`.
- No elimines ni modifiques la lógica de migración legacy sin entender el impacto en datos existentes de usuarios.
- Para nuevas páginas, sigue el patrón: `page.tsx` envuelve `<Shell><MiTab /></Shell>`.
