# Retención por periodos de vigencia — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la retención aplicada a cada factura sea la vigente en su fecha de emisión, registrada en una tabla global de periodos, en vez de un campo escalar por cliente.

**Architecture:** Una tabla `retenciones` con una sola columna de fecha (`vigente_desde`); cada periodo termina donde empieza el siguiente, lo que hace imposible registrar huecos o solapes. Backend y frontend resuelven la retención buscando el periodo con el mayor `vigente_desde <= orden_item.fecha`. Se elimina `clientes.retencion_porcentaje`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL 16 (tests en SQLite in-memory), Next.js 16 App Router, TypeScript, React Query v5.

**Spec:** `docs/superpowers/specs/2026-07-21-retencion-por-periodos-design.md`

## Global Constraints

- Todo el código, comentarios, docstrings y mensajes de commit van en **español**.
- Modelos SQLAlchemy en `snake_case`; schemas Pydantic expuestos al frontend en `camelCase` vía alias. `src/lib/transform.ts` hace la conversión automática en ambos sentidos.
- Tramos de retención: `vigente_desde = 1900-01-01` → **1.75**; `vigente_desde = 2026-03-01` → **2.00**.
- La retención se ancla a **`orden_item.fecha`** (fecha de emisión de la factura). **NO** usar `_fecha_efectiva()` de `liquidacion.py`, que resuelve la vigencia de *tarifas* por fecha de pago. La divergencia es deliberada; está documentada en la spec.
- La retención solo afecta a tarifas de tipo `porcentaje`. Las de `fijo_kg` y `fijo_unidad` no la usan.
- **No** modificar liquidaciones existentes: su `retencion_porcentaje_snapshot` queda congelado tal cual.
- Cabeza actual de Alembic: `a1b3c5d7e9f2`. Encadenar las migraciones nuevas a partir de ahí.
- Los tests de backend corren con SQLite in-memory y crean las tablas desde los modelos (`Base.metadata.create_all`), **no** desde las migraciones. Por tanto la tabla `retenciones` está **vacía** en los tests: cada test que necesite periodos debe insertarlos.
- `pnpm build` hace el type-check; no existe `pnpm typecheck`.

---

### Task 1: Modelo `Retencion` y migración que crea la tabla con sus tramos

**Files:**
- Create: `backend/app/models/retencion.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/b2e4d6f8a0c1_crear_tabla_retenciones.py`
- Test: `backend/tests/test_retencion.py`

**Interfaces:**
- Consumes: `app.models.base.BaseModel` (aporta `id: Uuid` PK con default `uuid4` y `created_at: DateTime`).
- Produces: clase `Retencion` con `__tablename__ = "retenciones"`, atributos `vigente_desde: Date` (NOT NULL, UNIQUE) y `porcentaje: Numeric(5, 2)` (NOT NULL). La usan las tareas 2, 3, 4.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/test_retencion.py`:

```python
from datetime import date
from decimal import Decimal

from app.models.retencion import Retencion


def test_persiste_un_periodo_de_retencion(db_session):
    periodo = Retencion(vigente_desde=date(2026, 3, 1), porcentaje=Decimal("2.00"))
    db_session.add(periodo)
    db_session.commit()

    guardado = db_session.query(Retencion).one()

    assert guardado.vigente_desde == date(2026, 3, 1)
    assert guardado.porcentaje == Decimal("2.00")
    assert guardado.id is not None
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && pytest tests/test_retencion.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.models.retencion'`

- [ ] **Step 3: Crear el modelo**

Crear `backend/app/models/retencion.py`:

```python
from sqlalchemy import Column, Date, Numeric

from app.models.base import BaseModel


class Retencion(BaseModel):
    """Retención legal aplicable a las facturas, por periodo de vigencia.

    Cada periodo termina donde empieza el siguiente: por eso no hay
    `vigente_hasta`. Con una sola fecha por fila es imposible registrar huecos
    o solapes entre periodos.

    La retención de una factura es la del periodo con el mayor `vigente_desde`
    menor o igual a la fecha de EMISIÓN de la factura.
    """

    __tablename__ = "retenciones"

    vigente_desde = Column(Date, nullable=False, unique=True)
    porcentaje = Column(Numeric(5, 2), nullable=False)
```

- [ ] **Step 4: Registrar el modelo en el paquete**

En `backend/app/models/__init__.py`, agregar el import junto a los demás (después de la línea `from app.models.grupo import Grupo`):

```python
from app.models.retencion import Retencion
```

Y agregar `"Retencion",` al final de la lista `__all__`, antes del corchete de cierre.

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `cd backend && pytest tests/test_retencion.py -v`
Expected: PASS

