# PinWall Desktop

> 把便签钉在桌面上的透明便签墙应用。

基于 Tauri v2 构建的 macOS 原生桌面应用。

## 开发

```bash
# 安装依赖
pnpm install

# 启动开发模式
pnpm tauri dev

# 构建发布版
pnpm tauri build
```

## 技术栈

- **前端**: React 19 + TypeScript + Vite
- **状态管理**: Zustand + tauri-store
- **桌面框架**: Tauri v2 (Rust)
- **本地存储**: tauri-plugin-fs

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
