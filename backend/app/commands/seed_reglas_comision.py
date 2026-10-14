"""Aplica las vigencias de Luis Castro y el umbral de Junior Naranjo."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.comisionista import Comisionista, Tarifa, TipoTarifa
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.catalog_normalization import _normalizar_texto, normalizar_nombre_producto


INICIO_TARIFA_EXTERNA_LUIS = date(2026, 8, 1)
FIN_TARIFA_INTERNA_LUIS = date(2026, 7, 31)
UMBRAL_JUNIOR = Decimal("1000")
VALOR_UMBRAL_JUNIOR = Decimal("3.50")
PRODUCTOS_JUNIOR = {"PAST TH", "ECU BACILLUS SUELO PASTILLA", "PAST ALIM", "ECU-BACILLUS SALUD"}


def _buscar_luis(db: Session) -> Comisionista | None:
    nombres = {"LUIS CASTRO", "CASTRO"}
    resultados = [c for c in db.query(Comisionista).all() if _normalizar_texto(c.nombre) in nombres]
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


def _copiar_tarifa_global(db: Session, tarifa: Tarifa) -> bool:
    tarifa.vigente_hasta = FIN_TARIFA_INTERNA_LUIS
    existente = (
        db.query(Tarifa)
        .filter(
            Tarifa.comisionista_id == tarifa.comisionista_id,
            Tarifa.tipo == tarifa.tipo,
            Tarifa.vigente_desde == INICIO_TARIFA_EXTERNA_LUIS,
        )
        .first()
    )
    if existente:
        existente.valor = Decimal("5") if tarifa.tipo == TipoTarifa.porcentaje else tarifa.valor
        existente.vigente_hasta = None
        existente.proveedores_excluidos = tarifa.proveedores_excluidos or []
        existente.umbral_kg = tarifa.umbral_kg
        existente.valor_sobre_umbral = tarifa.valor_sobre_umbral
        return False
    db.add(
        Tarifa(
            comisionista_id=tarifa.comisionista_id,
            tipo=tarifa.tipo,
            valor=Decimal("5") if tarifa.tipo == TipoTarifa.porcentaje else tarifa.valor,
            proveedores_excluidos=tarifa.proveedores_excluidos or [],
            umbral_kg=tarifa.umbral_kg,
            valor_sobre_umbral=tarifa.valor_sobre_umbral,
            vigente_desde=INICIO_TARIFA_EXTERNA_LUIS,
        )
    )
    return True


def _copiar_tarifa_especifica(db: Session, tarifa: TarifaClienteProducto) -> bool:
    tarifa.vigente_hasta = FIN_TARIFA_INTERNA_LUIS
    existente = (
        db.query(TarifaClienteProducto)
        .filter(
            TarifaClienteProducto.comisionista_id == tarifa.comisionista_id,
            TarifaClienteProducto.cliente_id == tarifa.cliente_id,
            TarifaClienteProducto.producto_id == tarifa.producto_id,
            TarifaClienteProducto.finca_id == tarifa.finca_id,
            TarifaClienteProducto.proveedor == tarifa.proveedor,
            TarifaClienteProducto.vigente_desde == INICIO_TARIFA_EXTERNA_LUIS,
        )
        .first()
    )
    valor = Decimal("5") if tarifa.tipo == TipoTarifa.porcentaje else tarifa.valor
    if existente:
        existente.tipo = tarifa.tipo
        existente.valor = valor
        existente.activo = tarifa.activo
        existente.proveedores_excluidos = tarifa.proveedores_excluidos or []
        existente.umbral_kg = tarifa.umbral_kg
        existente.valor_sobre_umbral = tarifa.valor_sobre_umbral
        existente.vigente_hasta = None
        return False
    db.add(
        TarifaClienteProducto(
            comisionista_id=tarifa.comisionista_id,
            cliente_id=tarifa.cliente_id,
            producto_id=tarifa.producto_id,
            finca_id=tarifa.finca_id,
            proveedor=tarifa.proveedor,
            proveedores_excluidos=tarifa.proveedores_excluidos or [],
            tipo=tarifa.tipo,
            valor=valor,
            activo=tarifa.activo,
            umbral_kg=tarifa.umbral_kg,
            valor_sobre_umbral=tarifa.valor_sobre_umbral,
            vigente_desde=INICIO_TARIFA_EXTERNA_LUIS,
        )
    )
    return True


def aplicar_reglas_comision(db: Session) -> dict[str, int]:
    luis = _buscar_luis(db)
    creadas_luis = 0
    if luis:
        for tarifa in list(luis.tarifas):
            if tarifa.vigente_desde == INICIO_TARIFA_EXTERNA_LUIS:
                continue
            creadas_luis += _copiar_tarifa_global(db, tarifa)
        especificas = (
            db.query(TarifaClienteProducto)
            .filter(TarifaClienteProducto.comisionista_id == luis.id)
            .all()
        )
        for tarifa in especificas:
            if tarifa.vigente_desde == INICIO_TARIFA_EXTERNA_LUIS:
                continue
            creadas_luis += _copiar_tarifa_especifica(db, tarifa)

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
