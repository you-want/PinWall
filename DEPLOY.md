# 部署指南（Render + Vercel）

本文档提供一套可复用的部署流程：后端部署到 Render（含 Render Postgres），前端部署到 Vercel。文档中的域名、账号、密码、连接串均为示例，请按你的实际服务替换。

## 部署前准备

### 1) 确保不提交敏感信息

- 不要把 `.env`、数据库文件、密钥提交到 Git 仓库。
- 推荐只在部署平台配置环境变量（Render / Vercel 的 Environment Variables）。

### 2) 确认后端依赖

后端生产环境推荐使用：

- `gunicorn`：作为 WSGI 服务器
- `psycopg[binary]`：连接 PostgreSQL（psycopg v3）

项目当前后端依赖定义在：`backend/requirements.txt`。

### 3) 固定 Python 版本（Render）

Render 默认 Python 版本会随时间变更。推荐固定一个稳定版本（例如 3.13）：

- 仓库根目录：`.python-version`
- 后端目录（如果 Render Root Directory 指向 backend）：`backend/.python-version`

两处都写 `3.13` 可降低误配概率。

## 后端部署（Render）

### 1) 创建 Postgres 数据库（Render）

1. Render Dashboard → New → PostgreSQL
2. 关键选项：
   - Region：必须和你的后端 Web Service 同区域（否则内网不可达）
   - Database：例如 `pinwall`
   - User：例如 `pinwall`
3. 创建完成后进入数据库详情页，复制连接串：
   - 优先使用 Internal Database URL（推荐，内网连接更稳定）

连接串示例（脱敏）：

```
postgresql://pinwall:***@dpg-xxxxxx-a.singapore-postgres.render.com:5432/pinwall
```

如果你拿到的是 `postgres://...`，也可以直接用（项目代码会兼容处理），但推荐改成 `postgresql://...`。

### 2) 创建 Web Service（Render）

1. Render Dashboard → New → Web Service → 选择你的 GitHub 仓库
2. Root Directory：
   - 如果后端代码在 `backend/`：Root Directory 填 `backend`
3. Build & Start：
   - Build Command：
     ```
     pip install -r requirements.txt
     ```
   - Start Command：
     ```
     gunicorn -w 2 -b 0.0.0.0:$PORT main:app
     ```

### 3) 配置环境变量（Render）

Render Dashboard → 你的后端服务 → Environment：

- `DATABASE_URL`：填 Postgres 连接串（不要使用 localhost）
- `SECRET_KEY`：强随机字符串（至少 32 位）
- `ACCESS_TOKEN_EXPIRE_MINUTES`：可选，默认 `10080`

注意：

- 不要把 `DATABASE_URL=...localhost...` 这种本地配置搬到线上，否则会出现 `Connection refused`。

### 4) 部署与验证

1. 部署后打开后端域名：
   - `https://<你的-render-服务域名>/`
2. 期望返回 JSON（Welcome 信息）。

### 5) 常见问题排查（Render）

- `ImportError ... psycopg2 ... undefined symbol ...`
  - 通常是 `psycopg2-binary` 与 Python 版本不兼容，建议改用 `psycopg[binary]`。
- `connection to server at "127.0.0.1", port 5432 failed`
  - 你把 `DATABASE_URL` 配成了 `localhost`，改用 Render Postgres 的连接串。
- 改了依赖/版本仍不生效
  - Manual Deploy → Clear build cache & deploy（清缓存后重建）。

## 前端部署（Vercel）

### 1) 创建 Vercel 项目

1. Vercel → New Project → 导入你的 GitHub 仓库
2. Root Directory：
   - 前端在 `frontend/`：Root Directory 选 `frontend`
3. 构建设置（Vite）：
   - Install Command：`pnpm install`（默认即可）
   - Build Command：`pnpm run build`
   - Output Directory：`dist`

### 2) 配置环境变量（Vercel）

Vercel Project → Settings → Environment Variables：

- `VITE_API_URL`：后端 Render 的公网地址，例如：
  ```
  https://<你的-render-服务域名>
  ```

保存后触发一次重新部署（Redeploy）。

### 3) 验证

1. 打开 Vercel 前端域名
2. 注册/登录后创建便签，确认能正常读写数据

### 4) 常见问题排查（Vercel）

- 页面请求后端失败 / 控制台 Mixed Content
  - 前端是 https，但 `VITE_API_URL` 配成 http；需要改为 https。
- 401 后跳转登录
  - 检查后端是否正常运行、`SECRET_KEY` 是否设置、前端 `VITE_API_URL` 是否指向正确后端。

## 推荐的生产配置清单（脱敏示例）

### Render（后端）

- `DATABASE_URL=postgresql://pinwall:***@dpg-xxxxxx.render.com:5432/pinwall`
- `SECRET_KEY=***`
- `ACCESS_TOKEN_EXPIRE_MINUTES=10080`

### Vercel（前端）

- `VITE_API_URL=https://<你的-render-服务域名>`
