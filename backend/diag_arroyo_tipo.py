#!/usr/bin/env python3
"""Solo-lectura: cuantifica el impacto de que ARROYO tenga fijo_kg en vez de porcentaje.

Para cada item pagado de ARROYO recalcula la comisión:
  - actual:   tal como está en prod (fijo_kg)
  - corregido: tratando la misma tarifa como porcentaje (con retención del cliente)

Uso: DATABASE_URL=... .venv/bin/python diag_arroyo_tipo.py [NOMBRE]
"""
import os, sys
from decimal import Decimal
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.comisionista import Comisionista, TipoTarifa
from app.models.orden import Asignacion, EstadoOrden, OrdenItem
from app.services.liquidacion import (
    _buscar_tarifa_especifica, _cantidad_para_tarifa_kg,
)
from app.services.retencion import cargar_periodos, retencion_para

NOMBRE = sys.argv[1].upper() if len(sys.argv) > 1 else "ARROYO"


def main():
    db = SessionLocal()
    try:
        c = next((c for c in db.query(Comisionista).all()
                  if c.nombre.upper() == NOMBRE), None)
        if not c:
            print(f"No existe comisionista {NOMBRE}"); return
        items = (
            db.query(OrdenItem)
            .join(Asignacion, Asignacion.orden_item_id == OrdenItem.id)
            .filter(Asignacion.comisionista_id == c.id,
                    OrdenItem.estado == EstadoOrden.pagada)
            .all()
        )
        periodos = cargar_periodos(db)
        tot_actual = Decimal("0")
        tot_corr = Decimal("0")
        print(f"{NOMBRE}: {len(items)} items pagados\n")
        print(f"{'producto':28} {'sector':14} {'cant':>8} {'unid':>8} "
              f"{'kg':>9} {'total':>10} {'tipo':>8} {'val':>6} "
              f"{'actual':>9} {'corregido':>10}")
        for oi in items:
            te = _buscar_tarifa_especifica(db, oi, c.id)
            if te is None:
                continue
            kg = _cantidad_para_tarifa_kg(oi)
            ret = retencion_para(periodos, oi.fecha)
            if te.tipo == TipoTarifa.fijo_kg:
                actual = kg * te.valor
            else:
                base = oi.total * (Decimal("1") - ret/Decimal("100"))
                actual = base * (te.valor/Decimal("100"))
            # corregido = SIEMPRE porcentaje con retención
            base = oi.total * (Decimal("1") - ret/Decimal("100"))
            corr = base * (te.valor/Decimal("100"))
            tot_actual += actual
            tot_corr += corr
            prod = (oi.producto_obj.nombre if oi.producto_obj else oi.producto) or "?"
            print(f"{prod[:28]:28} {(oi.sector or oi.finca or '-')[:14]:14} "
                  f"{float(oi.cantidad):8.1f} {(oi.unidad or '')[:8]:>8} "
                  f"{float(kg):9.1f} {float(oi.total):10.2f} {te.tipo.value[:8]:>8} "
                  f"{float(te.valor):6.2f} {float(actual):9.2f} {float(corr):10.2f}")
        print(f"\nTOTAL actual (prod):      {float(tot_actual):12,.2f}")
        print(f"TOTAL corregido (%+ret):  {float(tot_corr):12,.2f}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
