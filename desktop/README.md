# PinWall Desktop

> macOS 桌面上的透明便签墙与轻量工作台。

PinWall Desktop 是当前产品主线。它基于 Tauri v2 构建，目标是把便签、提醒和轻量信息卡片直接放在桌面壁纸上，同时尽量不打扰正常桌面操作。

Web 端目前仅作为历史 demo 和辅助入口，不作为当前产品主线。

## 开发

```bash
# 安装依赖
pnpm install

# 运行单元测试
pnpm test:run

# 生产构建检查
pnpm build

# 启动开发模式
pnpm tauri dev

# 构建发布版
pnpm tauri build

# 仅验证 macOS .app 打包
pnpm tauri:build:app
```

发布前检查见 [RELEASE_QA.md](./RELEASE_QA.md)。

## 发布

当前桌面端通过 GitHub Actions 自动打包并发布到 GitHub Releases。

```bash
# 发布 0.1.1
git tag v0.1.1
git push origin v0.1.1
```

发布流程见 [RELEASE_PROCESS.md](./RELEASE_PROCESS.md)，发布说明保存在 [releases/v0.1.1.md](./releases/v0.1.1.md)。

## 技术栈

- **前端**: React 19 + TypeScript + Vite
- **状态管理**: Zustand + tauri-store
- **桌面框架**: Tauri v2 (Rust)
- **本地存储**: tauri-plugin-fs

## 产品主线

当前阶段优先级：

1. 稳定透明桌面便签、拖拽、提醒、收纳和本地持久化。
2. 打磨 macOS 桌面体验：点击穿透、托盘、快捷键、重启恢复。
3. 将健康提醒、背景、自定义外观作为增强能力。
4. Widget、Marketplace、开发者门户先作为实验方向，不抢占 0.1 主线。

详细规划见 [DESKTOP_ROADMAP.md](./DESKTOP_ROADMAP.md)。

## 项目结构

```
desktop/
├── src/                  # React 前端
│   ├── components/       #   UI 组件（PinCard, PinBoard, CardStack...）
│   ├── pages/            #   页面（Wall, Settings, Notification）
│   ├── hooks/            #   自定义 Hooks（useCards, useReminders）
│   ├── stores/           #   Zustand Store（跨窗口共享）
│   ├── services/         #   本地存储服务
│   └── types/            #   TypeScript 类型
├── src-tauri/            # Rust 原生层
│   ├── src/              #   Rust 源码（窗口管理、穿透、托盘）
│   ├── capabilities/     #   Tauri 权限声明
│   └── tauri.conf.json   #   Tauri 配置
└── package.json
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `⌘⇧N` | 新建便签 |
| `Esc` | 关闭弹窗 |
