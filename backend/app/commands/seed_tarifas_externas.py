"""
Seed idempotente de tarifas externas desde COMISIONES EXTERNAS RESUMEN.pdf.

Uso:
    cd backend
    python -m app.commands.seed_tarifas_externas
"""

from __future__ import annotations

import os
import sys
from decimal import Decimal
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.database import SessionLocal
from app.models.cliente import Cliente, Finca
from app.models.comisionista import Comisionista, TipoTarifa
from app.models.producto import Producto, ProductoAlias
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.services.catalog_normalization import normalizar_nombre_finca


CLIENTES_FALTANTES = ["EXPALSA", "PINGUIMAR", "CAMPROEX", "PROMARISCO"]

PRODUCTOS_REQUERIDOS = {
    "MORTAL SHELL": {"unidad_comision": "litro"},
    "ECU BACILLUS SUELO PASTILLA": {"unidad_comision": "kg"},
    "ECU-BACILLUS AGUA": {
        "unidad_comision": "tacho",
        "tacho_kilos": Decimal("10"),
        "peso_por_unidad": Decimal("10"),
    },
    "ECU-BACILLUS SALUD": {
        "unidad_comision": "tacho",
        "tacho_kilos": Decimal("10"),
        "peso_por_unidad": Decimal("10"),
    },
    "ECU-BACILLUS SUELO": {
        "unidad_comision": "tacho",
        "tacho_kilos": Decimal("10"),
        "peso_por_unidad": Decimal("10"),
    },
}

PRODUCTO_UNIDAD = {
    "PAST TH": "kg",
    "ECU BACILLUS SUELO PASTILLA": "kg",
    "ECU-BACILLUS SALUD": "tacho",
    "ECU-BACILLUS AGUA": "tacho",
    "ECU-BACILLUS SUELO": "tacho",
    "CITRIUS": "litro",
    "CALCINIT": "kg",
    "NATUXTRACT": "tacho",
    "MORTAL C": "litro",
    "MORTAL SHELL": "litro",
}

ALIASES_PRODUCTO = {
    "NATRUXTACT": "NATUXTRACT",
    "NATRUXTACT-ECUCITRIUS": "NATUXTRACT",
    "NATUXTRACT-ECUCITRIUS": "NATUXTRACT",
    "MORTAL CONTROL": "MORTAL C",
    "NITRATO DED CALCIO": "CALCINIT",
    "ECU-BACILLUS PASTILLA": "PAST TH",
    "ECU-BACILLUS SUELO-PASTILLA TH": "PAST TH",
    "ECU-BACILLUS SUELO-PASTILLA": "ECU BACILLUS SUELO PASTILLA",
    "CITRIUS-011": "CITRIUS",
    "NITRATO DE CALCIO": "CALCINIT",
}

COLUMNAS_SANTA_PRISCILA = [
    ("past_th", "PAST TH", TipoTarifa.fijo_kg),
    ("pastilla", "ECU BACILLUS SUELO PASTILLA", TipoTarifa.fijo_kg),
    ("salud", "ECU-BACILLUS SALUD", TipoTarifa.fijo_kg),
    ("agua", "ECU-BACILLUS AGUA", TipoTarifa.fijo_kg),
    ("suelo_polvo", "ECU-BACILLUS SUELO", TipoTarifa.fijo_kg),
    ("citrius_litro", "CITRIUS", TipoTarifa.fijo_unidad),
    ("nitrato_saco", "CALCINIT", TipoTarifa.fijo_unidad),
    ("natuxtract_tacho", "NATUXTRACT", TipoTarifa.fijo_unidad),
    ("mortal_control_litro", "MORTAL C", TipoTarifa.fijo_unidad),
]

