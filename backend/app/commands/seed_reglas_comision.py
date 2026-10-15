"""Carga las reglas vigentes de Luis Castro y Junior Naranjo."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.cliente import Cliente
from app.models.comisionista import Comisionista, Tarifa, TipoTarifa
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.catalog_normalization import _normalizar_texto, normalizar_nombre_producto


INICIO_TARIFA_EXTERNA_LUIS = date(2026, 8, 1)
FIN_TARIFA_INTERNA_LUIS = date(2026, 7, 31)
VALOR_TARIFA_EXTERNA_LUIS = Decimal("5")
UMBRAL_JUNIOR = Decimal("1000")
VALOR_UMBRAL_JUNIOR = Decimal("3.50")
CLIENTES_LUIS_EXTERNOS = {
    "FRIGOLANDIA",
    "PLUMONT EXPALSA",
    "FILACAS EXPALSA",
    "CALIMMO EXPALSA",
}
PRODUCTOS_LUIS_EXTERNOS = {
    "PAST TH",
    "ECU BACILLUS SUELO PASTILLA",
    "PAST ALIM",
    "ECU-BACILLUS SALUD",
    "ECU-BACILLUS AGUA",
    "ECU-BACILLUS SUELO",
}
PRODUCTOS_JUNIOR = {
    "PAST TH",
    "ECU BACILLUS SUELO PASTILLA",
    "PAST ALIM",
    "ECU-BACILLUS SALUD",
}


def _buscar_luis(db: Session) -> Comisionista | None:
    resultados = [
        c
        for c in db.query(Comisionista).all()
        if {"LUIS", "CASTRO"}.issubset(set(_normalizar_texto(c.nombre).split()))
        or _normalizar_texto(c.nombre) == "CASTRO"
    ]
    if len(resultados) > 1:
        raise ValueError("Hay varios comisionistas que coinciden con Luis Castro")
    return resultados[0] if resultados else None


def _buscar_unico_por_nombre(db: Session, tokens: set[str]) -> Comisionista | None:
    resultados = [
        c
        for c in db.query(Comisionista).all()
        if tokens.issubset(set(_normalizar_texto(c.nombre).split()))
    ]
    if len(resultados) > 1:
        raise ValueError(f"Hay varios comisionistas que coinciden con: {' '.join(sorted(tokens))}")
    return resultados[0] if resultados else None


def _cerrar_tarifas_luis(db: Session, luis: Comisionista) -> None:
    db.query(Tarifa).filter(
        Tarifa.comisionista_id == luis.id,
        or_(Tarifa.vigente_desde.is_(None), Tarifa.vigente_desde < INICIO_TARIFA_EXTERNA_LUIS),
    ).update({Tarifa.vigente_hasta: FIN_TARIFA_INTERNA_LUIS}, synchronize_session=False)
    db.query(TarifaClienteProducto).filter(
        TarifaClienteProducto.comisionista_id == luis.id,
        or_(
            TarifaClienteProducto.vigente_desde.is_(None),
            TarifaClienteProducto.vigente_desde < INICIO_TARIFA_EXTERNA_LUIS,
        ),
    ).update({TarifaClienteProducto.vigente_hasta: FIN_TARIFA_INTERNA_LUIS}, synchronize_session=False)


def _crear_tarifas_externas_luis(db: Session, luis: Comisionista) -> int:
    clientes = {
        _normalizar_texto(cliente.nombre): cliente
        for cliente in db.query(Cliente).all()
        if _normalizar_texto(cliente.nombre) in CLIENTES_LUIS_EXTERNOS
    }
    faltantes_clientes = CLIENTES_LUIS_EXTERNOS - clientes.keys()
    if faltantes_clientes:
        raise ValueError(f"Faltan clientes externos de Luis Castro: {sorted(faltantes_clientes)}")

    productos = {
        normalizar_nombre_producto(producto.nombre): producto
        for producto in db.query(Producto).all()
    }
    faltantes_productos = PRODUCTOS_LUIS_EXTERNOS - productos.keys()
    if faltantes_productos:
        raise ValueError(f"Faltan productos externos de Luis Castro: {sorted(faltantes_productos)}")

    claves_validas = {
        (cliente.id, productos[nombre_producto].id)
        for cliente in clientes.values()
        for nombre_producto in PRODUCTOS_LUIS_EXTERNOS
    }
    existentes = (
        db.query(TarifaClienteProducto)
        .filter(
            TarifaClienteProducto.comisionista_id == luis.id,
            TarifaClienteProducto.vigente_desde == INICIO_TARIFA_EXTERNA_LUIS,
        )
        .all()
    )
    por_clave = {(tarifa.cliente_id, tarifa.producto_id): tarifa for tarifa in existentes}
    for tarifa in existentes:
        if (tarifa.cliente_id, tarifa.producto_id) not in claves_validas:
            db.delete(tarifa)

    creadas = 0
    for cliente_id, producto_id in claves_validas:
        tarifa = por_clave.get((cliente_id, producto_id))
        if tarifa:
            tarifa.tipo = TipoTarifa.porcentaje
            tarifa.valor = VALOR_TARIFA_EXTERNA_LUIS
            tarifa.finca_id = None
            tarifa.proveedor = ""
            tarifa.proveedores_excluidos = []
            tarifa.activo = True
            tarifa.vigente_hasta = None
            continue
        db.add(
            TarifaClienteProducto(
                comisionista_id=luis.id,
                cliente_id=cliente_id,
                producto_id=producto_id,
                finca_id=None,
                proveedor="",
                proveedores_excluidos=[],
                tipo=TipoTarifa.porcentaje,
                valor=VALOR_TARIFA_EXTERNA_LUIS,
                activo=True,
                vigente_desde=INICIO_TARIFA_EXTERNA_LUIS,
            )
        )
        creadas += 1

    db.query(Tarifa).filter(
        Tarifa.comisionista_id == luis.id,
        Tarifa.vigente_desde == INICIO_TARIFA_EXTERNA_LUIS,
    ).delete(synchronize_session=False)
    return creadas


def aplicar_reglas_comision(db: Session) -> dict[str, int]:
    luis = _buscar_luis(db)
    creadas_luis = 0
    if luis:
        _cerrar_tarifas_luis(db, luis)
        creadas_luis = _crear_tarifas_externas_luis(db, luis)

    junior = _buscar_unico_por_nombre(db, {"JUNIOR", "NARANJO"})
    actualizadas_junior = 0
    if junior:
        tarifas_junior = (
            db.query(TarifaClienteProducto)
            .filter(TarifaClienteProducto.comisionista_id == junior.id)
            .all()
        )
        for tarifa in tarifas_junior:
            if not tarifa.producto:
                continue
            if normalizar_nombre_producto(tarifa.producto.nombre) not in PRODUCTOS_JUNIOR:
                continue
            tarifa.umbral_kg = UMBRAL_JUNIOR
            tarifa.valor_sobre_umbral = VALOR_UMBRAL_JUNIOR
            actualizadas_junior += 1

    db.commit()
    return {"tarifas_luis_creadas": creadas_luis, "tarifas_junior_actualizadas": actualizadas_junior}


def main() -> None:
    db = SessionLocal()
    try:
        resumen = aplicar_reglas_comision(db)
        for clave, valor in resumen.items():
            print(f"{clave}: {valor}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
