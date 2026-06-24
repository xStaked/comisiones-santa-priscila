#!/usr/bin/env python3
"""
Limpia asignaciones huérfanas: comisionistas asignados a ítems donde NO cobran
(no tienen tarifa que aplique). Son el residuo de la asignación cartesiana vieja.

NO toca ítems liquidados (sus snapshots ya están congelados).
Por defecto es DRY-RUN. Para aplicar: pasar  --apply

Uso (servidor / con DATABASE_URL de prod):
    cd backend
    python limpiar_asignaciones.py            # dry-run
    python limpiar_asignaciones.py --apply     # aplica
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import selectinload
from app.database import SessionLocal
from app.models.orden import Asignacion, EstadoOrden, OrdenItem
from app.services.liquidacion import (
    _buscar_tarifa_especifica,
    _tiene_tarifas_especificas,
)

APPLY = "--apply" in sys.argv


def main():
    db = SessionLocal()
    try:
        items = (
            db.query(OrdenItem)
            .filter(OrdenItem.estado.in_([EstadoOrden.pendiente, EstadoOrden.pagada]))
            .options(
                selectinload(OrdenItem.asignaciones),
                selectinload(OrdenItem.cliente),
                selectinload(OrdenItem.producto_obj),
                selectinload(OrdenItem.orden),
            )
            .all()
        )
        a_borrar = []
        for oi in items:
            for asig in oi.asignaciones:
                cid = asig.comisionista_id
                aplica = (
                    _buscar_tarifa_especifica(db, oi, cid) is not None
                    or not _tiene_tarifas_especificas(db, cid)
                )
                if not aplica:
                    a_borrar.append(asig.id)

        print(f"Ítems no liquidados: {len(items)}")
        print(f"Asignaciones huérfanas a borrar: {len(a_borrar)}")

        if APPLY and a_borrar:
            db.query(Asignacion).filter(Asignacion.id.in_(a_borrar)).delete(
                synchronize_session=False
            )
            db.commit()
            print(f"BORRADAS {len(a_borrar)} asignaciones.")
        elif not APPLY:
            print("(dry-run: no se borró nada; usar --apply para aplicar)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
