"""Verifica dependencias de un cliente antes de borrarlo.

Uso (desde backend/):
    python -m app.commands.verificar_cliente "PALO SANTO"
    python -m app.commands.verificar_cliente "Testeo Palo Santo" --exacto
    DATABASE_URL=postgresql://... python -m app.commands.verificar_cliente "PALO"

Muestra: tarifas, fincas, alias, órdenes, ítems y qué pasaría con DELETE.
No borra nada (solo lectura).

Nota: usa SQL explícito por columnas (no SELECT *) para no depender de
que la BD local tenga todas las columnas nuevas del modelo.
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import func

from app.database import SessionLocal
from app.models.cliente import Cliente, ClienteAlias, Finca
from app.models.comisionista import Comisionista
from app.models.orden import Orden, OrdenItem
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto


def buscar_clientes(db, patron: str, exacto: bool):
    q = db.query(Cliente)
    if exacto:
        return q.filter(func.upper(Cliente.nombre) == patron.upper()).all()
    return q.filter(Cliente.nombre.ilike(f"%{patron}%")).all()


def verificar(db, cliente: Cliente) -> dict:
    # Selección por columnas (sin SELECT *) para tolerar BDs con columnas
    # nuevas aún no migradas (p. ej. comisionistas.tipo en dev).
    filas = (
        db.query(
            Comisionista.nombre,
            Producto.nombre,
            Finca.nombre,
            TarifaClienteProducto.tipo,
            TarifaClienteProducto.valor,
            TarifaClienteProducto.activo,
            TarifaClienteProducto.proveedor,
        )
        .join(
            Comisionista,
            Comisionista.id == TarifaClienteProducto.comisionista_id,
        )
        .join(Producto, Producto.id == TarifaClienteProducto.producto_id)
        .outerjoin(Finca, Finca.id == TarifaClienteProducto.finca_id)
        .filter(TarifaClienteProducto.cliente_id == cliente.id)
        .order_by(Comisionista.nombre, Producto.nombre)
        .all()
    )
    detalle_tarifas = [
        {
            "comisionista": co,
            "producto": pr,
            "finca": fi,
            "tipo": tp.value if hasattr(tp, "value") else str(tp),
            "valor": str(val),
            "activo": act,
            "proveedor": prov,
        }
        for co, pr, fi, tp, val, act, prov in filas
    ]

    fincas = db.query(Finca).filter(Finca.cliente_id == cliente.id).all()
    alias = db.query(ClienteAlias).filter(ClienteAlias.cliente_id == cliente.id).all()
    n_ordenes = (
        db.query(func.count(Orden.id)).filter(Orden.cliente_id == cliente.id).scalar()
        or 0
    )
    n_items = (
        db.query(func.count(OrdenItem.id))
        .filter(OrdenItem.cliente_id == cliente.id)
        .scalar()
        or 0
    )
    ordenes_muestra = (
        db.query(Orden.fecha, Orden.numero_orden, Orden.estado)
        .filter(Orden.cliente_id == cliente.id)
        .order_by(Orden.fecha.desc())
        .limit(5)
        .all()
    )

    return {
        "cliente": cliente,
        "tarifas": detalle_tarifas,
        "fincas": fincas,
        "alias": alias,
        "n_ordenes": n_ordenes,
        "n_items": n_items,
        "ordenes_muestra": [
            {"fecha": f, "numero_orden": n, "estado": e}
            for f, n, e in ordenes_muestra
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Verifica dependencias de un cliente")
    parser.add_argument("patron", help="Nombre o fragmento (ej: 'PALO SANTO')")
    parser.add_argument("--exacto", action="store_true", help="Coincidencia exacta")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        clientes = buscar_clientes(db, args.patron, args.exacto)
        if not clientes:
            print(f"No se encontró ningún cliente con patrón '{args.patron}'.")
            print("Clientes con 'PALO' o 'TESTEO' en el nombre:")
            similares = (
                db.query(Cliente)
                .filter(
                    Cliente.nombre.ilike("%PALO%")
                    | Cliente.nombre.ilike("%TESTEO%")
                    | Cliente.nombre.ilike("%INT ISL%")
                    | Cliente.nombre.ilike("%INTEDECAM%")
                )
                .all()
            )
            for c in similares:
                print(f"  - {c.nombre} (id={c.id})")
            return 1

        for cliente in clientes:
            r = verificar(db, cliente)
            print("=" * 72)
            print(f"Cliente: {cliente.nombre}")
            print(f"  id: {cliente.id} | tipo={cliente.tipo} | activo={cliente.activo}")
            print(f"  alias ({len(r['alias'])}): {[a.alias for a in r['alias']]}")
            print(f"  fincas ({len(r['fincas'])}): {[f.nombre for f in r['fincas']]}")
            print(f"  órdenes: {r['n_ordenes']} | ítems: {r['n_items']}")
            for o in r["ordenes_muestra"]:
                print(f"    - {o['fecha']} {o['numero_orden']} estado={o['estado']}")
            print(f"  tarifas ({len(r['tarifas'])}):")
            for t in r["tarifas"]:
                estado = "activa" if t["activo"] else "inactiva"
                print(
                    f"    - {t['comisionista']} | {t['producto']} | "
                    f"finca={t['finca'] or '—'} | {t['tipo']} {t['valor']} "
                    f"| prov='{t['proveedor']}' ({estado})"
                )
            print()
            print("  Qué pasaría con DELETE /clientes/{id}:")
            print(f"    x Se BORRARÍAN {len(r['tarifas'])} tarifas (CASCADE).")
            print(f"    x Se BORRARÍAN {len(r['fincas'])} fincas + {len(r['alias'])} alias.")
            if r["n_ordenes"] or r["n_items"]:
                print(
                    f"    ! {r['n_ordenes']} órdenes y {r['n_items']} ítems quedarían "
                    "HUÉRFANAS (cliente_id=NULL, SET NULL)."
                )
            else:
                print("    ✓ Sin órdenes/ítems huérfanos.")
            if r["tarifas"]:
                print("  Recomendación: NO borrar. Fusionar o usar alias en su lugar.")
            else:
                print("  Recomendación: se puede borrar (sin tarifas asociadas).")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
