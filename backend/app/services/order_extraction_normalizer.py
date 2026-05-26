from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.cliente import Cliente, Finca
from app.models.producto import Producto
from app.services.order_extraction_models import OrdenValidada


def _limpiar(valor: str) -> str:
    return " ".join((valor or "").strip().split())


def _buscar_cliente(db: Session, nombre: str) -> Cliente | None:
    limpio = _limpiar(nombre)
    if not limpio:
        return None
    return db.query(Cliente).filter(func.lower(Cliente.nombre) == limpio.lower()).first()


def _buscar_finca(db: Session, nombre: str, cliente: Cliente | None) -> Finca | None:
    limpio = _limpiar(nombre)
    if not limpio or limpio == "-":
        return None
    query = db.query(Finca).filter(func.lower(Finca.nombre) == limpio.lower())
    if cliente:
        return query.filter(Finca.cliente_id == cliente.id).first()

    coincidencias = query.limit(2).all()
    if len(coincidencias) != 1:
        return None
    return coincidencias[0]


def _buscar_producto(db: Session, nombre: str) -> Producto | None:
    limpio = _limpiar(nombre)
    if not limpio:
        return None
    return db.query(Producto).filter(func.lower(Producto.nombre) == limpio.lower()).first()


def normalizar_orden_extraida(db: Session | None, orden: OrdenValidada) -> OrdenValidada:
    if db is None:
        return orden

    cliente = _buscar_cliente(db, orden.cliente)
    for item in orden.items:
        item_cliente = cliente or _buscar_cliente(db, item.clienteTexto)
        finca = _buscar_finca(db, item.finca or orden.finca, item_cliente)
        producto = _buscar_producto(db, item.producto)

        if item_cliente:
            item.clienteId = str(item_cliente.id)
        if finca:
            item.fincaId = str(finca.id)
            item.finca = finca.nombre
            if not item.clienteId:
                item.clienteId = str(finca.cliente_id)
        if producto:
            item.productoId = str(producto.id)
            item.producto = producto.nombre

    return orden
