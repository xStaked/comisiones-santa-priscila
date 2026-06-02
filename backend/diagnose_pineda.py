#!/usr/bin/env python3
"""
Script de diagnóstico para ver qué tarifas tiene PINEDA y por qué no matchean.

Uso:
    cd backend
    source .venv/bin/activate
    python diagnose_pineda.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.comisionista import Comisionista
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.models.orden import OrdenItem
from app.models.cliente import Cliente, Finca
from app.models.producto import Producto
from app.services.liquidacion import _buscar_tarifa_especifica, _tiene_tarifas_especificas


def main():
    db: Session = SessionLocal()
    try:
        # 1. Buscar comisionista PINEDA (o similar)
        comisionistas = db.query(Comisionista).filter(Comisionista.nombre.ilike("%pineda%")).all()
        if not comisionistas:
            print("❌ No se encontró ningún comisionista con 'PINEDA' en el nombre")
            return

        for com in comisionistas:
            print(f"\n{'='*60}")
            print(f"COMISIONISTA: {com.nombre} (ID: {com.id})")
            print(f"{'='*60}")

            # 2. Ver si tiene tarifas específicas
            tiene_esp = _tiene_tarifas_especificas(db, com.id)
            print(f"Tiene tarifas específicas activas: {tiene_esp}")

            # 3. Listar tarifas específicas
            tarifas = (
                db.query(TarifaClienteProducto)
                .filter(
                    TarifaClienteProducto.comisionista_id == com.id,
                    TarifaClienteProducto.activo.is_(True),
                )
                .all()
            )
            print(f"Cantidad de tarifas específicas activas: {len(tarifas)}")
            for t in tarifas:
                cliente = db.query(Cliente).filter(Cliente.id == t.cliente_id).first()
                producto = db.query(Producto).filter(Producto.id == t.producto_id).first()
                finca = db.query(Finca).filter(Finca.id == t.finca_id).first() if t.finca_id else None
                print(f"  - Cliente: {cliente.nombre if cliente else '???'} | Producto: {producto.nombre if producto else '???'} | Finca: {finca.nombre if finca else '(sin finca)'} | Tipo: {t.tipo.value} | Valor: {t.valor}")

            # 4. Buscar órdenes activas donde PINEDA esté asignado
            items = (
                db.query(OrdenItem)
                .filter(OrdenItem.estado == "activo")
                .all()
            )
            items_pineda = []
            for item in items:
                for asig in item.asignaciones:
                    if asig.comisionista_id == com.id:
                        items_pineda.append(item)
                        break

            print(f"\nÓrdenes activas asignadas a PINEDA: {len(items_pineda)}")
            for item in items_pineda[:20]:  # Mostrar máximo 20
                tarifa = _buscar_tarifa_especifica(db, item, com.id)
                print(f"  - Item: {item.numero_orden} | Finca: {item.finca} | Sector: {item.sector} | Producto: {item.producto} | Total: {item.total}")
                print(f"    cliente_id={item.cliente_id} producto_id={item.producto_id} finca_id={item.finca_id}")
                if tarifa:
                    print(f"    ✅ Tarifa encontrada: tipo={tarifa.tipo.value} valor={tarifa.valor}")
                else:
                    print(f"    ❌ Sin tarifa específica → comisión será $0")

            if len(items_pineda) > 20:
                print(f"    ... y {len(items_pineda) - 20} ítems más")

    finally:
        db.close()


if __name__ == "__main__":
    main()
