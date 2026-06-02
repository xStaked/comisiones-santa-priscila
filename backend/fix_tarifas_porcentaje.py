#!/usr/bin/env python3
"""
Corrige tarifas específicas de tipo porcentaje que fueron cargadas
como fracción decimal (0.01 = 1%) en vez de porcentaje directo (1.0 = 1%).

Uso:
    cd backend
    source .venv/bin/activate
    python fix_tarifas_porcentaje.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from decimal import Decimal
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.models.comisionista import Tarifa, TipoTarifa


def main():
    db: Session = SessionLocal()
    try:
        # 1. Tarifas específicas
        tarifas_esp = (
            db.query(TarifaClienteProducto)
            .filter(
                TarifaClienteProducto.tipo == TipoTarifa.porcentaje,
                TarifaClienteProducto.valor < Decimal("0.1"),
            )
            .all()
        )

        print(f"Tarifas específicas de porcentaje < 0.1 encontradas: {len(tarifas_esp)}")
        if tarifas_esp:
            print("¿Querés multiplicarlas por 100? (s/n)")
            respuesta = input().strip().lower()
            if respuesta in {"s", "si", "yes", "y"}:
                for t in tarifas_esp:
                    t.valor = t.valor * Decimal("100")
                db.commit()
                print(f"✅ {len(tarifas_esp)} tarifas específicas corregidas.")
            else:
                print("Cancelado. No se hicieron cambios.")
        else:
            print("No se encontraron tarifas específicas para corregir.")

        # 2. Tarifas globales
        tarifas_glob = (
            db.query(Tarifa)
            .filter(
                Tarifa.tipo == TipoTarifa.porcentaje,
                Tarifa.valor < Decimal("0.1"),
            )
            .all()
        )

        print(f"\nTarifas globales de porcentaje < 0.1 encontradas: {len(tarifas_glob)}")
        if tarifas_glob:
            print("¿Querés multiplicarlas por 100 también? (s/n)")
            respuesta = input().strip().lower()
            if respuesta in {"s", "si", "yes", "y"}:
                for t in tarifas_glob:
                    t.valor = t.valor * Decimal("100")
                db.commit()
                print(f"✅ {len(tarifas_glob)} tarifas globales corregidas.")
            else:
                print("Cancelado. No se hicieron cambios.")
        else:
            print("No se encontraron tarifas globales para corregir.")

    except Exception as exc:
        db.rollback()
        print(f"❌ Error: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
