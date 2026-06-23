#!/usr/bin/env python3
"""
Audita las comisiones de las órdenes PAGADAS (sin liquidar) usando la lógica REAL
del backend. SOLO LECTURA.

Para cada ítem pagado y cada comisionista asignado muestra:
  - sector/finca de la ORDEN
  - finca de la TARIFA que emparejó  (si difiere => comisiona en sector que no debe)
  - tipo, valor y comisión calculada

Marca con  ***  los casos sospechosos:
  - la tarifa emparejada es de OTRA finca (o sin finca) distinta a la de la orden
  - no se encontró tarifa (comisión 0) pero hay asignación

Uso (servidor, BD de prod en .env):
    cd backend
    python audit_comisiones_pagadas.py                 # todos
    python audit_comisiones_pagadas.py "ALBURQUERQUE"  # filtra comisionista
"""
import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import selectinload
from app.database import SessionLocal
from app.models.orden import Asignacion, EstadoOrden, OrdenItem
from app.services.liquidacion import (
    _buscar_tarifa_especifica,
    _calcular_comision_especifica,
    _calcular_comision_con_tarifa,
    _tiene_tarifas_especificas,
    _normalizar_texto,
)
from app.services.catalog_normalization import normalizar_nombre_finca


def main():
    filtro = sys.argv[1].lower() if len(sys.argv) > 1 else None
    db = SessionLocal()
    try:
        items = (
            db.query(OrdenItem)
            .filter(OrdenItem.estado == EstadoOrden.pagada)
            .options(
                selectinload(OrdenItem.asignaciones).selectinload(Asignacion.comisionista),
                selectinload(OrdenItem.cliente),
                selectinload(OrdenItem.producto_obj),
                selectinload(OrdenItem.finca_obj),
                selectinload(OrdenItem.orden),
            )
            .all()
        )
        print(f"Ítems pagados (sin liquidar): {len(items)}\n")

        total_por_com = {}
        sospechosos = 0

        for oi in items:
            sector_orden = oi.finca or oi.sector or "-"
            for asig in oi.asignaciones:
                com = asig.comisionista
                if not com:
                    continue
                if filtro and filtro not in com.nombre.lower():
                    continue

                tarifa = _buscar_tarifa_especifica(db, oi, com.id)
                if tarifa:
                    comision = _calcular_comision_especifica(db, oi, tarifa)
                    finca_tarifa = tarifa.finca.nombre if tarifa.finca else "(sin finca)"
                    tipo, valor = tarifa.tipo.value, tarifa.valor
                elif _tiene_tarifas_especificas(db, com.id):
                    comision, finca_tarifa, tipo, valor = Decimal("0"), "—", "sin_tarifa", Decimal("0")
                else:
                    # fallback a globales
                    comision = sum(
                        (_calcular_comision_con_tarifa(oi, t) for t in com.tarifas),
                        Decimal("0"),
                    )
                    finca_tarifa, tipo, valor = "(GLOBAL)", "global", Decimal("0")

                total_por_com[com.nombre] = total_por_com.get(com.nombre, Decimal("0")) + comision

                # ¿la tarifa emparejada es de otro sector?
                flag = ""
                if tarifa and tarifa.finca:
                    if normalizar_nombre_finca(tarifa.finca.nombre) != normalizar_nombre_finca(sector_orden):
                        flag = " *** SECTOR DISTINTO"
                        sospechosos += 1
                elif tarifa and not tarifa.finca and sector_orden not in ("-", "", None):
                    flag = " *** TARIFA SIN FINCA aplicada a orden con sector"
                    sospechosos += 1

                print(
                    f"O{oi.numero_orden or '?':>10} | {com.nombre:18} | "
                    f"prod={(oi.producto or '?')[:18]:18} | "
                    f"sector_orden={sector_orden[:14]:14} | tarifa_finca={finca_tarifa[:14]:14} | "
                    f"cant={oi.cantidad} {oi.unidad or ''} | {tipo} {valor} | "
                    f"total={oi.total} | comision={comision:.2f}{flag}"
                )

        print("\n=== TOTAL comisión por comisionista (órdenes pagadas) ===")
        for nombre, tot in sorted(total_por_com.items(), key=lambda x: -x[1]):
            print(f"  {nombre:20} {tot:.2f}")
        print(f"\nCasos sospechosos (sector distinto / sin finca): {sospechosos}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
