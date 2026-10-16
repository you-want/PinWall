# PinWall Desktop 项目审计、现状与规划

> 2026-10-15 更新：本文下方保留 2026-08-05 的审计快照。第一轮已实现便签编辑、启动加载错误处理、保留卡片位置及浏览器测试适配，21 条 E2E 已通过并加入 Desktop CI。当前实施记录、验证范围及尚待完成的原生手工验收见 [NEXT_ITERATION.md](./NEXT_ITERATION.md)；本文原有 E2E 失败结论不再代表当前工作区。

> 2026-10-16 更新：已接入原生日常保存、便签备份、设置事务、macOS Keychain 和共享提醒心跳；候选版本为 `0.1.4-beta.3`（修复前两次发布的应用清理与 lipo 参数顺序问题）。本轮只生成草稿预发布，移除了 updater 占位配置，暂用手动更新。内测人工操作见 [BETA_TESTING.md](./BETA_TESTING.md)，最新测试记录见 [NEXT_ITERATION.md](./NEXT_ITERATION.md)。以下历史问题不能代替当前版本的验收结论。

审计日期：2026-08-05
审计范围：`desktop/` 桌面端（React + Tauri v2 + Rust）
审计基线：分支 `werther-71`，HEAD `744dbe4`

> 工作区在审计开始前已有未提交改动，涉及 `src-tauri`、存储、Widget bridge、Vite 配置及测试产物。本报告把这些改动视为当前开发状态，不把它们强行还原，也不假设它们已经完成发布验证。

## 一、结论先行

PinWall 已经不是脚手架，而是一个功能较完整的桌面端 alpha / 内测 beta：核心便签生命周期、桌面层级、托盘、快捷键、提醒窗口、本地设置、官方 Widget Hub 和权限桥接都已经有可运行实现，自动化纯逻辑测试也有一定基础。

但当前还不能称为“可放心公开发布的 0.1 生产版”。最主要的原因不是功能数量，而是发布信任链、数据恢复、安全存储和真实桌面验收仍未闭环。建议当前产品定位为：

**功能演示和内测可用，公开分发暂缓；先完成 P0 发布阻断项和 P1 核心可靠性。**

## 二、已验证结果

| 检查 | 结果 | 说明 |
|---|---|---|
| `pnpm test:run` | 通过 | 17 个测试文件，163 个测试全部通过 |
| `pnpm build` | 通过 | TypeScript/Vite 构建成功；主 JS chunk 约 681.67KB，超过 500KB 警告线 |
| `cd src-tauri && cargo test` | 通过 | 26 个 Rust 单元测试全部通过 |
| `pnpm tauri:build:app` | 通过 | 成功生成 `src-tauri/target/release/bundle/macos/PinWall.app` |
| app notarization | 未验证 | 本机构建日志明确提示缺少 Apple notarization 环境变量 |
| `pnpm test:e2e` | 失败 | 14/14 失败；Vite 能启动，但浏览器端 Tauri invoke/插件初始化导致页面一直处于加载或节点反复卸载状态 |
| CI E2E 门禁 | 未覆盖 | `.github/workflows/desktop-ci.yml` 只跑单测、前端构建和 Rust 测试 |

E2E 失败目前更像是“浏览器测试适配缺失”，不能直接推断 Tauri 桌面窗口同样失败；但它已经是红色回归信号，不能继续作为可忽略的测试脚本存在。

## 三、当前完成度

