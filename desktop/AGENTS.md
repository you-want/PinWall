# PinWall Desktop Agent Guide

本文件是 `desktop/` 的开发、评审和发布约定。桌面端是 PinWall 当前产品主线；`frontend/`、`website/`、`marketplace/` 和 `backend/` 属于相关但独立的产品面，除非任务明确要求，不要为了桌面端需求跨目录重构。

## 产品定位与优先级

PinWall 是一个 macOS 优先、本地优先的透明桌面便签墙和轻量工作台。核心价值是让便签、提醒和少量信息卡片稳定地停留在桌面，同时不干扰其他应用。

产品优先级按以下顺序执行：

1. 可靠的便签生命周期：创建、编辑、拖拽、碰撞、收纳、删除和重启恢复。
2. 桌面行为：托盘、全局快捷键、点击穿透、窗口层级、多显示器和通知窗口。
3. 提醒与本地数据安全：提醒不重复、不丢失，设置和卡片数据可迁移、可恢复。
4. 外观、背景和健康关怀能力。
5. AI、Widget、Marketplace、开发者门户等实验能力。

实验能力不得降低核心便签体验的启动速度、稳定性、隐私边界或离线可用性。新增功能必须说明它属于哪个层级，并默认可关闭。

## 技术边界

- 前端：React 19、TypeScript、Vite、Zustand、Tailwind/shadcn。
- 原生层：Tauri v2 + Rust，负责窗口、托盘、全局快捷键、文件导入和受控系统能力。
- 窗口：`main` 渲染 `Wall`，`settings` 渲染 `Settings`，`notification` 渲染 `Notification`。通过 Tauri invoke、事件和持久化 store 协作。
- 数据：卡片由 `src/stores/cardStore.ts` 管理；设置由 `src/services/storage.ts` 管理；文件只写入 AppData 或经用户明确选择的路径。
- Widget：Widget 必须经过 manifest、文件路径、权限和来源校验；不能把任意 HTML/网络请求当作可信代码。

修改窗口行为、Tauri command、capability、持久化 schema 或 widget bridge 时，必须同时检查前端调用方、Rust 实现、权限声明和测试。

## 目录职责

- `src/pages/`：窗口级页面和页面编排，不放跨页面持久化逻辑。
- `src/components/`：可复用 UI；组件通过 hooks/store 操作业务，不直接复制持久化逻辑。
- `src/hooks/`：生命周期和副作用。定时器、事件监听、窗口调用必须在 cleanup 中释放。
- `src/stores/`：跨组件/窗口共享状态和原子动作；状态迁移集中处理，禁止在组件内散落版本判断。
- `src/services/`：Tauri、文件系统、网络和外部服务适配；统一返回可处理的错误，不把异常吞掉。
- `src/types/`：跨模块数据契约；优先使用 discriminated union，避免新增 `any`。
- `src-tauri/src/`：最小原生权限原则。command 输入必须校验，文件路径必须限制在预期目录，Rust 生产代码避免 `unwrap`/`expect`。

## 开发命令

在 `desktop/` 执行：

```bash
pnpm install
pnpm test:run          # 前端单元测试
pnpm build             # TypeScript + Vite 生产构建
pnpm tauri dev         # Tauri 开发模式
pnpm tauri:build:app   # macOS .app 验证
pnpm tauri build       # 发布包（含 DMG）
```

Rust 测试：

```bash
cd src-tauri && cargo test
```

发布前至少通过 `pnpm test:run`、`pnpm build`、`cargo test`；涉及窗口、托盘、快捷键、通知或多显示器行为时，还必须执行 `RELEASE_QA.md` 中的手工检查。不要把 `dist/`、`playwright-report/`、`test-results/` 或 `src-tauri/target/` 的生成物当作源码修改提交。

## 代码与安全约定

