# 📌 PinWall

一个美观、轻量、私密的打卡便签墙 Web 应用。

## 🎯 功能特性

### 用户认证
- ✅ 用户注册（邮箱 + 密码）
- ✅ 用户登录（邮箱 + 密码）
- ✅ JWT 认证

### 便签墙
- ✅ 瀑布流布局展示便签
- ✅ 双击空白处创建新便签
- ✅ 便签颜色选择器
- ✅ 便签尺寸自适应（最大宽高限制）
- ✅ 便签标题显示创建时间

### 便签操作
- ✅ 创建、编辑、删除便签
- ✅ 打卡功能（标记完成状态）
- ✅ 拖拽调整便签位置
- ✅ 随机位置模式 / 整齐排列模式

### 搜索与分享
- ✅ 快捷键搜索（Ctrl/Cmd + K）
- ✅ 模糊匹配内容和标题
- ✅ 便签公开分享链接
- ✅ 导出便签到 Markdown / JSON

### 其他功能
- ✅ 右键菜单
- ✅ 每日打卡提醒（浏览器 Notification）

## 🛠️ 技术栈

### 前端
- **React 18** + **TypeScript**
- **Vite** 构建工具
- **TailwindCSS** 样式框架
- **Zustand** 状态管理
- **React Router v6** 路由
- **Axios** HTTP 客户端

### 后端
- **Flask** Web 框架
- **Flask-SQLAlchemy** ORM
- **Flask-JWT-Extended** JWT 认证
- **SQLite** 数据库（开发环境）
- **PostgreSQL** 数据库（生产环境）

## 🚀 快速开始

### 前置要求
- Python 3.10+
- Node.js 18+
- pnpm

### 1. 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 安装前端依赖

```bash
cd frontend
pnpm install
```

### 3. 启动后端服务

```bash
cd backend
python3 main.py
```

后端服务将在 `http://localhost:8000` 运行。

### 4. 启动前端开发服务器

```bash
cd frontend
pnpm run dev
```

前端将在 `http://localhost:5173` 运行。

## 📁 项目结构

```
PinWall/
├── backend/                    # 后端代码
│   ├── main.py                # Flask 应用入口
│   ├── requirements.txt       # Python 依赖
│   ├── .env                   # 环境变量
│   └── pinwall.db             # SQLite 数据库（运行后自动创建）
├── frontend/                  # 前端代码
│   ├── src/
│   │   ├── components/        # React 组件
│   │   ├── routes/            # 页面路由
│   │   ├── stores/            # Zustand 状态管理
│   │   ├── services/          # API 服务
│   │   ├── types/             # TypeScript 类型定义
│   │   ├── utils/             # 工具函数
│   │   └── index.css          # 全局样式
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── demo.html                  # 样式参考
└── TODO.md                    # 开发进度
```

## 🔌 API 端点

### 认证
| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/auth/register` | 用户注册 |
| POST | `/auth/login` | 用户登录 |

### 便签
| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/notes` | 获取当前用户的所有便签 |
| POST | `/notes` | 创建新便签 |
| GET | `/notes/:id` | 获取单个便签 |
| PUT | `/notes/:id` | 更新便签 |
| DELETE | `/notes/:id` | 删除便签 |
| POST | `/notes/:id/share` | 切换分享状态 |
| GET | `/notes/share/:token` | 获取公开便签 |

## 🌐 部署

完整部署流程（Render 后端 + Vercel 前端）见 [DEPLOY.md](./DEPLOY.md)。

### 前端部署
```bash
cd frontend
pnpm run build
# 部署 dist 目录到 Vercel/Netlify
```

### 后端部署
```bash
# 使用 Gunicorn
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:8000 main:app
```

## 📝 License

本项目基于 MIT License 开源，详见 [LICENSE](./LICENSE)。