COLUMNAS_OTROS_CLIENTES = [
    ("pastilla", "PAST TH", TipoTarifa.fijo_kg),
    ("salud", "ECU-BACILLUS SALUD", TipoTarifa.fijo_kg),
    ("agua", "ECU-BACILLUS AGUA", TipoTarifa.fijo_kg),
    ("suelo_polvo", "ECU-BACILLUS SUELO", TipoTarifa.fijo_kg),
    ("citrius_litro", "CITRIUS", TipoTarifa.fijo_unidad),
    ("nitrato_saco", "CALCINIT", TipoTarifa.fijo_unidad),
    ("natuxtract_tacho", "NATUXTRACT", TipoTarifa.fijo_unidad),
    ("mortal_control_litro", "MORTAL C", TipoTarifa.fijo_unidad),
    ("mortal_shell_litro", "MORTAL SHELL", TipoTarifa.fijo_unidad),
]

SANTA_PRISCILA_TARIFAS = [
    # --- ALBURQUERQUE EDGAR (PDF page 1) ---
    {
        "comisionista": "ALBURQUERQUE EDGAR",
        "finca": "AFRICA ADMINISTRACION",
        "past_th": "1.00",
        "pastilla": "1.00",
        "salud": "1.00",
        "agua": "1.00",
        "suelo_polvo": "1.00",
    },
    {
        "comisionista": "ALBURQUERQUE EDGAR",
        "finca": "BAJEN ADM A",
        "past_th": "0.50",
        "pastilla": "0.50",
        "salud": "0.50",
        "agua": "0.50",
        "suelo_polvo": "0.50",
        "citrius_litro": "0.10",
    },
    {
        "comisionista": "ALBURQUERQUE EDGAR",
        "finca": "BAJEN ADM B",
        "past_th": "0.50",
        "pastilla": "0.50",
        "salud": "0.50",
        "agua": "0.50",
        "suelo_polvo": "0.50",
        "citrius_litro": "0.10",
    },
    {
        "comisionista": "ALBURQUERQUE EDGAR",
        "finca": "TAURA ADM A",
        "past_th": "2.00",
        "pastilla": "2.00",
        "salud": "2.00",
        "agua": "2.00",
        "suelo_polvo": "2.00",
        "citrius_litro": "0.15",
        "nitrato_saco": "1.00",
        "natuxtract_tacho": "2.00",
        "mortal_control_litro": "2.00",
    },
    {
        "comisionista": "ALBURQUERQUE EDGAR",
        "finca": "TAURA ADM B",
        "past_th": "2.00",
        "pastilla": "2.00",
        "salud": "2.00",
        "agua": "2.00",
        "suelo_polvo": "2.00",
        "citrius_litro": "0.15",
        "nitrato_saco": "1.00",
        "natuxtract_tacho": "2.00",
        "mortal_control_litro": "2.00",
    },
    {
        "comisionista": "ALBURQUERQUE EDGAR",
        "finca": "TAURA ADM C",
        "past_th": "2.00",
        "pastilla": "2.00",
        "salud": "2.00",
        "agua": "2.00",
        "suelo_polvo": "2.00",
        "citrius_litro": "0.15",
        "nitrato_saco": "1.00",
        "natuxtract_tacho": "2.00",
        "mortal_control_litro": "2.00",
    },
    {
        "comisionista": "ALBURQUERQUE EDGAR",
        "finca": "TAURA ADM D",
        "past_th": "2.00",
        "pastilla": "2.00",
        "salud": "2.00",
        "agua": "2.00",
        "suelo_polvo": "2.00",
        "citrius_litro": "0.15",
        "nitrato_saco": "1.00",
        "natuxtract_tacho": "2.00",
        "mortal_control_litro": "2.00",
    },
    {
        "comisionista": "ALBURQUERQUE EDGAR",
        "finca": "CALIFORNIA ADM A",
        "past_th": "1.50",
        "pastilla": "1.50",
        "salud": "1.50",
        "agua": "1.50",
        "suelo_polvo": "1.50",
        "citrius_litro": "0.05",
        "nitrato_saco": "0.50",
        "natuxtract_tacho": "1.00",
        "mortal_control_litro": "0.50",
    },
    {
        "comisionista": "ALBURQUERQUE EDGAR",
        "finca": "CALIFORNIA ADM B",
        "past_th": "1.50",
        "pastilla": "1.50",
        "salud": "1.50",
        "agua": "1.50",
        "suelo_polvo": "1.50",
        "citrius_litro": "0.05",
        "nitrato_saco": "0.50",
        "natuxtract_tacho": "1.00",
        "mortal_control_litro": "0.50",
    },
    {
        "comisionista": "ALBURQUERQUE EDGAR",
        "finca": "CORVINERO ADM A",
        "past_th": "0.50",
        "pastilla": "0.50",
        "salud": "0.50",
        "agua": "0.50",
        "suelo_polvo": "0.50",
        "citrius_litro": "0.08",
    },
    {
        "comisionista": "ALBURQUERQUE EDGAR",
        "finca": "CORVINERO ADM B",
        "past_th": "0.50",
        "pastilla": "0.50",
        "salud": "0.50",
        "agua": "0.50",
        "suelo_polvo": "0.50",
        "citrius_litro": "0.08",
    },
    # --- CORDOVA ROGER (PDF page 1) ---
    {
        "comisionista": "CORDOVA ROGER",
        "finca": "ASIA ADMINISTRACION",
        "past_th": "1.00",
        "pastilla": "1.00",
        "salud": "1.00",
        "agua": "1.00",
    },
    # --- JAIME MARTIN (PDF page 1) ---
    {
        "comisionista": "JAIME MARTIN",
        "finca": "TAURA ADM A",
        "past_th": "1.00",
        "pastilla": "1.00",
        "salud": "1.00",
        "agua": "1.00",
        "suelo_polvo": "2.00",
        "natuxtract_tacho": "2.00",
    },
    {
        "comisionista": "JAIME MARTIN",
        "finca": "CALIFORNIA ADM A",
        "past_th": "3.00",
        "pastilla": "3.00",
        "salud": "3.00",
        "citrius_litro": "0.15",
        "nitrato_saco": "0.50",
        "natuxtract_tacho": "2.00",
    },
    {
        "comisionista": "JAIME MARTIN",
        "finca": "CALIFORNIA ADM B",
        "past_th": "3.00",
        "pastilla": "3.00",
        "salud": "3.00",
        "citrius_litro": "0.15",
        "nitrato_saco": "0.50",
        "natuxtract_tacho": "2.00",
    },
    {
        "comisionista": "JAIME MARTIN",
        "finca": "CHANDUY",
        "past_th": "1.00",
        "pastilla": "1.00",
        "salud": "1.00",
        "suelo_polvo": "1.00",
        "citrius_litro": "0.07",
        "nitrato_saco": "0.50",
    },
    {
        "comisionista": "JAIME MARTIN",
        "finca": "PAÑAMAO",
        "past_th": "1.00",
        "pastilla": "1.00",
        "salud": "1.00",
        "suelo_polvo": "1.00",
        "citrius_litro": "0.07",
        "nitrato_saco": "0.50",
    },
    {
        "comisionista": "JAIME MARTIN",
        "finca": "AFRICA ADMINISTRACION",
        "past_th": "2.00",
        "pastilla": "1.00",
        "agua": "2.00",
        "suelo_polvo": "2.00",
        "citrius_litro": "0.15",
        "nitrato_saco": "1.00",
    },
    {
        "comisionista": "JAIME MARTIN",
        "finca": "ASIA ADMINISTRACION",
        "past_th": "1.00",
    },
    {
        "comisionista": "JAIME MARTIN",
        "finca": "BAJEN ADM A",
        "past_th": "2.00",
        "salud": "2.00",
    },
    {
        "comisionista": "JAIME MARTIN",
        "finca": "CORVINERO ADM A",
        "past_th": "2.00",
    },
    {
        "comisionista": "JAIME MARTIN",
        "finca": "CORVINERO ADM B",
        "past_th": "2.00",
    },
    {
        "comisionista": "JAIME MARTIN",
        "finca": "DAULAR ADMINISTRACION",
        "past_th": "1.00",
    },
    # --- RUGEL ANGEL (PDF page 1) ---
    {
        "comisionista": "RUGEL ANGEL",
        "finca": "PAÑAMAO",
        "past_th": "1.00",
        "pastilla": "1.00",
        "salud": "1.00",
        "agua": "1.00",
    },
    {
        "comisionista": "RUGEL ANGEL",
        "finca": "DAULAR - ADMINISTRACION",
        "past_th": "1.00",
        "pastilla": "1.00",
        "salud": "1.00",
        "agua": "1.00",
    },
    {
        "comisionista": "RUGEL ANGEL",
        "finca": "DAULAR - CURAZAO",
        "past_th": "1.00",
        "pastilla": "1.00",
        "salud": "1.00",
        "agua": "1.00",
    },
]