| 能力域 | 现状 | 完成度判断 |
|---|---|---|
| 便签创建、编辑、删除、折叠、拖拽 | Zustand store、PinBoard、PinCard、碰撞和网格布局均已实现 | 核心流程基本成型 |
| 收纳与层叠 | 超过可见数量后进入 stack，可恢复 | 已实现，需真实多卡片手工回归 |
| 本地持久化 | cards/settings/reminders/mood/widgets 通过 tauri-store 或 AppData 文件保存 | 能用，但缺 schema、备份、损坏恢复 |
| 桌面行为 | main/settings/notification 三窗口、底层/顶层切换、点击穿透、托盘、全局快捷键 | 有实际原生代码，仍依赖 macOS 手工验收 |
| 提醒 | 用户便签提醒 + 护眼、休息、下班、心情、天气等系统提醒 | 功能丰富，但调度分散、时间边界未收敛 |
| 设置与国际化 | 中英文、设置分区、启动项、快捷键、背景、AI、额度和 care 设置 | UI 覆盖较广，错误反馈和密钥存储不足 |
| 官方 Widget Hub | 5 个官方 Widget、manifest 校验、安装/卸载/持久化、权限展示 | 内测级实现；第三方生态尚未达到可信市场级别 |
| Widget bridge | storage/theme/i18n/notify/cards/AI/system/network/events 等模块和权限检查 | 有安全意识，但仍需收紧网络和资源边界 |
| 更新与发布 | updater UI、Tauri updater 配置、GitHub Actions DMG 流程 | 代码存在，签名、更新元数据和 notarization 未闭环 |
| 可观测性 | 各模块有 console 日志和失败状态，但没有统一错误分类/崩溃上报 | 内测可排查，生产不可运营 |

## 四、需要修复的问题

### P0：公开发布前必须解决

#### 1. 签名、更新和 notarization 仍是占位或不一致状态

证据：`src-tauri/tauri.conf.json:72-84` 使用 `signingIdentity: "-"`，updater 公钥是占位内容；`src/services/updater/index.ts:5` 的 Release URL 是 `rain9/pinwall`，而 Tauri endpoint 使用 `you-want/PinWall`；`.github/workflows/release.yml:104-111` 虽传入证书参数，但没有看到生成并发布与 endpoint 匹配的 updater JSON/签名密钥配置。当前本地 `.app` 构建也明确跳过 notarization。

影响：用户无法建立“这是可信的 PinWall 安装包”的信任；自动更新可能查不到文件、校验失败或指向错误仓库；手工重组 universal DMG 后还需要重新签名和 notarize，不能只看 DMG 生成成功。

处理：确定正式 GitHub 仓库和 release URL；生成并保管 updater 私钥，公钥只写入配置；在 CI 中显式生成 updater artifacts、签名和 update JSON；为 Apple Developer ID、Team ID、notarization、staple 增加预检；对最终 universal `.app` 做 `codesign --verify --deep --strict`、`spctl --assess` 和 notarization 状态检查。

#### 2. AI 与额度 API key 以明文进入 AppData 设置文件

证据：`src/types/index.ts:12-19,172-183` 将 `apiKey` 作为普通设置字段；`src/services/storage.ts:86-91` 直接 JSON 写入；设置页虽然使用 password 输入框，但这只隐藏界面，不改变磁盘存储。

影响：本机其他有文件读取权限的进程或备份会拿到长期密钥，违反项目的本地隐私约定。

处理：macOS 优先使用 Keychain（Tauri plugin 或 Rust Security framework）存储 secret；JSON 只保留 provider/model/endpoint 和 secret 引用；迁移旧版本时一次性读取明文并写入 Keychain，成功后从文件删除；错误日志和导出文件必须脱敏；设置页显示明确的本地存储说明和清除入口。

#### 3. E2E 全红，且 CI 不会阻止回归

证据：`pnpm test:e2e` 实际结果为 14/14 失败；`playwright.config.ts:3-6` 明确说明测试的是“无 Tauri shell 的 Vite server”，但 `src/main.tsx:16-40` 和 `src/pages/Wall.tsx:84-90` 仍会初始化 Tauri store、autostart 和 event listener。`.github/workflows/desktop-ci.yml:47-55` 没有 E2E 步骤。

影响：按钮、首屏、创建便签等最基本的用户流程没有可用回归门禁；测试失败原因与产品代码混在一起，后续很容易被忽略。

处理二选一并尽快落地：

1. 给浏览器测试提供明确的 Tauri adapter/mock（所有 invoke、window、fs、autostart 都必须快速返回，并有独立测试）；
2. 将这些测试迁移到真正的 `tauri dev`/打包 app E2E，浏览器 Vite 测试只保留纯 UI 组件测试。

无论选哪种，都应把至少一条“创建便签→持久化→重启恢复”和一条“提醒到期→通知→查看/确认”纳入 CI 或发布手工记录。

### P1：核心可靠性和安全边界

#### 4. 设置/卡片数据没有显式 schema version、备份和原子恢复

