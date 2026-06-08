[English](./README.md) | **中文**

# PinWall

> 把便签钉在桌面上的透明便签墙应用。

PinWall 是一款直接铺在 macOS 桌面上的便签墙应用。透明窗口、自由拖拽、智能提醒——让每一条备忘都有存在感。

## 桌面端（核心产品）

基于 [Tauri v2](https://tauri.app/) 构建的 macOS 原生桌面应用。

### 核心能力

- **透明桌面窗口** — 窗口完全透明，便签直接浮在桌面壁纸上
- **点击穿透** — 空白区域点击自动退到底层，不影响正常桌面操作
- **自由拖拽定位** — 每张便签可拖拽到屏幕任意位置，点击自动置顶
- **智能提醒通知** — 设置提醒时间，到时弹出独立通知窗口 + 提示音
- **卡片堆叠收纳** — 暂时不用的便签收纳到堆叠区，一键展开钉回桌面
- **8 种渐变配色** — 创建时选择或随机分配渐变色
- **macOS 窗口控件** — 红黄绿按钮控制关闭 / 最小化 / 全屏
- **自定义背景** — 上传背景图，支持自动轮播切换
- **透明度调节** — 滑块调节窗口透明度
- **快捷键** — `⌘⇧N` 快速创建便签，`Esc` 关闭
- **本地持久化** — 所有数据保存在本地磁盘，隐私安全
- **托盘图标** — 系统托盘常驻，随时唤出

### 技术栈

| 层 | 技术 |
|---|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite |
| 状态管理 | Zustand + [tauri-store](https://github.com/you-want/tauri-store) |
| 桌面框架 | Tauri v2 (Rust) |
| 跨窗口通信 | Zustand 共享 Store |
| 本地存储 | tauri-plugin-fs（磁盘 JSON） |

### 快速开始

**前置要求**

- macOS 13+
- Node.js 18+
- pnpm
- Rust（通过 [rustup](https://rustup.rs/) 安装）

**安装与运行**

```bash
# 1. 进入桌面端目录
cd desktop

# 2. 安装依赖
pnpm install

# 3. 启动开发模式（前端 + Rust 窗口）
pnpm tauri dev
```

开发模式下会打开一个透明窗口覆盖在桌面上，支持热更新。

**构建发布版**

```bash
cd desktop
pnpm tauri build
```

构建产物（`.dmg` / `.app`）在 `desktop/src-tauri/target/release/bundle/` 下。

## 其他模块

### Web 端（`/frontend`）

地址：https://pinwall.raingpt.top

PinWall 的 Web 版本，提供在线便签墙体验。

- React 18 + Vite + TailwindCSS + Zustand
- 瀑布流布局、拖拽排序、快捷键搜索（`⌘K`）
- 便签分享链接、Markdown / JSON 导出

```bash
cd frontend
pnpm install
pnpm dev          # http://localhost:5173
```

### 后端（`/backend`）

为 Web 端提供 API 服务。

- Flask + SQLAlchemy + JWT
- SQLite（开发）/ PostgreSQL（生产）

```bash
cd backend
pip install -r requirements.txt
python3 main.py   # http://localhost:8000
```

### 官网（`/website`）

产品介绍官网，支持中英文国际化。

- React 19 + Vite + TypeScript
- 部署在 Vercel

```bash
cd website
pnpm install
pnpm dev          # http://localhost:9123
```

## 项目结构

```
PinWall/
├── desktop/          # 🖥️ 桌面端（Tauri v2，核心产品）
│   ├── src/          #   React 前端
│   ├── src-tauri/    #   Rust 原生层
│   └── package.json
├── frontend/         # 🌐 Web 端
│   ├── src/
│   └── package.json
├── backend/          # ⚙️ 后端 API（Flask）
│   ├── app/
│   └── main.py
├── website/          # 📄 产品官网
│   ├── src/
│   └── package.json
└── flutter-template/ # 📱 Flutter 模板（实验性）
```

## 下载

- **macOS**: [GitHub Releases](https://github.com/you-want/PinWall/releases)
- **Web 版**: 访问在线地址（见部署配置）

## 部署

完整部署流程见 [DEPLOY.md](./DEPLOY.md)。

- **桌面端**: GitHub Actions 自动构建 → Releases
- **Web 端**: Vercel 自动部署
- **后端**: Render / 自建服务器 + Gunicorn
- **官网**: Vercel

## License

MIT License — 详见 [LICENSE](./LICENSE)。