- TypeScript 保持 `strict`；新代码不使用 `any`。外部 JSON 先解析/校验，再进入业务类型。
- 所有异步 IO、invoke、网络请求都要有用户可理解的失败状态和日志上下文；日志不得包含 API key、完整便签内容或个人路径。
- API key 仅允许安全存储或明确提示风险；禁止写入日志、URL、错误弹窗和提交记录。
- Tauri capability 遵循最小权限；新增插件权限必须在 PR 中说明窗口、用途和风险。
- 外部路径必须 canonicalize 并验证目录边界；拒绝 `..`、符号链接逃逸、`file://`/localhost/私网等不符合权限的资源。
- 定时任务要可取消、避免重复注册，并在窗口隐藏/应用退出时正确清理。提醒调度应保持单一事实来源。
- 持久化结构需要迁移策略和失败回退；破坏性 schema 变更必须增加迁移测试。
- UI 文案走 i18n；交互控件使用现有设计系统和图标，保证键盘可用、焦点可见、窄窗口不溢出。

## 变更流程

1. 先确认变更属于核心、平台能力还是实验能力，并阅读对应 store/hook/service、Rust command 和 capability。
2. 先写或更新纯函数/store/service 测试，再改 UI；窗口行为必须补充手工或 E2E 场景。
3. 保持小提交和单一目的；不要顺手重命名、格式化整个目录或修改历史 web 端。
4. 完成后运行与风险匹配的测试，并在变更说明中记录已验证命令、已知限制和数据迁移影响。

## 当前生产改进路线

### P0：发布阻断项

- 让 `pnpm build`、`pnpm tauri build` 在干净环境稳定通过，并在 CI 中先跑测试、类型检查和 Rust 测试再打包。
- 将签名身份、更新公钥、更新 endpoint 和发布环境变量改为明确的生产配置；不能保留占位签名身份或未验证的更新源。
- 建立崩溃/错误可观测性：区分用户可恢复错误、数据迁移错误和原生权限错误，避免静默 `catch`。

### P1：核心体验与可靠性

- 统一提醒调度，消除多个 hook 各自 `setInterval` 带来的重复触发、竞态和后台耗电。
- 为卡片和设置增加显式 schema version、迁移日志、损坏文件备份和导出/恢复能力。
- 补齐窗口层级、多显示器、点击穿透、托盘退出、通知去重和重启恢复的自动化回归覆盖。
- 收敛 `any`、Rust `unwrap`/`expect`、裸 `console.log` 和未实现 TODO；为 widget bridge 建立严格协议类型。
- 以性能预算验收：空闲低 CPU、拖拽 10+ 卡片流畅、提醒后台不高频唤醒、Widget 资源可控。

### P2：产品分层与增强能力

- 将 AI、健康关怀、Widget、Marketplace、开发者门户放入“实验/可选”区域，首次启动不打扰核心用户。
- Widget Hub 先做官方可信源和权限解释，再考虑第三方市场、更新、回滚和审核。
- AI 增加超时、重试退避、供应商适配、额度失败降级和本地隐私提示；无网络时核心便签仍完整可用。
- 完善无障碍、键盘操作、国际化完整性和设置搜索，避免设置页随功能增长失控。

## 完成定义（Definition of Done）

一个桌面端变更只有在以下条件满足时才算完成：

- 行为、数据契约、窗口权限和错误路径均有明确实现。
- 相关单元测试通过；涉及用户流程或原生行为时有 E2E/手工验收记录。
- `pnpm build` 和必要的 `cargo test` 通过，且没有新增 lint/type debt。
- 中文和英文文案完整，离线/无权限/网络失败状态可理解。
- 未泄露敏感数据，未扩大不必要的 Tauri capability，未引入不可迁移的持久化格式。
- 文档（README、路线图、发布 QA 或本文件）在行为改变时同步更新。

## 参考文档

- `README.md`：开发入口和产品主线
- `RELEASE_QA.md`：发布验收门禁
- `RELEASE_PROCESS.md`：版本和发布流程
- `releases/`：已发布版本的正式变更记录