`src/services/storage.ts:41-83` 对读取、JSON 解析、权限错误全部使用同一个 catch，并直接返回默认设置；损坏文件不会备份、不会记录迁移错误，下一次保存可能覆盖原数据。`src/stores/cardStore.ts:25-32,292-300` 只做散落的字段推断，使用 `any`，没有版本化迁移和失败回退。各设置更新函数都是“读→改→写”，深拷贝只能避免引用变化，不能防止两个并发读改写互相覆盖。

处理：定义 `schemaVersion`；用运行时 schema 校验（例如 zod 或手写 discriminated validator）；迁移前备份损坏文件为带时间戳的 `.bak`；写入采用临时文件 + rename；集中一个 storage queue；增加导出/导入和迁移测试。

#### 5. 提醒调度分散，且日期使用存在 UTC/本地时区错位

`useReminders` 每秒检查一次，另有 `useEyeCareReminder`、`useRestReminder`、`useOffWorkReminder`、`useMoodCheckin`、`useWeatherCare` 等独立 interval。`src/hooks/useDailyReset.ts:23,38-43`、`src/stores/cardStore.ts:228-244`、`src/hooks/useOffWorkReminder.ts:25-27` 同时混用 `toISOString().slice(0, 10)` 和本地 `getHours()`。

影响：空闲唤醒次数偏高；设置变更、窗口隐藏、睡眠唤醒和多个 hook 同时触发时容易产生竞态。对于东八区用户，午夜到 08:00 之间“今天”的 UTC 日期仍是前一天，可能造成打卡/每日提醒错日。

处理：建立单一 ReminderScheduler，按 `nextDueAt` 驱动，统一处理睡眠唤醒、时钟跳变、取消和去重；所有 occurrence key 使用同一时区策略（默认系统本地时区），补跨午夜、夏令时和重启测试。

#### 6. Widget 的网络和资源隔离还不足以支撑第三方市场

已有优点：Rust 侧校验反向域名 id、拒绝 `..`/绝对路径/符号链接，并限制 manifest 权限（`src-tauri/src/widgets.rs:37-148`）；bridge 也会检查 permission、限制请求方法和 10MB body（`src/services/widgetBridge.ts:340-377`）。

仍有风险：

- `src-tauri/tauri.conf.json:51-56` 的 CSP 为 `null`，asset scope 是整个 `$APPDATA/**`；
- `src/services/widgetBridge.ts:95-114` 只拦截少量主机和 IPv4 私网，未覆盖 IPv6/link-local、DNS 解析到私网、DNS rebinding 和资源响应大小/超时；
- `src-tauri/src/widgets.rs:256-279,454-477` 对本地 Widget 复制没有包大小、文件数量、递归深度或磁盘配额限制；
- `src/components/WidgetFrame.tsx:75-78,249-256` 对 srcDoc 使用 wildcard target origin，桥接协议仍大量使用 `any`。

处理：第三方 Widget 默认关闭；先只允许签名官方源；收紧 CSP/asset scope；网络 bridge 使用 allowlist、DNS 校验、超时、响应大小上限和重定向逐跳校验；安装包限制大小/文件数/深度；协议改为严格 discriminated union，避免把宿主状态对象直接返回给 Widget。

#### 7. 错误路径和敏感日志未统一治理

更新器、设置、Widget、提醒等模块大量 `catch` 后只 `console.error` 或返回默认值，缺少错误分类、用户可理解提示和诊断上下文。`src/services/updater/index.ts:55,95-107,152-158` 还会直接打印错误对象；项目约定要求日志不得带 API key、完整便签内容或个人路径。

处理：定义可序列化的错误码（recoverable/data-migration/native-permission/network）；统一 logger，默认脱敏；为权限、网络、迁移和通知失败提供可见但不打扰的状态；加入崩溃/错误采集的隐私开关。

### P2：性能、维护性和产品分层

#### 8. 首包偏大，且仍有类型债务

`pnpm build` 报告主 JS chunk 681.67KB；Widget bridge、marketplace、developer portal、更新器等实验能力被打进主包。生产代码仍有多个 `any`（例如 `src/stores/cardStore.ts:26`、`src/services/widgetBridge.ts:21,76`、`src/types/index.ts:244,287,298-312`），与 `strict` 并不矛盾，但降低了协议和迁移的可验证性。

