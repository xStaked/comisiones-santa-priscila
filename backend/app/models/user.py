from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.models.base import BaseModel


class User(BaseModel):
    __tablename__ = "users"
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
