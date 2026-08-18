"""Cachés de catálogo con vida de una sesión (= un request).

Los catálogos (productos, fincas) son pequeños y no cambian durante un request,
pero el cálculo de comisiones los consulta una vez por cada par
(orden_item, comisionista). En producción eso son decenas de miles de
round-trips a Postgres por carga del dashboard.

La caché vive en `Session.info` y se invalida en cada flush, así que un test o
un endpoint que cree un producto a mitad de sesión sigue viendo el dato nuevo.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import event
from sqlalchemy.orm import Session, selectinload

from app.models.cliente import Finca
from app.models.producto import Producto, ProductoAlias
from app.models.tarifa_cliente_producto import TarifaClienteProducto

_CLAVES = ("_cat_productos", "_cat_equivalentes", "_cat_fincas", "_cat_tarifa_especifica")
_MODELOS_CACHEADOS = (Producto, ProductoAlias, Finca, TarifaClienteProducto)


@event.listens_for(Session, "after_flush")
def _invalidar_caches(session: Session, flush_context) -> None:
    """Solo invalida si el flush tocó catálogos o tarifas.

    `crear_liquidacion` hace un flush por ítem; invalidar en todos dejaría la
    caché inútil justo donde más se necesita.
    """
    tocados = list(session.new) + list(session.dirty) + list(session.deleted)
    if not any(isinstance(obj, _MODELOS_CACHEADOS) for obj in tocados):
        return
    for clave in _CLAVES:
        session.info.pop(clave, None)


def productos(db: Session) -> list[Producto]:
    """Catálogo completo con los alias precargados."""
    cache = db.info.get("_cat_productos")
    if cache is None:
        cache = db.query(Producto).options(selectinload(Producto.alias)).all()
        db.info["_cat_productos"] = cache
    return cache


def producto_por_id(db: Session, producto_id: UUID) -> Producto | None:
    return next((p for p in productos(db) if p.id == producto_id), None)


def fincas_de_cliente(db: Session, cliente_id: UUID | None) -> list[Finca]:
    cache: dict = db.info.setdefault("_cat_fincas", {})
    if cliente_id not in cache:
        query = db.query(Finca)
        if cliente_id:
            query = query.filter(Finca.cliente_id == cliente_id)
        cache[cliente_id] = query.all()
    return cache[cliente_id]


def equivalentes_memo(db: Session) -> dict[UUID, list[UUID]]:
    return db.info.setdefault("_cat_equivalentes", {})


def tarifa_especifica_memo(db: Session) -> dict:
    return db.info.setdefault("_cat_tarifa_especifica", {})