OTROS_CLIENTES_TARIFAS = [
    {
        "comisionista": "TOALA FRANCISCO",
        "cliente": "EXPALSA",
        "pastilla": "1.00",
        "salud": "1.00",
        "agua": "1.00",
    },
    {
        "comisionista": "GUALPA EDWARD",
        "cliente": "FRIGOLANDIA",
        "pastilla": "2.00",
        "salud": "2.00",
        "agua": "2.00",
    },
    {
        "comisionista": "ASOCIACION INTEDECAM",
        "cliente": "CAMPONIO",
        "pastilla": "9.00",
        "salud": "9.00",
        "agua": "9.00",
        "suelo_polvo": "9.00",
    },
    {
        "comisionista": "ASOCIACION INTEDECAM",
        "cliente": "INTEDECAM",
        "pastilla": "9.00",
        "salud": "9.00",
        "agua": "9.00",
        "suelo_polvo": "9.00",
    },
    {
        "comisionista": "ASOCIACION INTEDECAM",
        "cliente": "INTEDECAM ISLA PALO SANTO",
        "pastilla": "9.00",
        "salud": "9.00",
        "agua": "9.00",
        "suelo_polvo": "9.00",
    },
    {
        "comisionista": "ASOCIACION INTEDECAM",
        "cliente": "GOLDENSHRIMP",
        "pastilla": "9.00",
        "salud": "9.00",
        "agua": "9.00",
        "suelo_polvo": "9.00",
    },
    {
        "comisionista": "ASOCIACION INTEDECAM",
        "cliente": "AQUALITORAL",
        "pastilla": "9.00",
        "salud": "9.00",
        "agua": "9.00",
        "suelo_polvo": "9.00",
    },
    {
        "comisionista": "ASOCIACION INTEDECAM",
        "cliente": "PINGUIMAR",
        "pastilla": "9.00",
        "salud": "9.00",
        "agua": "9.00",
        "suelo_polvo": "9.00",
    },
    {
        "comisionista": "ASOCIACION INTEDECAM",
        "cliente": "CAMPROEX",
        "pastilla": "9.00",
        "salud": "9.00",
        "agua": "9.00",
        "suelo_polvo": "9.00",
    },
    {
        "comisionista": "CONTRERAS FRANKLIN",
        "cliente": "PROMARISCO",
        "mortal_shell_litro": "3.00",
    },
]