- [ ] **Step 6: Crear la migración que crea la tabla y siembra los tramos**

Crear `backend/alembic/versions/b2e4d6f8a0c1_crear_tabla_retenciones.py`:

```python
"""crear tabla retenciones con sus periodos de vigencia

Revision ID: b2e4d6f8a0c1
Revises: a1b3c5d7e9f2
Create Date: 2026-07-21

"""
import uuid
from datetime import date
from decimal import Decimal
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2e4d6f8a0c1"
down_revision: Union[str, None] = "a1b3c5d7e9f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    retenciones = op.create_table(
        "retenciones",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column("vigente_desde", sa.Date(), nullable=False, unique=True),
        sa.Column("porcentaje", sa.Numeric(5, 2), nullable=False),
    )
    # Tramos comunicados por el cliente: 1.75% hasta el 28-feb-2026 y 2% desde
    # el 1-mar-2026. El tramo de 1900 cubre todo el histórico anterior.
    op.bulk_insert(
        retenciones,
        [
            {
                "id": uuid.uuid4(),
                "vigente_desde": date(1900, 1, 1),
                "porcentaje": Decimal("1.75"),
            },
            {
                "id": uuid.uuid4(),
                "vigente_desde": date(2026, 3, 1),
                "porcentaje": Decimal("2.00"),
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("retenciones")
```

- [ ] **Step 7: Verificar que la suite completa sigue verde**

Run: `cd backend && pytest -q`
Expected: PASS, sin tests rotos.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/retencion.py backend/app/models/__init__.py backend/alembic/versions/b2e4d6f8a0c1_crear_tabla_retenciones.py backend/tests/test_retencion.py
git commit -m "feat(retencion): modelo Retencion y migración con los periodos de vigencia"
```

---

### Task 2: Servicio de resolución de la retención por fecha

**Files:**
- Create: `backend/app/services/retencion.py`
- Test: `backend/tests/test_retencion.py` (agregar al archivo de la Task 1)

**Interfaces:**
- Consumes: `Retencion` de la Task 1.
- Produces:
  - `cargar_periodos(db: Session) -> list[Retencion]` — periodos ordenados por `vigente_desde` **descendente**.
  - `retencion_para(periodos: list[Retencion], fecha: date) -> Decimal` — porcentaje vigente en esa fecha.
  - `RETENCION_POR_DEFECTO: Decimal` = `Decimal("1.75")`.
  Las usa la Task 3.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `backend/tests/test_retencion.py`:

```python
from app.services.retencion import cargar_periodos, retencion_para


def _sembrar_periodos(db_session):
    """Los mismos tramos que siembra la migración."""
    db_session.add_all([
        Retencion(vigente_desde=date(1900, 1, 1), porcentaje=Decimal("1.75")),
        Retencion(vigente_desde=date(2026, 3, 1), porcentaje=Decimal("2.00")),
    ])
    db_session.commit()


def test_carga_periodos_del_mas_reciente_al_mas_antiguo(db_session):
    _sembrar_periodos(db_session)

    periodos = cargar_periodos(db_session)

    assert [p.vigente_desde for p in periodos] == [date(2026, 3, 1), date(1900, 1, 1)]


def test_factura_del_ultimo_dia_de_febrero_retiene_1_75(db_session):
    _sembrar_periodos(db_session)
    periodos = cargar_periodos(db_session)

    assert retencion_para(periodos, date(2026, 2, 28)) == Decimal("1.75")


def test_factura_del_primer_dia_de_marzo_retiene_2(db_session):
    """El borde exacto entre tramos: `vigente_desde` es inclusivo."""
    _sembrar_periodos(db_session)
    periodos = cargar_periodos(db_session)

    assert retencion_para(periodos, date(2026, 3, 1)) == Decimal("2.00")


def test_factura_posterior_al_ultimo_tramo_usa_ese_tramo(db_session):
    _sembrar_periodos(db_session)
    periodos = cargar_periodos(db_session)

    assert retencion_para(periodos, date(2027, 12, 31)) == Decimal("2.00")


def test_sin_periodos_registrados_cae_al_valor_por_defecto(db_session):
    assert retencion_para([], date(2026, 5, 1)) == Decimal("1.75")
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd backend && pytest tests/test_retencion.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.services.retencion'`

- [ ] **Step 3: Escribir el servicio**

Crear `backend/app/services/retencion.py`:

