from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.producto import Producto, ProductoAlias
from app.services import catalogo_cache
from app.services.catalog_normalization import normalizar_nombre_producto


def obtener_productos_equivalentes(db: Session, producto: Producto) -> list[UUID]:
    """Devuelve los IDs de productos que representan la misma familia canónica.

    Se usa para tolerar catálogos legados donde el producto viejo sigue existiendo
    como fila separada, pero el PDF ya llega con el nombre canónico.
    """

    memo = catalogo_cache.equivalentes_memo(db)
    if producto.id in memo:
        return memo[producto.id]

    nombre_objetivo = normalizar_nombre_producto(producto.nombre)
    ids: set[UUID] = set()

    for candidato in catalogo_cache.productos(db):
        if normalizar_nombre_producto(candidato.nombre) == nombre_objetivo:
            ids.add(candidato.id)
            continue

        for alias in candidato.alias:
            if normalizar_nombre_producto(alias.alias) == nombre_objetivo:
                ids.add(candidato.id)
                break

    if not ids:
        ids.add(producto.id)

    memo[producto.id] = list(ids)
    return memo[producto.id]