def _buscar_por_nombre(db: Session, modelo: type[Any], nombre: str):
    return db.query(modelo).filter(func.upper(modelo.nombre) == nombre.upper()).first()


def _obtener_o_crear_cliente(db: Session, nombre: str, resumen: dict[str, int]) -> Cliente:
    cliente = _buscar_por_nombre(db, Cliente, nombre)
    if cliente:
        return cliente

    cliente = Cliente(
        nombre=nombre,
        tipo="individual",
        retencion_porcentaje=Decimal("1.75"),
        activo=True,
    )
    db.add(cliente)
    db.flush()
    resumen["clientes_creados"] += 1
    return cliente


def _obtener_o_crear_comisionista(db: Session, nombre: str, resumen: dict[str, int]) -> Comisionista:
    comisionista = _buscar_por_nombre(db, Comisionista, nombre)
    if comisionista:
        return comisionista

    comisionista = Comisionista(nombre=nombre)
    db.add(comisionista)
    db.flush()
    resumen["comisionistas_creados"] += 1
    return comisionista


def _obtener_o_crear_producto(
    db: Session,
    nombre: str,
    resumen: dict[str, int],
    unidad_comision: str = "kg",
    tacho_kilos: Decimal | None = None,
    peso_por_unidad: Decimal | None = None,
) -> Producto:
    producto = _buscar_por_nombre(db, Producto, nombre)
    if producto:
        producto.unidad_comision = unidad_comision
        if tacho_kilos is not None:
            producto.tacho_kilos = tacho_kilos
        if peso_por_unidad is not None:
            producto.peso_por_unidad = peso_por_unidad
        return producto

    producto = Producto(
        nombre=nombre,
        unidad_comision=unidad_comision,
        tacho_kilos=tacho_kilos,
        peso_por_unidad=peso_por_unidad,
        activo=True,
    )
    db.add(producto)
    db.flush()
    resumen["productos_creados"] += 1
    return producto