```python
from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.retencion import Retencion

# Red de seguridad por si la tabla estuviera vacía. Con el tramo sembrado en
# 1900-01-01 no debería activarse nunca en producción.
RETENCION_POR_DEFECTO = Decimal("1.75")


def cargar_periodos(db: Session) -> list[Retencion]:
    """Periodos de retención, del más reciente al más antiguo.

    Se cargan una sola vez por liquidación y se reutilizan para todos los
    ítems, en vez de consultarlos por ítem.
    """
    return db.query(Retencion).order_by(Retencion.vigente_desde.desc()).all()


def retencion_para(periodos: list[Retencion], fecha: date) -> Decimal:
    """Retención vigente en la fecha de EMISIÓN de la factura.

    `periodos` debe venir ordenado descendente (tal como lo devuelve
    `cargar_periodos`), así el primero que empieza en o antes de `fecha` es el
    vigente.

    Ojo: esto NO usa `_fecha_efectiva()` de `services/liquidacion.py`, que
    resuelve la vigencia de las TARIFAS por fecha de pago. La retención se
    ancla a la fecha de la factura por pedido explícito del cliente. La
    divergencia es deliberada; ver la spec de retención por periodos.

    Debe mantenerse en paridad con `retencionPara()` de `src/lib/export-utils.ts`.
    """
    for periodo in periodos:
        if periodo.vigente_desde <= fecha:
            return periodo.porcentaje
    return RETENCION_POR_DEFECTO
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd backend && pytest tests/test_retencion.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/retencion.py backend/tests/test_retencion.py
git commit -m "feat(retencion): servicio que resuelve la retención vigente por fecha de factura"
```

---

### Task 3: Usar la retención por periodos en el cálculo y en el snapshot

**Files:**
- Modify: `backend/app/services/liquidacion.py:330-347` (`_calcular_comision_especifica`) y `backend/app/services/liquidacion.py:442-500` (`crear_liquidacion`)
- Test: `backend/tests/test_retencion.py`

**Interfaces:**
- Consumes: `cargar_periodos`, `retencion_para` de la Task 2.
- Produces: `_calcular_comision_especifica(db, orden_item, tarifa, periodos=None)` — se agrega un cuarto parámetro **opcional**. Si es `None`, la función carga los periodos por su cuenta. Los llamadores existentes (incluidos los tests de `test_liquidacion_service.py`) siguen funcionando sin cambios.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `backend/tests/test_retencion.py`:

```python
from app.models.comisionista import Comisionista, TipoTarifa
from app.models.orden import EstadoOrden, Orden, OrdenItem
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.liquidacion import _calcular_comision_especifica, crear_liquidacion
from app.models.cliente import Cliente
from app.models.orden import Asignacion


def _armar_escenario(db_session, fecha_factura):
    """Factura de $1000 con una tarifa específica del 10% sobre la base."""
    cliente = Cliente(nombre="FAGUILL", tipo="individual")
    comisionista = Comisionista(nombre="CASTRO")
    producto = Producto(nombre="ECU-BACILLUS", unidad_comision="kg")
    db_session.add_all([cliente, comisionista, producto])
    db_session.flush()

    tarifa = TarifaClienteProducto(
        comisionista_id=comisionista.id,
        cliente_id=cliente.id,
        producto_id=producto.id,
        tipo=TipoTarifa.porcentaje,
        valor=Decimal("10"),
    )
    orden_item = OrdenItem(
        fecha=fecha_factura,
        numero_orden="F-001",
        finca="-",
        producto=producto.nombre,
        producto_id=producto.id,
        cliente_id=cliente.id,
        cantidad=Decimal("100"),
        unidad="kg",
        precio_unitario=Decimal("10"),
        total=Decimal("1000"),
    )
    db_session.add_all([tarifa, orden_item])
    db_session.commit()
    return orden_item, tarifa


def test_comision_porcentaje_usa_retencion_de_febrero(db_session):
    """Base = 1000 * (1 - 1.75%) = 982.50 → comisión 10% = 98.25"""
    _sembrar_periodos(db_session)
    orden_item, tarifa = _armar_escenario(db_session, date(2026, 2, 28))

    comision = _calcular_comision_especifica(db_session, orden_item, tarifa)

    assert comision == Decimal("98.250")


def test_comision_porcentaje_usa_retencion_de_marzo(db_session):
    """Base = 1000 * (1 - 2%) = 980.00 → comisión 10% = 98.00"""
    _sembrar_periodos(db_session)
    orden_item, tarifa = _armar_escenario(db_session, date(2026, 3, 1))

    comision = _calcular_comision_especifica(db_session, orden_item, tarifa)

    assert comision == Decimal("98.000")


def test_tarifa_fijo_kg_no_se_ve_afectada_por_la_retencion(db_session):
    _sembrar_periodos(db_session)
    orden_item, tarifa = _armar_escenario(db_session, date(2026, 3, 1))
    tarifa.tipo = TipoTarifa.fijo_kg
    tarifa.valor = Decimal("0.05")
    db_session.commit()

    # 100 kg * 0.05 = 5, sin importar el tramo de retención.
    assert _calcular_comision_especifica(db_session, orden_item, tarifa) == Decimal("5.00")


def test_snapshot_congela_la_retencion_de_la_fecha_de_la_factura(db_session):
    """La factura es de febrero; se liquida hoy (con 2% vigente). El snapshot
    debe guardar 1.75, no 2."""
    _sembrar_periodos(db_session)
    orden_item, _ = _armar_escenario(db_session, date(2026, 2, 20))

    orden = Orden(
        fecha=date(2026, 2, 20),
        numero_orden="F-001",
        estado=EstadoOrden.pagada,
    )
    db_session.add(orden)
    db_session.flush()
    orden_item.orden_id = orden.id
    orden_item.estado = EstadoOrden.pagada
    comisionista = db_session.query(Comisionista).one()
    db_session.add(
        Asignacion(orden_item_id=orden_item.id, comisionista_id=comisionista.id)
    )
    db_session.commit()

    liquidacion, _ = crear_liquidacion(db_session, "Liq feb", [orden_item.id])

    item = liquidacion.items[0]
    assert item.retencion_porcentaje_snapshot == Decimal("1.75")
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd backend && pytest tests/test_retencion.py -v`
Expected: FAIL. `test_comision_porcentaje_usa_retencion_de_marzo` da `98.250` en vez de `98.000` (usa el escalar del cliente), y `test_snapshot_...` falla al leer `cliente.retencion_porcentaje`.

