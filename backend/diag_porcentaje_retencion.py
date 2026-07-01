#!/usr/bin/env python3
"""Solo-lectura: para 4 comisionistas con valores que no cuadran, muestra
qué tipo de tarifa usan (global vs específica) y si la retención se aplica.

Uso:
    DATABASE_URL=... .venv/bin/python diag_porcentaje_retencion.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.comisionista import Comisionista, Tarifa, TipoTarifa
from app.models.orden import Asignacion, EstadoOrden, OrdenItem
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.liquidacion import (
    _buscar_tarifa_especifica,
    _tiene_tarifas_especificas,
    _calcular_comision_especifica,
    _calcular_comision_con_tarifa,
)

NOMBRES = ["ARROYO", "CORDOVA", "ZARATE", "MALAVE"]


def main():
    db = SessionLocal()
    try:
        coms = db.query(Comisionista).all()
        objetivo = [c for c in coms if any(n in c.nombre.upper() for n in NOMBRES)]
        print("Comisionistas que coinciden:")
        for c in objetivo:
            print(f"  - {c.nombre}  (id={c.id})")
        print()

        for c in objetivo:
            esp = db.query(TarifaClienteProducto).filter(
                TarifaClienteProducto.comisionista_id == c.id,
                TarifaClienteProducto.activo.is_(True),
            ).all()
            glob = c.tarifas  # globales (Tarifa)
            esp_pct = [t for t in esp if t.tipo == TipoTarifa.porcentaje]
            glob_pct = [t for t in glob if t.tipo == TipoTarifa.porcentaje]
            print(f"=== {c.nombre} ===")
            print(f"  específicas (TarifaClienteProducto): {len(esp)}  (porcentaje: {len(esp_pct)})")
            print(f"  globales (Tarifa):                   {len(glob)} (porcentaje: {len(glob_pct)})")
            if glob:
                for t in glob:
                    print(f"     global: tipo={t.tipo.value} valor={t.valor}")
            # tipos de específicas
            tipos = {}
            for t in esp:
                tipos[t.tipo.value] = tipos.get(t.tipo.value, 0) + 1
            print(f"  tipos específicas: {tipos}")

            # Items pagados asignados a este comisionista
            items = (
                db.query(OrdenItem)
                .join(Asignacion, Asignacion.orden_item_id == OrdenItem.id)
                .filter(Asignacion.comisionista_id == c.id,
                        OrdenItem.estado == EstadoOrden.pagada)
                .all()
            )
            print(f"  items pagados asignados: {len(items)}")
            total_sistema = 0.0
            usa_global = 0
            usa_esp = 0
            for oi in items:
                te = _buscar_tarifa_especifica(db, oi, c.id)
                if te is not None:
                    com = float(_calcular_comision_especifica(db, oi, te))
                    usa_esp += 1
                elif not _tiene_tarifas_especificas(db, c.id):
                    com = sum(float(_calcular_comision_con_tarifa(oi, t)) for t in c.tarifas)
                    usa_global += 1
                else:
                    com = 0.0
                total_sistema += com
            print(f"  -> usa tarifa específica en {usa_esp} items, global en {usa_global} items")
            print(f"  -> TOTAL comisión sistema (pagadas): {total_sistema:,.2f}")
            print()
    finally:
        db.close()


if __name__ == "__main__":
    main()
