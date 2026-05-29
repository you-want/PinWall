from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    user_id: Optional[str] = None


class NoteCreate(BaseModel):
    content: str
    color: Optional[str] = "#FFF9C4"


class NoteUpdate(BaseModel):
    content: Optional[str] = None
    is_checked: Optional[bool] = None
    color: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    angle: Optional[float] = None


class NoteResponse(BaseModel):
    id: str
    user_id: str
    content: str
    is_checked: bool
    color: str
    position_x: float
    position_y: float
    angle: float
    share_token: Optional[str] = None
    is_public: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True