- [ ] **Step 3: Importar el servicio en `liquidacion.py`**

En `backend/app/services/liquidacion.py`, junto a los demás imports de la app, agregar:

```python
from app.models.retencion import Retencion
from app.services.retencion import cargar_periodos, retencion_para
```

- [ ] **Step 4: Cambiar `_calcular_comision_especifica`**

Reemplazar la función completa (`backend/app/services/liquidacion.py:330-347`) por:

```python
def _calcular_comision_especifica(
    db: Session,
    orden_item: OrdenItem,
    tarifa: TarifaClienteProducto,
    periodos: list[Retencion] | None = None,
) -> Decimal:
    """Calcula comisión con tarifa específica. Igual que la global salvo que el
    porcentaje se aplica sobre el total menos la retención vigente.

    La retención se resuelve por la fecha de EMISIÓN de la factura
    (`orden_item.fecha`), no por `_fecha_efectiva()`. Ver `services/retencion.py`.

    `periodos` se pasa desde `crear_liquidacion` para no consultarlos por ítem.
    """
    if tarifa.tipo == TipoTarifa.porcentaje:
        if periodos is None:
            periodos = cargar_periodos(db)
        retencion = retencion_para(periodos, orden_item.fecha)
        base = orden_item.total * (Decimal("1") - retencion / Decimal("100"))
        return base * (tarifa.valor / Decimal("100"))
    elif tarifa.tipo == TipoTarifa.fijo_kg:
        return _cantidad_para_tarifa_kg(orden_item) * tarifa.valor
    elif tarifa.tipo == TipoTarifa.fijo_unidad:
        return _cantidad_para_tarifa_unidad(orden_item) * tarifa.valor
    return Decimal("0")
```

- [ ] **Step 5: Cargar los periodos una sola vez en `crear_liquidacion`**

En `backend/app/services/liquidacion.py`, dentro de `crear_liquidacion`, justo después de la línea `mes = now.strftime("%Y-%m")` agregar:

```python
    # Una sola consulta para toda la liquidación, no una por ítem.
    periodos_retencion = cargar_periodos(db)
```

- [ ] **Step 6: Usar los periodos en el snapshot**

En el bloque que construye `LiquidacionItem` (`backend/app/services/liquidacion.py:478-480`), reemplazar:

```python
            retencion_porcentaje_snapshot=(
                oi.cliente.retencion_porcentaje if oi.cliente else Decimal("1.75")
            ),
```

por:

```python
            retencion_porcentaje_snapshot=retencion_para(periodos_retencion, oi.fecha),
```

- [ ] **Step 7: Pasar los periodos al cálculo dentro de `crear_liquidacion`**

En la misma función, reemplazar la llamada:

```python
                    comision = _calcular_comision_especifica(db, oi, tarifa_esp)
```

por:

