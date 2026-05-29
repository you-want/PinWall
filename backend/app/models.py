from sqlalchemy import Column, String, Boolean, DateTime, Float
from datetime import datetime
from app.database import Base
import uuid


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Note(Base):
    __tablename__ = "notes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False)
    content = Column(String, nullable=False)
    is_checked = Column(Boolean, default=False)
    color = Column(String, default="#FFF9C4")
    position_x = Column(Float, default=0.0)
    position_y = Column(Float, default=0.0)
    angle = Column(Float, default=0.0)
    share_token = Column(String)
    is_public = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)