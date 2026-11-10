"""
Borra las entradas de extracción pendientes (vistas previas descartadas).

Uso:
    python -m app.commands.limpiar_extracciones [--dias 30]

Las entradas vinculadas a una orden no se tocan: son las que permiten
reejecutar el parser (python -m app.commands.reextraer).
"""

import argparse
import os
import sys

# Ensure the backend directory is on the path when running outside Docker
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.database import SessionLocal
from app.services.extracciones import limpiar_pendientes


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Borra entradas de extracción de previews descartados"
    )
    parser.add_argument(
        "--dias", type=int, default=30, help="antigüedad mínima en días"
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        eliminadas = limpiar_pendientes(db, args.dias)
        print(f"Eliminadas {eliminadas} entradas pendientes")
    finally:
        db.close()


if __name__ == "__main__":
    main()
