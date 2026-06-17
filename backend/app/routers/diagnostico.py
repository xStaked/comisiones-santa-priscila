from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.services.catalog_normalization import normalizar_nombre_producto
from app.services.order_extraction_normalizer import _buscar_producto, _buscar_finca, _buscar_cliente, _buscar_comisionistas_aplicables
from app.models.cliente import Cliente, Finca
from app.models.producto import Producto, ProductoAlias
from app.models.tarifa_cliente_producto import TarifaClienteProducto
from app.models.comisionista import Comisionista

router = APIRouter()


@router.get("/diagnostico/matching")
def diagnosticar_matching(
    producto: str = Query(..., description="Nombre del producto extraído"),
    finca: str = Query("", description="Nombre de la finca"),
    cliente: str = Query("", description="Nombre del cliente"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resultados = {}

    # 1. Normalización
    normalizado = normalizar_nombre_producto(producto)
    resultados["normalizacion"] = {
        "entrada": producto,
        "normalizado": normalizado,
    }

    # 2. Búsqueda de producto
    producto_bd = _buscar_producto(db, producto)
    if producto_bd:
        resultados["producto"] = {"id": str(producto_bd.id), "nombre": producto_bd.nombre}
    else:
        resultados["producto"] = None

    # Aliases relevantes
    alias_info = []
    for a in db.query(ProductoAlias).all():
        alias_info.append({"alias": a.alias, "apunta_a": a.producto.nombre})
    resultados["aliases"] = alias_info

    # 3. Búsqueda de cliente
    cliente_bd = _buscar_cliente(db, cliente) if cliente else None
    if not cliente_bd:
        # Buscar por finca
        finca_bd = _buscar_finca(db, finca, None) if finca else None
        if finca_bd:
            cliente_bd = finca_bd.cliente
            resultados["cliente_desde_finca"] = {"nombre": cliente_bd.nombre, "id": str(cliente_bd.id), "finca": finca_bd.nombre}
        else:
            resultados["cliente"] = None
    else:
        resultados["cliente"] = {"nombre": cliente_bd.nombre, "id": str(cliente_bd.id)}

    # 4. Búsqueda de finca
    if cliente_bd and finca:
        finca_bd = _buscar_finca(db, finca, cliente_bd)
    elif finca:
        finca_bd = _buscar_finca(db, finca, None)
    else:
        finca_bd = None

    if finca_bd:
        resultados["finca"] = {"id": str(finca_bd.id), "nombre": finca_bd.nombre, "cliente_id": str(finca_bd.cliente_id)}
    else:
        resultados["finca"] = None

    # 5. Tarifas existentes
    if cliente_bd and producto_bd:
        query_tarifas = db.query(TarifaClienteProducto).filter(
            TarifaClienteProducto.cliente_id == cliente_bd.id,
            TarifaClienteProducto.producto_id == producto_bd.id,
            TarifaClienteProducto.activo.is_(True),
        )

        if cliente_bd.fincas:
            if finca_bd:
                query_tarifas = query_tarifas.filter(TarifaClienteProducto.finca_id == finca_bd.id)
            else:
                resultados["tarifas_sin_finca"] = []
        else:
            query_tarifas = query_tarifas.filter(TarifaClienteProducto.finca_id.is_(None))

        tarifas = query_tarifas.all()
        resultados["tarifas"] = [
            {
                "comisionista": t.comisionista.nombre,
                "tipo": t.tipo.value,
                "valor": str(t.valor),
                "finca_id": str(t.finca_id) if t.finca_id else None,
                "proveedor": t.proveedor,
            }
            for t in tarifas
        ]
        resultados["cantidad_tarifas"] = len(tarifas)
    else:
        resultados["tarifas"] = []

    # 6. Comisionistas aplicables
    if cliente_bd and producto_bd:
        comisionistas = _buscar_comisionistas_aplicables(db, cliente_bd, producto_bd, finca_bd, "")
        resultados["comisionistas_aplicables"] = [
            {"id": c["comisionistaId"]} for c in comisionistas
        ]
    else:
        resultados["comisionistas_aplicables"] = []

    return resultados
