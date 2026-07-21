#!/usr/bin/env python3
"""Solo-lectura: desglose línea por línea de la comisión calculada para una lista
de comisionistas, sobre sus items PAGADOS. Para revisión manual de la contadora.

Exporta un CSV por comisionista a la carpeta indicada en OUT_DIR.
Uso: DATABASE_URL=... OUT_DIR=/ruta .venv/bin/python diag_desglose_comisionistas.py
"""
import csv, os, sys
from decimal import Decimal
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.comisionista import Comisionista
from app.models.orden import Asignacion, EstadoOrden, OrdenItem
from app.services.liquidacion import (
    _buscar_tarifa_especifica, _tiene_tarifas_especificas,
    _calcular_comision_especifica, _cantidad_para_tarifa_kg,
)
from app.services.retencion import cargar_periodos, retencion_para

NOMBRES = ["ARROYO", "MALAVE", "CORDOVA JUAN CARLOS", "ZARATE TEOBALDO"]
OUT_DIR = os.environ.get("OUT_DIR", ".")


def main():
    db = SessionLocal()
    try:
        coms = {c.nombre.upper(): c for c in db.query(Comisionista).all()}
        periodos = cargar_periodos(db)
        for nombre in NOMBRES:
            c = coms.get(nombre)
            if not c:
                print(f"  (no existe: {nombre})"); continue
            items = (
                db.query(OrdenItem)
                .join(Asignacion, Asignacion.orden_item_id == OrdenItem.id)
                .filter(Asignacion.comisionista_id == c.id,
                        OrdenItem.estado == EstadoOrden.pagada)
                .all()
            )
            path = os.path.join(OUT_DIR, f"desglose_{nombre.replace(' ', '_')}.csv")
            total = Decimal("0")
            with open(path, "w", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                w.writerow(["fecha", "orden", "cliente", "producto", "sector/finca",
                            "cantidad", "unidad", "kg_convertido", "total_orden",
                            "tipo_tarifa", "valor_tarifa", "retencion%", "comision"])
                for oi in sorted(items, key=lambda x: (str(x.fecha), x.numero_orden or "")):
                    te = _buscar_tarifa_especifica(db, oi, c.id)
                    if te is not None:
                        com = _calcular_comision_especifica(db, oi, te, periodos)
                        tipo, valor = te.tipo.value, te.valor
                    elif not _tiene_tarifas_especificas(db, c.id):
                        com = sum((Decimal(str(0)) for _ in [0]), Decimal("0"))
                        tipo, valor = "global?", Decimal("0")
                    else:
                        com, tipo, valor = Decimal("0"), "sin_tarifa", Decimal("0")
                    kg = _cantidad_para_tarifa_kg(oi)
                    ret = retencion_para(periodos, oi.fecha)
                    total += com
                    w.writerow([
                        oi.fecha, oi.numero_orden,
                        oi.cliente.nombre if oi.cliente else "",
                        (oi.producto_obj.nombre if oi.producto_obj else oi.producto),
                        oi.sector or oi.finca or "",
                        f"{float(oi.cantidad):.2f}", oi.unidad or "",
                        f"{float(kg):.2f}", f"{float(oi.total):.2f}",
                        tipo, f"{float(valor):.4f}", f"{float(ret):.2f}",
                        f"{float(com):.2f}",
                    ])
                w.writerow([])
                w.writerow(["", "", "", "", "", "", "", "", "", "", "", "TOTAL",
                            f"{float(total):.2f}"])
            print(f"  {nombre:22} items={len(items):3}  TOTAL={float(total):>10,.2f}  -> {path}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
