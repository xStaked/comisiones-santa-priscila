from datetime import date
from decimal import Decimal

from app.models.cliente import Cliente, Finca
from app.models.comisionista import Comisionista, TipoTarifa
from app.models.orden import Asignacion, OrdenItem
from app.models.producto import Producto
from app.models.tarifa_cliente_producto import TarifaClienteProducto


def test_solo_asigna_comisionista_en_su_sector(authenticated_client, db_session):
    """Un comisionista con tarifa solo en AFRICA no debe quedar asignado a un
    ítem de TAURA A, aunque se le pase en comisionista_ids (bug del cartesiano)."""
    cliente = Cliente(nombre="Santa Priscila", tipo="grupo")
    africa = Finca(nombre="AFRICA", cliente=cliente)
    taura = Finca(nombre="TAURA A", cliente=cliente)
    com = Comisionista(nombre="ALBURQUERQUE EDGAR")
    prod = Producto(nombre="ECU-BACILLUS SUELO", unidad_comision="tacho", tacho_kilos=Decimal("10"))
    db_session.add_all([cliente, africa, taura, com, prod])
    db_session.commit()
    # tarifa SOLO en AFRICA
    db_session.add(TarifaClienteProducto(
        comisionista_id=com.id, cliente_id=cliente.id, producto_id=prod.id,
        finca_id=africa.id, tipo=TipoTarifa.fijo_kg, valor=Decimal("1.0"),
    ))
    db_session.commit()

    payload = [
        {"fecha": str(date.today()), "numero_orden": "ORD-SEC-1", "finca": "AFRICA",
         "producto": "ECU-BACILLUS SUELO", "cantidad": "10.00", "unidad": "tachos",
         "precio_unitario": "1.00", "total": "100.00", "sector": "AFRICA",
         "cliente_id": str(cliente.id), "producto_id": str(prod.id), "finca_id": str(africa.id),
         "comisionista_ids": [str(com.id)]},
        {"fecha": str(date.today()), "numero_orden": "ORD-SEC-1", "finca": "TAURA A",
         "producto": "ECU-BACILLUS SUELO", "cantidad": "10.00", "unidad": "tachos",
         "precio_unitario": "1.00", "total": "100.00", "sector": "TAURA A",
         "cliente_id": str(cliente.id), "producto_id": str(prod.id), "finca_id": str(taura.id),
         "comisionista_ids": [str(com.id)]},
    ]
    resp = authenticated_client.post("/api/v1/ordenes/", json=payload)
    assert resp.status_code == 201, resp.text

    items = {oi.finca: oi for oi in db_session.query(OrdenItem).all()}
    asignados = lambda oi: db_session.query(Asignacion).filter(
        Asignacion.orden_item_id == oi.id).count()

    assert asignados(items["AFRICA"]) == 1   # cobra en su sector
    assert asignados(items["TAURA A"]) == 0  # NO se asigna donde no tiene tarifa
