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

# 浏览器 UI 回归（首次执行先安装 Chromium）
pnpm exec playwright install chromium
pnpm test:e2e

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

当前候选版本为 **0.1.4-beta.3**。GitHub Actions 仅接受 beta 标签，生成 universal DMG 和 **草稿预发布**，不会自动公开或替换 Latest。人工操作步骤见 [BETA_TESTING.md](./BETA_TESTING.md)。

```bash
# 在本轮代码已提交/推送后触发草稿构建（已有标签不要重复创建或覆盖）
git tag v0.1.4-beta.3
git push origin v0.1.4-beta.3
```

发布流程见 [RELEASE_PROCESS.md](./RELEASE_PROCESS.md)，正式发布说明保存在 [`releases/`](./releases/)。

本内测版使用手动下载安装更新，应用内 updater 暂未开放；正式签名、公证及更新签名链仍需后续验证。

项目现状审计、风险清单和后续路线图见 [PROJECT_STATUS_AND_ROADMAP.md](./PROJECT_STATUS_AND_ROADMAP.md)。

当前迭代的范围、完成记录和后续阶段见 [NEXT_ITERATION.md](./NEXT_ITERATION.md)。

## 便签编辑与布局恢复

点击便签标题栏的编辑图标，或从右键菜单选择“编辑便签”，可修改标题、正文和颜色；提醒便签还可以调整提醒时间或关闭提醒。`Cmd/Ctrl+Enter` 保存，`Esc` 取消。编辑保留便签类型和打卡记录。

应用启动时保留已保存的卡片位置；右下角“整理排列”按钮仍可主动排列。所有本地 store 加载完成后才启动页面；加载失败时显示重试提示。

浏览器 E2E 使用独立的 `1932` 端口和测试专用 Tauri IPC 适配器，真实 React/Zustand 逻辑仍会运行，持久化只写入隔离浏览器上下文的 localStorage。它验证 UI、启动和重新加载流程，不代替原生 AppData、多窗口同步、窗口穿透及真正退出重启的验收。日常运行使用 `pnpm tauri dev`。

## 设置事务与便签备份

设置通过原生 revision 事务更新，避免多窗口修改不同字段时互相覆盖。设置和卡片带有 schema version；启动时检查版本和字段，旧卡片迁移保留布局。损坏数据会保留原文件及同目录 `.corrupt-backup` 副本并停止启动，未来版本提示升级，不再静默使用默认值覆盖数据。

在“设置 → 基础 → 便签备份”导出 JSON，或选择备份后确认合并恢复。备份包含便签正文、位置和提醒信息，请妥善保存；不包含设置、API 密钥及组件。同 ID 的本地便签优先，导入提醒默认关闭，重复导入不会重复创建。恢复前会在卡片文件旁保存 `.before-restore` 快照。文件上限 20 MiB、10,000 张卡片。

便签的日常保存、迁移和恢复统一经过原生原子替换。窗口只提交改动的卡片字段；原生串行合并并广播最新状态，避免整份旧快照覆盖其他窗口更新。连续拖拽会合并尚未发送的修改。保存失败时保留最后成功保存的文件和当前窗口草稿，并显示“重试保存”；此时请保持应用打开，草稿尚未写入磁盘。

macOS 的 AI / 额度监控 API 密钥保存到系统 Keychain。旧明文密钥在首次成功读取设置时迁移：先写入并验证新的 Keychain 条目，再原子提交仅含引用的设置文件（schema version 2）。权限拒绝、钥匙串锁定或文件提交失败时保留旧数据并提示重试。便签启动预检不读取 Keychain；通知窗口只取得去除密钥的设置。其他平台暂不支持保存 API 密钥。历史副本或外部备份可能仍含旧明文密钥，不会被自动改写。

其他五个 store 仍使用 tauri-store，其版本迁移/备份和损坏文件应用内修复向导留待后续迭代。开发构建的卡片文件仍为 AppData 下 `tauri-plugin-zustand/cards.dev.json`，发布构建为 `cards.json`；卡片 schema version 保持 1。

提醒调度由一个可取消的共享心跳统一驱动：便签提醒、喝水、护眼、休息、下班、心情、天气和跨日重置不会各自创建定时器。订阅全部释放后心跳自动停止；回调正在执行时不会并发重入，系统睡眠后会以当前时间重新检查。

## 技术栈

- **前端**: React 19 + TypeScript + Vite
- **状态管理**: Zustand + tauri-store
- **桌面框架**: Tauri v2 (Rust)
- **本地存储**: 原生便签/设置事务 + macOS Keychain；其他 store 使用 tauri-store，tauri-plugin-fs 用于受控资源 IO

## 产品主线

当前阶段优先级：

1. 稳定透明桌面便签、拖拽、提醒、收纳和本地持久化。
2. 打磨 macOS 桌面体验：点击穿透、托盘、快捷键、重启恢复。
3. 将健康提醒、背景、自定义外观作为增强能力。
4. Widget、Marketplace、开发者门户先作为实验方向，不抢占 0.1 主线。

具体开发约定与生产化优先级见 [AGENTS.md](./AGENTS.md)。

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
| `⌘/Ctrl+Enter` | 保存当前便签弹窗 |
| `Esc` | 关闭弹窗 |
