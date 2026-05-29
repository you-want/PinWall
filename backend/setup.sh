#!/bin/bash

# PinWall Backend Setup Script

echo "=== PinWall Backend Setup ==="

# 检查是否安装了 Python
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required but not installed."
    exit 1
fi

# 检查是否安装了 pip
if ! command -v pip3 &> /dev/null; then
    echo "Error: pip3 is required but not installed."
    exit 1
fi

# 创建虚拟环境（可选）
echo "Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

# 安装依赖
echo "Installing dependencies..."
pip install -r requirements.txt

# 初始化数据库
echo "Initializing database..."
python init_db.py

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To start the server:"
echo "  source venv/bin/activate"
echo "  uvicorn main:app --reload"
echo ""
echo "API Documentation: http://localhost:8000/docs"