```python
                    comision = _calcular_comision_especifica(
                        db, oi, tarifa_esp, periodos_retencion
                    )
```

- [ ] **Step 8: Correr los tests para verificar que pasan**

Run: `cd backend && pytest tests/test_retencion.py -v`
Expected: PASS (10 tests)

- [ ] **Step 9: Verificar que no se rompió nada más**

Run: `cd backend && pytest -q`
Expected: PASS. Los tests de `test_liquidacion_service.py` que usan tarifas `porcentaje` no siembran periodos, así que caen al fallback `1.75` — el mismo valor que usaban antes vía el default del cliente.

- [ ] **Step 10: Commit**

```bash
git add backend/app/services/liquidacion.py backend/tests/test_retencion.py
git commit -m "feat(retencion): calcular y congelar la retención por fecha de factura"
```

---

### Task 4: Endpoint `GET /api/v1/retenciones`

**Files:**
- Create: `backend/app/schemas/retencion.py`
- Create: `backend/app/routers/retenciones.py`
- Modify: `backend/app/main.py:15` (import) y el bloque de `include_router`
- Test: `backend/tests/test_retencion.py`

**Interfaces:**
- Consumes: `Retencion` (Task 1).
- Produces: `GET /api/v1/retenciones/` → `[{id, vigente_desde, porcentaje}]` ordenado descendente por `vigente_desde`. Requiere usuario autenticado. Lo consume la Task 6 (el frontend lo recibe ya en camelCase gracias a `toCamelCase`).

- [ ] **Step 1: Escribir el test que falla**

Agregar a `backend/tests/test_retencion.py`:

```python
def test_endpoint_lista_los_periodos_mas_reciente_primero(
    authenticated_client, db_session
):
    _sembrar_periodos(db_session)

    res = authenticated_client.get("/api/v1/retenciones/")

    assert res.status_code == 200
    datos = res.json()
    assert [d["vigente_desde"] for d in datos] == ["2026-03-01", "1900-01-01"]
    assert Decimal(datos[0]["porcentaje"]) == Decimal("2.00")


def test_endpoint_requiere_autenticacion(client):
    assert client.get("/api/v1/retenciones/").status_code == 401
```

El fixture `authenticated_client` (definido en `backend/tests/conftest.py:66-75`) ya
inyecta el header `Authorization`; no hay que pasarlo a mano.

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && pytest tests/test_retencion.py -k endpoint -v`
Expected: FAIL con status 404 (la ruta no existe).

- [ ] **Step 3: Crear el schema**

Crear `backend/app/schemas/retencion.py`:

```python
from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class RetencionResponse(BaseModel):
    id: UUID
    vigente_desde: date
    porcentaje: Decimal

    model_config = ConfigDict(from_attributes=True)
```

- [ ] **Step 4: Crear el router**

Crear `backend/app/routers/retenciones.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.retencion import Retencion
from app.models.user import User
from app.schemas.retencion import RetencionResponse

router = APIRouter()