def _crear_alias(db: Session, alias: str, producto: Producto, resumen: dict[str, int]) -> None:
    alias_existente = (
        db.query(ProductoAlias)
        .filter(func.upper(ProductoAlias.alias) == alias.upper())
        .first()
    )
    if alias_existente:
        if alias_existente.producto_id != producto.id:
            alias_existente.producto_id = producto.id
            resumen["aliases_actualizados"] += 1
        return

    db.add(ProductoAlias(producto_id=producto.id, alias=alias))
    resumen["aliases_creados"] += 1


def seed_aliases_productos(db: Session, resumen: dict[str, int] | None = None) -> dict[str, int]:
    if resumen is None:
        resumen = {
            "aliases_creados": 0,
            "aliases_actualizados": 0,
        }

    productos = {producto.nombre: producto for producto in db.query(Producto).all()}
    for alias, producto_nombre in ALIASES_PRODUCTO.items():
        producto = productos.get(producto_nombre)
        if producto is None:
            continue
        _crear_alias(db, alias, producto, resumen)

    return resumen


def _buscar_finca(db: Session, cliente: Cliente, nombre_pdf: str) -> Finca:
    nombre_normalizado = normalizar_nombre_finca(nombre_pdf)
    for finca in cliente.fincas:
        if normalizar_nombre_finca(finca.nombre) == nombre_normalizado:
            return finca
    raise RuntimeError(f"Finca no encontrada para Santa Priscila: {nombre_pdf}")


def _buscar_tarifa(
    db: Session,
    comisionista_id,
    cliente_id,
    producto_id,
    finca_id,
) -> TarifaClienteProducto | None:
    query = db.query(TarifaClienteProducto).filter(
        TarifaClienteProducto.comisionista_id == comisionista_id,
        TarifaClienteProducto.cliente_id == cliente_id,
        TarifaClienteProducto.producto_id == producto_id,
        TarifaClienteProducto.proveedor == "",
    )
    if finca_id is None:
        query = query.filter(TarifaClienteProducto.finca_id.is_(None))
    else:
        query = query.filter(TarifaClienteProducto.finca_id == finca_id)
    return query.first()


def _upsert_tarifa(
    db: Session,
    comisionista: Comisionista,
    cliente: Cliente,
    producto: Producto,
    finca: Finca | None,
    tipo: TipoTarifa,
    valor: Decimal,
    resumen: dict[str, int],
) -> None:
    tarifa = _buscar_tarifa(
        db,
        comisionista.id,
        cliente.id,
        producto.id,
        finca.id if finca else None,
    )
    if tarifa:
        tarifa.tipo = tipo
        tarifa.valor = valor
        tarifa.proveedores_excluidos = []
        tarifa.activo = True
        resumen["tarifas_actualizadas"] += 1
        return

    db.add(
        TarifaClienteProducto(
            comisionista_id=comisionista.id,
            cliente_id=cliente.id,
            producto_id=producto.id,
            finca_id=finca.id if finca else None,
            proveedor="",
            proveedores_excluidos=[],
            tipo=tipo,
            valor=valor,
            activo=True,
        )
    )
    resumen["tarifas_creadas"] += 1


