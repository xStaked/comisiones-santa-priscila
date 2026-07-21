from sqlalchemy import Column, Date, Numeric

from app.models.base import BaseModel


class Retencion(BaseModel):
    """Retención legal aplicable a las facturas, por periodo de vigencia.

    Cada periodo termina donde empieza el siguiente: por eso no hay
    `vigente_hasta`. Con una sola fecha por fila es imposible registrar huecos
    o solapes entre periodos.

    La retención de una factura es la del periodo con el mayor `vigente_desde`
    menor o igual a la fecha de EMISIÓN de la factura.
    """

    __tablename__ = "retenciones"

    vigente_desde = Column(Date, nullable=False, unique=True)
    porcentaje = Column(Numeric(5, 2), nullable=False)
