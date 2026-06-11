"""
Seed script that populates the database with demo data.

Run as:
    python -m app.commands.seed_demo
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import uuid
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import text

from app.database import SessionLocal
from app.models import (
    Comisionista,
    Tarifa,
    TipoTarifa,
    Orden,
    OrdenItem,
    Asignacion,
    EstadoOrden,
    Liquidacion,
    LiquidacionItem,
    LiquidacionItemTarifa,
)


def make_uuid(seed: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_DNS, f"dinacuamar.demo.{seed}")


COMISIONISTAS_DATA = [
    {"frontend_id": "com-001", "nombre": "Carlos Mendoza", "tarifas": [(TipoTarifa.porcentaje, Decimal("2.5"))]},
    {"frontend_id": "com-002", "nombre": "María Fernanda López", "tarifas": [(TipoTarifa.porcentaje, Decimal("3.0"))]},
    {"frontend_id": "com-003", "nombre": "José Antonio Vargas", "tarifas": [(TipoTarifa.fijo_kg, Decimal("0.08"))]},
    {"frontend_id": "com-004", "nombre": "Ana Patricia Ruiz", "tarifas": [(TipoTarifa.porcentaje, Decimal("1.8"))]},
    {"frontend_id": "com-005", "nombre": "Roberto Carlos Sánchez", "tarifas": [(TipoTarifa.fijo_kg, Decimal("0.12"))]},
    {"frontend_id": "com-006", "nombre": "Diana Michelle Castro", "tarifas": [(TipoTarifa.porcentaje, Decimal("2.0"))]},
    {"frontend_id": "com-007", "nombre": "Luis Fernando Vega", "tarifas": [(TipoTarifa.fijo_kg, Decimal("0.05")), (TipoTarifa.porcentaje, Decimal("1.5"))]},
]

PRODUCTOS = [
    {"nombre": "Camarón blanco HOSO 16/20", "finca": "Finca El Coral"},
    {"nombre": "Camarón blanco HOSO 21/25", "finca": "Finca El Coral"},
    {"nombre": "Camarón blanco HLSO 31/35", "finca": "Finca San Rafael"},
    {"nombre": "Camarón organico PDTO 41/50", "finca": "Finca Santa Elena"},
    {"nombre": "Tilapia fresca entera", "finca": "Finca San Rafael"},
    {"nombre": "Tilapia filete IQF", "finca": "Finca Santa Elena"},
    {"nombre": "Camarón precocido P&D 51/60", "finca": "Finca El Coral"},
    {"nombre": "Camarón blanco PDTO 26/30", "finca": "Finca San Rafael"},
]

ORDEN_ITEMS_DATA = [
    # Marzo 2026
    {"fecha": "2026-03-02", "numero": "OC-2026-0451", "prod": 0, "cant": 2500, "unidad": "kg", "precio": Decimal("8.5"), "coms": ["com-001"]},
    {"fecha": "2026-03-02", "numero": "OC-2026-0451", "prod": 1, "cant": 1800, "unidad": "kg", "precio": Decimal("7.9"), "coms": ["com-001", "com-002"]},
    {"fecha": "2026-03-05", "numero": "OC-2026-0458", "prod": 2, "cant": 3200, "unidad": "kg", "precio": Decimal("6.75"), "coms": ["com-002"]},
    {"fecha": "2026-03-08", "numero": "OC-2026-0462", "prod": 3, "cant": 1500, "unidad": "kg", "precio": Decimal("9.2"), "coms": ["com-003"]},
    {"fecha": "2026-03-10", "numero": "OC-2026-0465", "prod": 4, "cant": 4200, "unidad": "kg", "precio": Decimal("4.5"), "coms": ["com-004", "com-007"]},
    {"fecha": "2026-03-12", "numero": "OC-2026-0470", "prod": 5, "cant": 2100, "unidad": "kg", "precio": Decimal("5.8"), "coms": ["com-002"]},
    {"fecha": "2026-03-15", "numero": "OC-2026-0475", "prod": 6, "cant": 2800, "unidad": "kg", "precio": Decimal("7.1"), "coms": ["com-005"]},
    {"fecha": "2026-03-18", "numero": "OC-2026-0480", "prod": 7, "cant": 1900, "unidad": "kg", "precio": Decimal("8.0"), "coms": ["com-006"]},
    {"fecha": "2026-03-20", "numero": "OC-2026-0483", "prod": 0, "cant": 3100, "unidad": "kg", "precio": Decimal("8.6"), "coms": ["com-001", "com-003"]},
    {"fecha": "2026-03-22", "numero": "OC-2026-0488", "prod": 2, "cant": 2200, "unidad": "kg", "precio": Decimal("6.8"), "coms": ["com-003"]},
    # Abril 2026
    {"fecha": "2026-04-03", "numero": "OC-2026-0501", "prod": 1, "cant": 2600, "unidad": "kg", "precio": Decimal("7.95"), "coms": ["com-002"]},
    {"fecha": "2026-04-05", "numero": "OC-2026-0505", "prod": 3, "cant": 1700, "unidad": "kg", "precio": Decimal("9.15"), "coms": ["com-004"]},
    {"fecha": "2026-04-08", "numero": "OC-2026-0510", "prod": 4, "cant": 4500, "unidad": "kg", "precio": Decimal("4.55"), "coms": ["com-005", "com-007"]},
    {"fecha": "2026-04-10", "numero": "OC-2026-0512", "prod": 5, "cant": 2300, "unidad": "kg", "precio": Decimal("5.85"), "coms": ["com-006"]},
    {"fecha": "2026-04-12", "numero": "OC-2026-0515", "prod": 6, "cant": 3000, "unidad": "kg", "precio": Decimal("7.2"), "coms": ["com-001"]},
    {"fecha": "2026-04-15", "numero": "OC-2026-0520", "prod": 7, "cant": 2000, "unidad": "kg", "precio": Decimal("8.1"), "coms": ["com-002", "com-007"]},
    {"fecha": "2026-04-18", "numero": "OC-2026-0525", "prod": 0, "cant": 3300, "unidad": "kg", "precio": Decimal("8.7"), "coms": ["com-003"]},
    {"fecha": "2026-04-20", "numero": "OC-2026-0528", "prod": 2, "cant": 2400, "unidad": "kg", "precio": Decimal("6.9"), "coms": ["com-004"]},
    # Mayo 2026 (pagadas, pendientes de liquidar)
    {"fecha": "2026-05-03", "numero": "OC-2026-0550", "prod": 1, "cant": 2700, "unidad": "kg", "precio": Decimal("8.0"), "coms": ["com-005"]},
    {"fecha": "2026-05-05", "numero": "OC-2026-0553", "prod": 3, "cant": 1600, "unidad": "kg", "precio": Decimal("9.3"), "coms": ["com-006"]},
    {"fecha": "2026-05-08", "numero": "OC-2026-0558", "prod": 4, "cant": 4000, "unidad": "kg", "precio": Decimal("4.6"), "coms": ["com-001", "com-007"]},
    {"fecha": "2026-05-10", "numero": "OC-2026-0560", "prod": 5, "cant": 2200, "unidad": "kg", "precio": Decimal("5.9"), "coms": ["com-002"]},
]

LIQUIDACIONES_DATA = [
    {"id_seed": "liq-001", "nombre": "Liquidación Marzo 2026", "mes": "2026-03", "fecha_creacion": datetime(2026, 3, 25, 10, 30, 0), "orden_indices": list(range(0, 8))},
    {"id_seed": "liq-002", "nombre": "Liquidación 2da Quincena Marzo", "mes": "2026-03", "fecha_creacion": datetime(2026, 3, 31, 14, 15, 0), "orden_indices": list(range(8, 10))},
    {"id_seed": "liq-003", "nombre": "Liquidación Abril 2026", "mes": "2026-04", "fecha_creacion": datetime(2026, 4, 28, 9, 0, 0), "orden_indices": list(range(10, 18))},
]


def truncate_all(db) -> None:
    tables = [
        "liquidacion_item_tarifas",
        "liquidacion_items",
        "liquidaciones",
        "asignaciones",
        "orden_items",
        "ordenes",
        "tarifas",
        "comisionistas",
    ]
    for table in tables:
        db.execute(text(f'DELETE FROM "{table}"'))
    db.commit()
    print("Existing data truncated.")


def seed_comisionistas(db):
    comisionistas = {}
    for data in COMISIONISTAS_DATA:
        cid = make_uuid(data["frontend_id"])
        com = Comisionista(id=cid, nombre=data["nombre"])
        db.add(com)
        comisionistas[data["frontend_id"]] = com

        for tipo, valor in data["tarifas"]:
            db.add(Tarifa(comisionista_id=cid, tipo=tipo, valor=valor))
    db.commit()
    print(f"Seeded {len(comisionistas)} comisionistas.")
    return comisionistas


def seed_ordenes(db, comisionistas):
    ordenes = []
    for i, data in enumerate(ORDEN_ITEMS_DATA):
        prod = PRODUCTOS[data["prod"]]
        cant = Decimal(str(data["cant"]))
        total = cant * data["precio"]

        es_historica = any(i in liq["orden_indices"] for liq in LIQUIDACIONES_DATA)
        estado = EstadoOrden.liquidada if es_historica else EstadoOrden.pagada

        oid = make_uuid(f"orden-{i}")
        cabecera = Orden(
            id=make_uuid(f"orden-cabecera-{i}"),
            fecha=datetime.strptime(data["fecha"], "%Y-%m-%d").date(),
            numero_orden=data["numero"],
            origen="manual",
            estado=estado,
        )
        db.add(cabecera)
        db.flush()

        orden = OrdenItem(
            id=oid,
            orden_id=cabecera.id,
            fecha=datetime.strptime(data["fecha"], "%Y-%m-%d").date(),
            numero_orden=data["numero"],
            finca=prod["finca"],
            producto=prod["nombre"],
            cantidad=cant,
            unidad=data["unidad"],
            precio_unitario=data["precio"],
            total=total,
            sector=prod["finca"],
            estado=estado,
        )
        db.add(orden)
        ordenes.append(orden)

        for com_frontend_id in data["coms"]:
            db.add(Asignacion(orden_item_id=oid, comisionista_id=comisionistas[com_frontend_id].id))
    db.commit()
    print(f"Seeded {len(ordenes)} orden items with asignaciones.")
    return ordenes


def calcular_comision(cantidad: Decimal, total: Decimal, tipo: TipoTarifa, valor: Decimal) -> Decimal:
    if tipo == TipoTarifa.porcentaje:
        return total * (valor / Decimal("100"))
    elif tipo == TipoTarifa.fijo_kg:
        return cantidad * valor
    return Decimal("0")


def seed_liquidaciones(db, ordenes, comisionistas):
    tarifas_por_comisionista = {}
    for com in comisionistas.values():
        tarifas_por_comisionista[com.id] = list(com.tarifas)

    for liq_data in LIQUIDACIONES_DATA:
        indices = liq_data["orden_indices"]
        liq_ordenes = [ordenes[i] for i in indices]

        liq = Liquidacion(
            id=make_uuid(liq_data["id_seed"]),
            nombre=liq_data["nombre"],
            mes=liq_data["mes"],
            fecha_creacion=liq_data["fecha_creacion"],
        )
        db.add(liq)
        db.flush()

        for orden in liq_ordenes:
            liq_item = LiquidacionItem(
                id=make_uuid(f"{liq_data['id_seed']}-item-{orden.id}"),
                liquidacion_id=liq.id,
                orden_item_id=orden.id,
                orden_id=orden.orden_id,
                fecha_snapshot=orden.fecha,
                numero_orden_snapshot=orden.numero_orden,
                finca_snapshot=orden.finca,
                producto_snapshot=orden.producto,
                cantidad_snapshot=orden.cantidad,
                unidad_snapshot=orden.unidad,
                precio_unitario_snapshot=orden.precio_unitario,
                total_snapshot=orden.total,
                sector_snapshot=orden.sector,
                estado_snapshot=orden.estado.value,
            )
            db.add(liq_item)
            db.flush()

            for asig in orden.asignaciones:
                com_id = asig.comisionista_id
                com = comisionistas.get(next((k for k, v in comisionistas.items() if v.id == com_id), None))
                tarifas = tarifas_por_comisionista.get(com_id, [])

                for tarifa in tarifas:
                    comision = calcular_comision(orden.cantidad, orden.total, tarifa.tipo, tarifa.valor)
                    db.add(
                        LiquidacionItemTarifa(
                            liquidacion_item_id=liq_item.id,
                            comisionista_id=com_id,
                            comisionista_nombre_snapshot=com.nombre if com else "",
                            tipo_snapshot=tarifa.tipo.value,
                            valor_snapshot=tarifa.valor,
                            comision_calculada=comision,
                        )
                    )

        db.commit()
        print(f"Seeded liquidacion: {liq_data['nombre']} with {len(indices)} items.")

    print("All liquidaciones seeded.")


def main():
    db = SessionLocal()
    try:
        truncate_all(db)
        comisionistas = seed_comisionistas(db)
        ordenes = seed_ordenes(db, comisionistas)
        seed_liquidaciones(db, ordenes, comisionistas)
        print("Demo data seeding completed successfully.")
    except Exception as exc:
        db.rollback()
        print(f"Error seeding demo data: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