def _procesar_fila(
    db: Session,
    fila: dict[str, str],
    cliente: Cliente,
    finca: Finca | None,
    columnas: list[tuple[str, str, TipoTarifa]],
    productos: dict[str, Producto],
    resumen: dict[str, int],
) -> None:
    comisionista = _obtener_o_crear_comisionista(db, fila["comisionista"], resumen)
    tarifas_por_clave: dict[tuple[Any, Any, Any, Any], tuple[TipoTarifa, Decimal]] = {}

    for campo, producto_nombre, tipo in columnas:
        valor_texto = fila.get(campo)
        if not valor_texto:
            continue

        producto = productos[producto_nombre]
        valor = Decimal(valor_texto)
        clave = (
            comisionista.id,
            cliente.id,
            producto.id,
            finca.id if finca else None,
        )
        if clave in tarifas_por_clave:
            _, valor_anterior = tarifas_por_clave[clave]
            if valor_anterior != valor:
                resumen["conflictos_consolidados"] += 1
            continue

        tarifas_por_clave[clave] = (tipo, valor)
        _upsert_tarifa(db, comisionista, cliente, producto, finca, tipo, valor, resumen)


def seed_tarifas_externas(db: Session) -> dict[str, int]:
    resumen = {
        "clientes_creados": 0,
        "productos_creados": 0,
        "comisionistas_creados": 0,
        "aliases_creados": 0,
        "aliases_actualizados": 0,
        "tarifas_creadas": 0,
        "tarifas_actualizadas": 0,
        "conflictos_consolidados": 0,
    }

    for nombre_cliente in CLIENTES_FALTANTES:
        _obtener_o_crear_cliente(db, nombre_cliente, resumen)

    for nombre_producto, data in PRODUCTOS_REQUERIDOS.items():
        _obtener_o_crear_producto(
            db,
            nombre_producto,
            resumen,
            unidad_comision=data["unidad_comision"],
            tacho_kilos=data.get("tacho_kilos"),
            peso_por_unidad=data.get("peso_por_unidad"),
        )

    productos = {producto.nombre: producto for producto in db.query(Producto).all()}
    for _, producto_nombre, _ in COLUMNAS_SANTA_PRISCILA + COLUMNAS_OTROS_CLIENTES:
        if producto_nombre not in productos:
            productos[producto_nombre] = _obtener_o_crear_producto(
                db,
                producto_nombre,
                resumen,
                unidad_comision=PRODUCTO_UNIDAD.get(producto_nombre, "kg"),
            )

    seed_aliases_productos(db, resumen)

    santa_priscila = _buscar_por_nombre(db, Cliente, "Santa Priscila")
    if not santa_priscila:
        raise RuntimeError("Cliente requerido no encontrado: Santa Priscila")

    for fila in SANTA_PRISCILA_TARIFAS:
        finca = _buscar_finca(db, santa_priscila, fila["finca"])
        _procesar_fila(
            db,
            fila,
            santa_priscila,
            finca,
            COLUMNAS_SANTA_PRISCILA,
            productos,
            resumen,
        )

    for fila in OTROS_CLIENTES_TARIFAS:
        cliente = _obtener_o_crear_cliente(db, fila["cliente"], resumen)
        _procesar_fila(
            db,
            fila,
            cliente,
            None,
            COLUMNAS_OTROS_CLIENTES,
            productos,
            resumen,
        )

    db.commit()
    return resumen


def main() -> None:
    db = SessionLocal()
    try:
        resumen = seed_tarifas_externas(db)
        print("Tarifas externas cargadas correctamente.")
        for clave, valor in resumen.items():
            print(f"{clave}: {valor}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
