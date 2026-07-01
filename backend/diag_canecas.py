#!/usr/bin/env python3
"""Solo-lectura: muestra todos los items con unidad 'caneca' y cómo el sistema
convierte a kg + comisión calculada. Para verificar el factor de caneca.
Uso: DATABASE_URL=... .venv/bin/python diag_canecas.py
"""
import os, sys
from decimal import Decimal
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.orden import Asignacion, EstadoOrden, OrdenItem
from app.models.comisionista import Comisionista
from app.services.liquidacion import (
    _buscar_tarifa_especifica, _cantidad_para_tarifa_kg,
    _calcular_comision_especifica,
)


def main():
    db = SessionLocal()
    try:
        items = (
            db.query(OrdenItem)
            .filter(OrdenItem.unidad.ilike("%caneca%"))
            .all()
        )
        print(f"Items con unidad 'caneca': {len(items)}\n")
        print(f"{'orden':14} {'producto':26} {'sector':12} {'cant':>6} "
              f"{'unidad':>10} {'kg_sist':>8} {'estado':>10} | comisionista: valor->comision")
        for oi in items:
            kg = _cantidad_para_tarifa_kg(oi)
            prod = (oi.producto_obj.nombre if oi.producto_obj else oi.producto) or "?"
            base = (f"{(oi.numero_orden or '')[:14]:14} {prod[:26]:26} "
                    f"{(oi.sector or oi.finca or '-')[:12]:12} {float(oi.cantidad):6.1f} "
                    f"{(oi.unidad or '')[:10]:>10} {float(kg):8.1f} {oi.estado.value:>10}")
            detalles = []
            for asig in oi.asignaciones:
                c = db.query(Comisionista).get(asig.comisionista_id)
                te = _buscar_tarifa_especifica(db, oi, asig.comisionista_id)
                if te is not None:
                    com = _calcular_comision_especifica(db, oi, te)
                    detalles.append(f"{c.nombre}: {te.tipo.value} {float(te.valor)}->{float(com):.2f}")
            print(base + " | " + " ; ".join(detalles))
    finally:
        db.close()


if __name__ == "__main__":
    main()
