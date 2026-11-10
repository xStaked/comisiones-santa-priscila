from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, LargeBinary, String, Uuid
from app.models.base import BaseModel


class OrdenExtraccion(BaseModel):
    """Entrada reproducible del parser para una orden ya confirmada.

    No guarda el PDF (~350 KB) sino sus palabras con coordenadas + texto,
    comprimidas con zlib (~5-10 KB). Alcanza para reejecutar la extracción
    posicional después de un cambio de parser.
    """

    __tablename__ = "orden_extracciones"

    orden_id = Column(
        Uuid,
        ForeignKey("ordenes.id", ondelete="CASCADE"),
        nullable=True,
        unique=True,
    )
    numero_orden = Column(String, nullable=False, index=True)
    fecha_orden = Column(Date, nullable=False)
    parser_version = Column(Integer, nullable=False)
    entrada = Column(LargeBinary, nullable=False)
    sha256 = Column(String(64), nullable=False)
    creado_en = Column(DateTime(timezone=True), nullable=False)
