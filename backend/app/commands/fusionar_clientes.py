"""Fusiona un cliente duplicado en el canónico y deja el alias abreviado.

Caso: prod tiene `INT ISL PALO SANTO` (abreviado, con las tarifas buenas) y
`TESTEO PALO SANTO` (ex `INTEDECAM ISLA PALO SANTO`, con pocas o ninguna).
El canónico debe quedar con el nombre completo de la factura y el alias
abreviado del Excel del cliente.

Por defecto es SIMULACRO (no escribe): muestra el plan y hace rollback.
Para aplicar: agregar --ejecutar.

Uso (desde backend/):
    DATABASE_URL=... python -m app.commands.fusionar_clientes
    DATABASE_URL=... python -m app.commands.fusionar_clientes --ejecutar
    DATABASE_URL=... python -m app.commands.fusionar_clientes \\
        --origen "TESTEO PALO SANTO" --destino "INT ISL PALO SANTO" \\
        --nombre-final "INTEDECAM ISLA PALO SANTO" --alias "INT ISL PALO SANTO" \\
        --ejecutar

Reglas:
- Las tarifas del origen que choquen con una del destino (misma
  comisionista/producto/finca/proveedor) se descartan: gana el destino.
- Las fincas del origen con igual nombre que una del destino se reutilizan
  (se reapuntalan ítems y tarifas a la del destino).
- Los alias en conflicto global se dejan en el origen (se van con su borrado).
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.cliente import Cliente, ClienteAlias, Finca
from app.models.orden import Orden, OrdenItem
from app.models.tarifa_cliente_producto import TarifaClienteProducto


def _buscar_exacto(db: Session, nombre: str) -> Cliente | None:
    return (
        db.query(Cliente).filter(func.upper(Cliente.nombre) == nombre.upper()).first()
    )


def fusionar(
    db: Session,
    origen_nombre: str,
    destino_nombre: str,
    nombre_final: str,
    alias_abreviado: str,
    ejecutar: bool = False,
) -> dict:
    resumen: dict = {
        "tarifas_movidas": 0,
        "tarifas_descartadas_por_conflicto": [],
        "fincas_movidas": 0,
        "fincas_reutilizadas": [],
        "alias_movidos": 0,
        "alias_en_conflicto": [],
        "ordenes_movidas": 0,
        "items_movidos": 0,
        "destino_renombrado": None,
        "alias_creado": None,
        "origen_eliminado": None,
    }

    origen = _buscar_exacto(db, origen_nombre)
    destino = _buscar_exacto(db, destino_nombre)
    if not origen:
        raise RuntimeError(f"Origen no encontrado: {origen_nombre}")
    if not destino:
        raise RuntimeError(f"Destino no encontrado: {destino_nombre}")
    if origen.id == destino.id:
        raise RuntimeError("Origen y destino son el mismo cliente")

    # El nombre final debe estar libre (salvo que ya lo tenga el destino).
    ocupado = _buscar_exacto(db, nombre_final)
    if ocupado and ocupado.id != destino.id:
        raise RuntimeError(
            f"El nombre final '{nombre_final}' ya lo usa '{ocupado.nombre}' "
            f"(id={ocupado.id}). Fusiona o renombra ese registro primero."
        )

    # 1. Fincas: mover o reutilizar por igual nombre.
    mapa_fincas: dict[str, object] = {}
    for finca in db.query(Finca).filter(Finca.cliente_id == origen.id).all():
        nombre_finca = finca.nombre
        gemela = (
            db.query(Finca)
            .filter(
                Finca.cliente_id == destino.id,
                func.upper(Finca.nombre) == nombre_finca.upper(),
            )
            .first()
        )
        if gemela:
            db.query(OrdenItem).filter(OrdenItem.finca_id == finca.id).update(
                {"finca_id": gemela.id}, synchronize_session=False
            )
            db.query(TarifaClienteProducto).filter(
                TarifaClienteProducto.finca_id == finca.id
            ).update({"finca_id": gemela.id}, synchronize_session=False)
            db.delete(finca)
            mapa_fincas[str(finca.id)] = gemela.id
            resumen["fincas_reutilizadas"].append(nombre_finca)
        else:
            finca.cliente_id = destino.id
            mapa_fincas[str(finca.id)] = finca.id
            resumen["fincas_movidas"] += 1
    db.flush()

    # 2. Tarifas: mover salvo conflicto (gana el destino).
    # Selección por columnas para no depender de columnas nuevas en BDs viejas.
    T = TarifaClienteProducto
    tarifas_origen = (
        db.query(T.id, T.comisionista_id, T.producto_id, T.finca_id, T.proveedor)
        .filter(T.cliente_id == origen.id)
        .all()
    )
    for tid, co_id, pr_id, fi_id, prov in tarifas_origen:
        finca_mapeada = mapa_fincas.get(str(fi_id), fi_id)
        conflicto = db.query(T.id).filter(
            T.comisionista_id == co_id,
            T.cliente_id == destino.id,
            T.producto_id == pr_id,
            T.proveedor == prov,
        )
        if finca_mapeada is None:
            conflicto = conflicto.filter(T.finca_id.is_(None))
        else:
            conflicto = conflicto.filter(T.finca_id == finca_mapeada)
        if conflicto.first():
            db.query(T).filter(T.id == tid).delete(synchronize_session=False)
            resumen["tarifas_descartadas_por_conflicto"].append(str(tid))
        else:
            db.query(T).filter(T.id == tid).update(
                {"cliente_id": destino.id, "finca_id": finca_mapeada},
                synchronize_session=False,
            )
            resumen["tarifas_movidas"] += 1
    db.flush()

    # 3. Alias del origen hacia el destino (salvo conflicto global).
    for a in db.query(ClienteAlias).filter(ClienteAlias.cliente_id == origen.id).all():
        ocupado_alias = (
            db.query(ClienteAlias)
            .filter(
                func.upper(ClienteAlias.alias) == a.alias.upper(),
                ClienteAlias.id != a.id,
            )
            .first()
        )
        if ocupado_alias:
            resumen["alias_en_conflicto"].append(a.alias)
        else:
            a.cliente_id = destino.id
            resumen["alias_movidos"] += 1
    db.flush()

    # 4. Órdenes e ítems.
    resumen["ordenes_movidas"] = (
        db.query(Orden)
        .filter(Orden.cliente_id == origen.id)
        .update({"cliente_id": destino.id}, synchronize_session=False)
    )
    resumen["items_movidos"] = (
        db.query(OrdenItem)
        .filter(OrdenItem.cliente_id == origen.id)
        .update({"cliente_id": destino.id}, synchronize_session=False)
    )
    db.flush()

    # 5. Renombrar el destino al nombre completo de la factura.
    if destino.nombre != nombre_final:
        destino.nombre = nombre_final
        resumen["destino_renombrado"] = f"{destino_nombre} -> {nombre_final}"
    db.flush()

    # 6. Asegurar el alias abreviado del Excel.
    if alias_abreviado:
        hay = (
            db.query(ClienteAlias)
            .filter(func.upper(ClienteAlias.alias) == alias_abreviado.upper())
            .first()
        )
        if hay and hay.cliente_id != destino.id:
            raise RuntimeError(
                f"El alias '{alias_abreviado}' ya pertenece a otro cliente "
                f"(id={hay.cliente_id})."
            )
        if not hay:
            db.add(ClienteAlias(cliente_id=destino.id, alias=alias_abreviado))
            resumen["alias_creado"] = alias_abreviado
    db.flush()

    # 7. Borrar el origen ya vacío.
    db.delete(origen)
    resumen["origen_eliminado"] = origen_nombre
    db.flush()

    if ejecutar:
        db.commit()
    else:
        db.rollback()
    return resumen


def main() -> int:
    parser = argparse.ArgumentParser(description="Fusiona cliente duplicado")
    parser.add_argument("--origen", default="TESTEO PALO SANTO")
    parser.add_argument("--destino", default="INT ISL PALO SANTO")
    parser.add_argument("--nombre-final", default="INTEDECAM ISLA PALO SANTO")
    parser.add_argument("--alias", default="INT ISL PALO SANTO")
    parser.add_argument(
        "--ejecutar",
        action="store_true",
        help="Sin esta bandera solo simula (rollback).",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        modo = "APLICANDO" if args.ejecutar else "SIMULACRO (sin --ejecutar no escribe)"
        print(f"Modo: {modo}")
        print(f"Origen: {args.origen} -> Destino: {args.destino}")
        print(f"Nombre final: {args.nombre_final} | Alias: {args.alias}")
        resumen = fusionar(
            db,
            args.origen,
            args.destino,
            args.nombre_final,
            args.alias,
            ejecutar=args.ejecutar,
        )
        for clave, valor in resumen.items():
            print(f"  {clave}: {valor}")
        return 0
    except RuntimeError as exc:
        db.rollback()
        print(f"ERROR: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
