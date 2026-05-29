#!/usr/bin/env python3
"""
数据库初始化脚本
运行方式: python init_db.py
"""

from app.database import engine, Base
from app.models import User, Note

print("Creating database tables...")
Base.metadata.create_all(bind=engine)
print("Database tables created successfully!")