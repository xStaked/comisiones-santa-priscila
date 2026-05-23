import uuid
from sqlalchemy import Column, DateTime, Uuid
from sqlalchemy.sql import func
from app.database import Base


class BaseModel(Base):
    __abstract__ = True
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
