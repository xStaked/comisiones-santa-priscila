"""
Seed script para catálogos base: clientes, fincas y productos.

Run as:
    python -m app.commands.seed_catalogos
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from decimal import Decimal
from sqlalchemy import text

from app.database import SessionLocal
from app.models.cliente import Cliente, Finca
from app.models.producto import Producto


SANTA_PRISCILA_FINCAS = [
    "AFRICA",
    "ASIA",
    "BAJEN A",
    "BAJEN B",
    "CALIFORNIA A",
    "CALIFORNIA B",
    "CORVINERO A",
    "CORVINERO B",
    "CORVINERO C",
    "CHANDUY",
    "CHURUTE",
    "DAULAR",
    "DAULAR CURAZAO",
    "GOLFO",
    "KOREA",
    "PAÑAMAO",
    "SABANA JAMAICA",
    "SABANA SINGAPUR",
    "TAURA A",
    "TAURA B",
    "TAURA C",
    "TAURA D",
]

OTROS_CLIENTES = [
    "CAMPONIO",
    "INTEDECAM",
    "INTEDECAM ISLA PALO SANTO",
    "GOLDENSHRIMP",
    "SABANETA CORP",
    "AQUALITORAL",
    "BRUMESA",
    "ARIRANG",
    "PESQUESOL",
    "PESYCAM",
    "GOODEC",
    "INDALSUD",
    "ALFASHRIMP",
    "FAGUILL",
    "MAR DE ORO",
    "ROSSCAMARONERA",
    "SAN ROLANDO",
    "FRIGOLANDIA",
    "PLUMONT - EXPALSA",
    "CALIMMO - EXPALSA",
    "FILACAS - EXPALSA",
    "PUROCONGO",
]

PRODUCTOS_DATA = [
    {"nombre": "PAST TH", "unidad_comision": "kg", "tacho_kilos": None},
    {"nombre": "PAST GRAN", "unidad_comision": "kg", "tacho_kilos": None},
    {"nombre": "PAST ALIM", "unidad_comision": "kg", "tacho_kilos": None},
    {
        "nombre": "ECU-BACILLUS SALUD",
        "unidad_comision": "tacho",
        "tacho_kilos": Decimal("10"),
        "peso_por_unidad": Decimal("10"),
    },
    {
        "nombre": "ECU-BACILLUS AGUA",
        "unidad_comision": "tacho",
        "tacho_kilos": Decimal("10"),
        "peso_por_unidad": Decimal("10"),
    },
    {
        "nombre": "ECU-BACILLUS SUELO",
        "unidad_comision": "tacho",
        "tacho_kilos": Decimal("10"),
        "peso_por_unidad": Decimal("10"),
    },
    {"nombre": "CITRIUS", "unidad_comision": "litro", "tacho_kilos": None},
    {"nombre": "NATUXTRACT", "unidad_comision": "tacho", "tacho_kilos": Decimal("15")},
    {"nombre": "SACO TEST", "unidad_comision": "saco", "saco_kilos": Decimal("25")},
    {"nombre": "CALCINIT", "unidad_comision": "kg", "tacho_kilos": None},
    {"nombre": "MORTAL C", "unidad_comision": "litro", "tacho_kilos": None},
    {"nombre": "ECULÁCTICAS", "unidad_comision": "kg", "tacho_kilos": None},
    {"nombre": "CALCIUM POTASIUM MAGNESIUM", "unidad_comision": "kg", "tacho_kilos": None},
]


def truncate_catalogos(db) -> None:
    tables = ["tarifas_cliente_producto", "fincas", "clientes", "productos"]
    for table in tables:
        db.execute(text(f'DELETE FROM "{table}"'))
    db.commit()
    print("Catálogos truncados.")


def seed_clientes(db):
    # Santa Priscila (grupo)
    sp = Cliente(
        nombre="Santa Priscila",
        tipo="grupo",
    )
    db.add(sp)
    db.flush()

    for nombre_finca in SANTA_PRISCILA_FINCAS:
        db.add(Finca(nombre=nombre_finca, cliente_id=sp.id))

    # Otros clientes (individuales)
    for nombre in OTROS_CLIENTES:
        db.add(
            Cliente(
                nombre=nombre,
                tipo="individual",
            )
        )

    db.commit()
    print(f"Seeded 1 cliente grupo + {len(OTROS_CLIENTES)} clientes individuales.")


def seed_productos(db):
    for data in PRODUCTOS_DATA:
        db.add(
            Producto(
                nombre=data["nombre"],
                unidad_comision=data["unidad_comision"],
                tacho_kilos=data.get("tacho_kilos"),
                saco_kilos=data.get("saco_kilos"),
                peso_por_unidad=data.get("peso_por_unidad"),
            )
        )
    db.commit()
    print(f"Seeded {len(PRODUCTOS_DATA)} productos.")


def main():
    db = SessionLocal()
    try:
        truncate_catalogos(db)
        seed_clientes(db)
        seed_productos(db)
        print("Catálogos seeding completado exitosamente.")
    except Exception as exc:
        db.rollback()
        print(f"Error seeding catálogos: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
