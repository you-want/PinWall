# PinWall Backend

使用 Python + FastAPI 构建的便签墙后端服务。

## 技术栈

- **框架**: FastAPI 0.104+
- **数据库**: PostgreSQL / SQLite
- **认证**: JWT
- **ORM**: SQLAlchemy

## 快速开始

### 1. 安装依赖

```bash
# 使用虚拟环境（推荐）
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 2. 配置环境变量

编辑 `.env` 文件：

```env
# 数据库配置
DATABASE_URL=postgresql://postgres:password@localhost:5432/pinwall

# JWT 配置（请更换为安全的密钥）
SECRET_KEY=your-secret-key-here-make-it-very-long-and-secure
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

**使用 SQLite（开发环境）**:
```env
DATABASE_URL=sqlite:///./pinwall.db
```

### 3. 初始化数据库

```bash
python init_db.py
```

### 4. 启动服务

```bash
uvicorn main:app --reload
```

服务将在 `http://localhost:8000` 运行。

## API 文档

启动服务后访问：
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## API 端点

### 认证

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/auth/register` | 用户注册 |
| POST | `/auth/login` | 用户登录 |

### 便签

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/notes/` | 获取当前用户的所有便签 |
| POST | `/notes/` | 创建新便签 |
| GET | `/notes/{note_id}` | 获取单个便签 |
| PUT | `/notes/{note_id}` | 更新便签 |
| DELETE | `/notes/{note_id}` | 删除便签 |
| POST | `/notes/{note_id}/share` | 切换分享状态 |
| GET | `/notes/share/{share_token}` | 获取公开便签 |

## 项目结构

```
backend/
├── main.py              # 入口文件
├── requirements.txt     # 依赖列表
├── .env                 # 环境变量
├── init_db.py           # 数据库初始化脚本
├── setup.sh             # 一键安装脚本
└── app/
    ├── __init__.py
    ├── database.py      # 数据库连接配置
    ├── models.py        # SQLAlchemy 模型
    ├── schemas.py       # Pydantic 模型
    ├── routes/
    │   ├── auth.py      # 认证路由
    │   └── notes.py     # 便签路由
    ├── dependencies.py  # 依赖注入（认证）
    └── utils/
        └── auth.py      # 认证工具函数
```

## 部署

### 使用 Gunicorn（生产环境）

```bash
pip install gunicorn
gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app
```

### Docker 部署（可选）

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```