@router.get("/", response_model=list[RetencionResponse])
def listar_retenciones(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Periodos de retención, del más reciente al más antiguo.

    Solo lectura: los tramos se cargan por migración, no desde la UI.
    """
    return db.query(Retencion).order_by(Retencion.vigente_desde.desc()).all()
```

- [ ] **Step 5: Registrar el router**

En `backend/app/main.py:15`, agregar `retenciones` a la lista de imports de `app.routers`.

Y después del bloque `include_router` de `proveedores` (`backend/app/main.py:125-129`), agregar:

```python
app.include_router(
    retenciones.router,
    prefix="/api/v1/retenciones",
    tags=["retenciones"],
)
```

- [ ] **Step 6: Correr los tests para verificar que pasan**

Run: `cd backend && pytest tests/test_retencion.py -v`
Expected: PASS (12 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/retencion.py backend/app/routers/retenciones.py backend/app/main.py backend/tests/test_retencion.py
git commit -m "feat(retencion): endpoint de solo lectura para los periodos de retención"
```

---

### Task 5: Eliminar `clientes.retencion_porcentaje`

**Files:**
- Create: `backend/alembic/versions/c4f6a8b0d2e3_eliminar_retencion_porcentaje_de_clientes.py`
- Modify: `backend/app/models/cliente.py:11`
- Modify: `backend/app/schemas/cliente.py:39-40,60`
- Modify: `backend/app/routers/clientes.py:71,105`
- Modify: `backend/app/commands/seed_catalogos.py:116,130`
- Modify: `backend/app/commands/seed_tarifas_externas.py:444`
- Test: `backend/tests/test_clientes.py`

**Interfaces:**
- Produces: el modelo `Cliente` y `ClienteResponse` dejan de exponer `retencion_porcentaje`. La Task 7 quita el campo correlativo del frontend.

- [ ] **Step 1: Buscar todas las referencias que quedan**

Run: `cd backend && grep -rn "retencion_porcentaje" app/ tests/ | grep -v "retencion_porcentaje_snapshot"`
Expected: las líneas de `models/cliente.py`, `schemas/cliente.py`, `routers/clientes.py` y los dos seeds. Anotarlas todas antes de editar.

Ojo: **no** tocar `retencion_porcentaje_snapshot` de `models/liquidacion.py` — ese campo se queda.

- [ ] **Step 2: Correr los tests de clientes para tener una línea base verde**

Run: `cd backend && pytest tests/test_clientes.py -v`
Expected: PASS

- [ ] **Step 3: Quitar la columna del modelo**

En `backend/app/models/cliente.py`, borrar la línea 11:

```python
    retencion_porcentaje = Column(Numeric(5, 2), nullable=False, default=1.75)
```

Si `Numeric` queda sin uso en el import de la línea 1, quitarlo también.

- [ ] **Step 4: Quitar el campo de los schemas**

En `backend/app/schemas/cliente.py`, borrar el campo de `ClienteCreate`/`ClienteUpdate` (líneas 39-40):

```python
    retencion_porcentaje: Decimal = Field(
        default=Decimal("1.75"), alias="retencionPorcentaje"
    )
```

y de `ClienteResponse` (línea 60):

```python
    retencion_porcentaje: Decimal = Field(alias="retencionPorcentaje")
```

Si `Decimal` queda sin uso en el archivo, quitar su import.

- [ ] **Step 5: Quitar el campo del router**

En `backend/app/routers/clientes.py`, borrar la línea 71 (`retencion_porcentaje=data.retencion_porcentaje,` dentro del constructor de `Cliente`) y la línea 105 (`cliente.retencion_porcentaje = data.retencion_porcentaje`).

- [ ] **Step 6: Quitar el campo de los seeds**

Borrar `retencion_porcentaje=Decimal("1.75"),` de `backend/app/commands/seed_catalogos.py` (líneas 116 y 130) y de `backend/app/commands/seed_tarifas_externas.py` (línea 444).

- [ ] **Step 7: Limpiar los tests que envían o esperan el campo**

Run: `cd backend && grep -rn "retencionPorcentaje\|retencion_porcentaje" tests/ | grep -v snapshot`

Borrar de los tests encontrados las claves `retencionPorcentaje` de los payloads y cualquier assert sobre ese campo.

- [ ] **Step 8: Crear la migración que elimina la columna**

Crear `backend/alembic/versions/c4f6a8b0d2e3_eliminar_retencion_porcentaje_de_clientes.py`:

```python
"""eliminar retencion_porcentaje de clientes

La retención ya no se guarda por cliente: vive en la tabla `retenciones`, por
periodo de vigencia.

Revision ID: c4f6a8b0d2e3
Revises: b2e4d6f8a0c1
Create Date: 2026-07-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4f6a8b0d2e3"
down_revision: Union[str, None] = "b2e4d6f8a0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("clientes", "retencion_porcentaje")


def downgrade() -> None:
    op.add_column(
        "clientes",
        sa.Column(
            "retencion_porcentaje",
            sa.Numeric(5, 2),
            nullable=False,
            server_default="1.75",
        ),
    )
```

- [ ] **Step 9: Correr la suite completa**

Run: `cd backend && pytest -q`
Expected: PASS

- [ ] **Step 10: Verificar que no quedan referencias huérfanas**

Run: `cd backend && grep -rn "retencion_porcentaje" app/ | grep -v snapshot`
Expected: sin resultados.

- [ ] **Step 11: Commit**

```bash
git add backend/
git commit -m "refactor(retencion): eliminar retencion_porcentaje de clientes"
```

---

### Task 6: Resolución de la retención en el frontend

**Files:**
- Modify: `src/types/index.ts` (agregar `Retencion`)
- Modify: `src/lib/api.ts` (agregar `fetchRetenciones`, junto a `fetchProveedores` en la línea 395)
- Modify: `src/lib/export-utils.ts:100-110`
- Modify: `src/context/AppContext.tsx:136-146`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `GET /api/v1/retenciones/` de la Task 4.
- Produces:
  - `Retencion { id: string; vigenteDesde: string; porcentaje: number }` en `src/types/index.ts`.
  - `fetchRetenciones(): Promise<Retencion[]>` en `src/lib/api.ts`.
  - `setPeriodosRetencion(periodos)` y `retencionPara(fecha: string): number` exportadas desde `src/lib/export-utils.ts`.

- [ ] **Step 1: Agregar el tipo**

En `src/types/index.ts`, junto a las demás interfaces:

```ts
export interface Retencion {
  id: string;
  vigenteDesde: string;
  porcentaje: number;
}
```

- [ ] **Step 2: Agregar la función de API**

En `src/lib/api.ts`, después de `fetchProveedores` (línea 395-399):

```ts
// Retenciones
export async function fetchRetenciones() {
  const res = await api.get('/api/v1/retenciones/');
  return toCamelCase<Retencion[]>(res.data);
}
```

Agregar `Retencion` al import de tipos que ya existe al inicio del archivo.

- [ ] **Step 3: Resolver la retención en `export-utils.ts`**

En `src/lib/export-utils.ts`, reemplazar el bloque de las líneas 100-110:

```ts
// Igual que la global salvo que el porcentaje se aplica sobre el total menos la
// retención del cliente.
export function calcularComisionPorTarifaEspecifica(
  item: OrdenItem,
  tarifa: TarifaClienteProducto
): number {
  if (tarifa.tipo === 'porcentaje') {
    const retencion = item.cliente?.retencionPorcentaje ?? 1.75;
    const base = item.total * (1 - retencion / 100);
    return base * (tarifa.valor / 100);
  }
```

por:

```ts
// Periodos de retención, ordenados del más reciente al más antiguo. Los inyecta
// AppContext una vez al cargar la app.
// ponytail: estado de módulo en vez de pasar los periodos por parámetro.
// Hacerlo por parámetro exigiría un noveno argumento posicional en
// exportarPDF/exportarExcel y tocar 8 llamadores. El valor es una tasa legal
// idéntica para todos los usuarios, así que compartirlo no tiene riesgo. Si
// algún día la retención vuelve a variar por cliente, hay que pasarla por
// parámetro.
let periodosRetencion: { vigenteDesde: string; porcentaje: number }[] = [];

export function setPeriodosRetencion(
  periodos: { vigenteDesde: string; porcentaje: number }[]
): void {
  periodosRetencion = [...periodos].sort((a, b) =>
    b.vigenteDesde.localeCompare(a.vigenteDesde)
  );
}

// Retención vigente en la fecha de EMISIÓN de la factura. Las fechas son ISO
// (YYYY-MM-DD), así que comparar como texto equivale a comparar cronológicamente.
// Debe mantenerse en paridad con retencion_para() de
// backend/app/services/retencion.py.
export function retencionPara(fecha: string): number {
  const f = fecha.slice(0, 10);
  const periodo = periodosRetencion.find((p) => p.vigenteDesde.slice(0, 10) <= f);
  return periodo ? Number(periodo.porcentaje) : 1.75;
}

// Igual que la global salvo que el porcentaje se aplica sobre el total menos la
// retención vigente en la fecha de la factura.
export function calcularComisionPorTarifaEspecifica(
  item: OrdenItem,
  tarifa: TarifaClienteProducto
): number {
  if (tarifa.tipo === 'porcentaje') {
    const retencion = retencionPara(item.fecha);
    const base = item.total * (1 - retencion / 100);
    return base * (tarifa.valor / 100);
  }
```

- [ ] **Step 4: Inyectar los periodos desde `AppContext`**

En `src/context/AppContext.tsx`, después del bloque `tarifasClienteProductoQuery` (líneas 136-139):

```tsx
  const retencionesQuery = useQuery({
    queryKey: ['retenciones'],
    queryFn: fetchRetenciones,
  });
```

Y después de la lista de constantes derivadas (línea 146):

```tsx
  // Los periodos de retención se inyectan en export-utils, que los usa desde
  // funciones puras sin acceso al contexto de React.
  useEffect(() => {
    if (retencionesQuery.data) setPeriodosRetencion(retencionesQuery.data);
  }, [retencionesQuery.data]);
```

Agregar `useEffect` al import de `react`, `fetchRetenciones` al import de `@/lib/api` y `setPeriodosRetencion` al import de `@/lib/export-utils` (si el archivo aún no importa de ahí, crear el import).

- [ ] **Step 5: Verificar que compila y pasa el type-check**

Run: `pnpm build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 6: Documentar la paridad en AGENTS.md**

En `AGENTS.md`, dentro de la sección "Normalización — sincronización obligatoria", agregar al final una nueva sección:

```markdown
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
```

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/lib/api.ts src/lib/export-utils.ts src/context/AppContext.tsx AGENTS.md
git commit -m "feat(retencion): resolver la retención por fecha de factura en el frontend"
```

---

### Task 7: Quitar el campo de retención de la UI de clientes

**Files:**
- Modify: `src/components/clientes/ClientesTab.tsx:40,49,138,164-165,173,224,324-333,588`
- Modify: `src/types/index.ts:56,91`

**Interfaces:**
- Consumes: los cambios de backend de la Task 5 (el API ya no devuelve `retencionPorcentaje`).

- [ ] **Step 1: Quitar el campo del tipo `Cliente` y del cliente anidado**

En `src/types/index.ts`, borrar `retencionPorcentaje: number;` de la interfaz `Cliente` (línea 91).

Y en la línea 56, cambiar:

```ts
  cliente?: { id: string; nombre: string; retencionPorcentaje: number };
```

por:

```ts
  cliente?: { id: string; nombre: string };
```

- [ ] **Step 2: Quitar el campo del formulario de `ClientesTab`**

En `src/components/clientes/ClientesTab.tsx`:

- Línea 40: borrar `retencionPorcentaje: string;` del tipo del formulario.
- Líneas 49 y 138: borrar `retencionPorcentaje: '0',` de los valores iniciales/reset.
- Líneas 164-165: borrar la validación:
  ```ts
  const retencion = parseFloat(form.retencionPorcentaje);
  if (isNaN(retencion) || retencion < 0 || retencion > 100) {
  ```
  junto con el cuerpo del `if` y su mensaje de error.
- Línea 173: borrar `retencionPorcentaje: retencion,` del payload.
- Línea 224: borrar `retencionPorcentaje: c.retencionPorcentaje.toString(),` del handler de edición.
- Líneas 324-333: borrar el bloque completo del `<Label htmlFor="retencion">` y su `<Input id="retencion" …>`.
- Línea 588: borrar el fragmento que muestra `Retención: {c.retencionPorcentaje}%` en el listado.

- [ ] **Step 3: Verificar que no quedan referencias**

Run: `grep -rn "retencionPorcentaje" src/`
Expected: únicamente las líneas 47 y 48 de `src/lib/transform.ts`.

Borrar **solo** la línea 47 (`'retencionPorcentaje',`), que ya no corresponde a ningún
campo. **Conservar** la línea 48 (`'retencionPorcentajeSnapshot',`): ese campo sigue
existiendo en `LiquidacionItem` y el historial lo necesita.

Volver a correr el grep. Expected: solo la línea 48 de `src/lib/transform.ts`.

- [ ] **Step 4: Verificar que compila**

Run: `pnpm build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 5: Verificar el lint**

Run: `pnpm lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "refactor(retencion): quitar el campo de retención de la UI de clientes"
```

---

### Task 8: Verificación de extremo a extremo

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Aplicar las migraciones sobre una base real**

Run: `cd backend && alembic upgrade head`
Expected: aplica `b2e4d6f8a0c1` y `c4f6a8b0d2e3` sin errores.

- [ ] **Step 2: Confirmar los tramos sembrados**

Consultar la base:

```sql
SELECT vigente_desde, porcentaje FROM retenciones ORDER BY vigente_desde;
```

Expected: dos filas — `1900-01-01 | 1.75` y `2026-03-01 | 2.00`.

- [ ] **Step 3: Confirmar que la columna vieja ya no existe**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'clientes' AND column_name = 'retencion_porcentaje';
```

Expected: cero filas.

- [ ] **Step 4: Correr la suite completa de backend**

Run: `cd backend && pytest -q`
Expected: PASS

- [ ] **Step 5: Verificar el endpoint con el backend levantado**

Run: `curl -s -H "Authorization: Bearer <token>" http://localhost:8000/api/v1/retenciones/`
Expected: JSON con los dos periodos, el de 2026-03-01 primero.

- [ ] **Step 6: Verificar el cálculo en vivo en la UI**

Con `pnpm dev` y el backend corriendo, abrir la pestaña de Liquidación y comparar dos facturas de un comisionista con tarifa de tipo `porcentaje` (p. ej. CASTRO o PINEDA): una emitida antes del 2026-03-01 y otra después. La base de la de marzo debe ser el 98% del total; la de febrero, el 98,25%.

- [ ] **Step 7: Confirmar que las liquidaciones existentes no cambiaron**

En el Historial, abrir una liquidación anterior a este cambio y verificar que sus montos siguen idénticos (los toma de los snapshots, no del cálculo en vivo).

- [ ] **Step 8: Commit final si hubo ajustes**

```bash
git add -A
git commit -m "test(retencion): verificación de extremo a extremo"
```