处理：对设置中的实验面板、Marketplace、Developer Portal、AI provider 做动态 import；建立 chunk/performance budget；按优先级逐步收敛 `any`，优先处理持久化和 Widget bridge 契约。

#### 9. 实验功能边界需要继续收紧

Marketplace、Developer Portal、AI、额度监控和 Widget 已经存在，但产品主线仍是便签和桌面行为。应保持默认关闭、明确风险说明，不让网络或 AI 初始化拖慢首次启动，也不要在官方 Widget 安全审计完成前开放任意第三方市场。

## 五、建议路线图

### Phase 0：发布止血（优先完成）

- [ ] 统一仓库名、release URL、updater endpoint 和版本来源。
- [ ] 完成 Apple Developer ID signing、notarization、staple 和 CI secret 预检。
- [ ] 生成真实 updater keypair，发布 update JSON 和签名产物；在干净机器验证“检查→下载→安装→重启”。
- [ ] 选择并修复 E2E 策略；让 CI 至少覆盖首屏、建卡和提醒主流程。
- [ ] 将 AI/额度 key 迁移到 Keychain，增加旧明文迁移和脱敏检查。

### Phase 1：核心数据与提醒可靠性

- [ ] 统一 `storage` service，加入 schema version、校验、迁移日志、损坏备份、原子写和串行写队列。
- [ ] 给 cards/settings/reminders/widgets 增加导出、导入、恢复和迁移测试。
- [ ] 用单一 scheduler 替代分散 interval；统一本地时区日期和 occurrence key。
- [ ] 补睡眠/唤醒、时钟跳变、跨午夜、重复确认、窗口隐藏和重启恢复测试。

### Phase 2：macOS 桌面体验和发布 QA

- [ ] 按 `RELEASE_QA.md` 完成真实 macOS 手工验收：点击穿透、顶层召回、多显示器、托盘退出、通知位置、拖拽 10+ 卡片。
- [ ] 加入 app bundle 签名验证、`spctl`、notarization 状态、DMG 安装和干净用户目录测试。
- [ ] 记录空闲 CPU、30 分钟内存增长、提醒后台唤醒次数和首屏启动时间预算。
- [ ] 处理 681KB 首包和实验模块动态加载。

### Phase 3：实验生态（核心稳定后再做）

- [ ] Widget 先做官方可信源、版本回滚、权限变更提示和资源配额。
- [ ] 再考虑第三方市场、审核、签名、更新和沙箱策略。
- [ ] AI 增加超时、退避重试、额度失败降级、离线提示和供应商适配；核心便签在无网络时保持完整可用。
- [ ] 补齐无障碍、键盘操作、设置搜索和中英文文案审计。

## 六、下一步可直接拆成的任务

1. **Release trust chain**：修正仓库/endpoint，接入真实签名与 updater artifacts，补 CI 预检和干净机更新验收。
2. **Data safety**：实现 settings/cards schema version + Keychain secret migration + atomic storage queue，并先写迁移/损坏恢复测试。
3. **Reminder scheduler**：统一调度器和本地时区策略，删除重复 interval，补跨午夜/睡眠唤醒/重启回归。
4. **E2E gate**：修复 Tauri mock 或迁移为真实 Tauri E2E，将至少两条核心用户流程加入 CI。
5. **Widget hardening**：网络 SSRF、CSP、资源配额和 bridge 类型收紧完成后，再评估开放第三方来源。

## 七、完成定义

只有满足以下条件，才建议把版本从“内测”提升为“公开发布”：

- `pnpm test:run`、`pnpm build`、`cargo test`、E2E 核心流程全部通过；
- 最终 universal `.app` 通过签名、Gatekeeper 和 notarization 检查，DMG 在干净用户环境可安装；
- 数据 schema 有版本、迁移、损坏备份、导出/恢复，且 API key 不再明文落盘；
- 提醒由单一调度事实来源驱动，并通过跨时区、睡眠唤醒、重复去重和重启恢复测试；
- Widget 权限、网络和资源边界有自动化安全测试，第三方市场默认关闭；
- 发布 QA 记录无核心流程阻断项，已知限制写入对应 release note。
