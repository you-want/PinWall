# PinWall Desktop — 项目结构概览与核心模块说明

## 一、项目概览

**PinWall** 是一款基于 **Tauri + React 19 + Vite** 的桌面便签/打卡应用。桌面作为操作主界面，支持拖拽卡片、AI 生成内容、节日祝福、AI 额度监控等功能。

### 技术栈

| 层级 | 技术选型 |
|---|---|
| 框架 | Tauri 2 (Rust 后端) + React 19 (Vite 构建) |
| 状态管理 | Zustand + `@tauri-store/zustand` (持久化 + 跨窗口同步) |
| UI | Tailwind CSS + shadcn/ui 组件 + Radix UI |
| 国际化 | 自研 i18n (`zh`/`en`) |
| 日历 | `lunar-typescript` (农历/节气) |
| AI | OpenAI 兼容 API (OpenAI / DeepSeek / 自托管) |

### 目录结构

```
desktop/
├── src/
│   ├── main.tsx                  # 入口：并行启动 Tauri 持久化 handler → 渲染 App
│   ├── App.tsx                   # 窗口路由：根据 Tauri window label 分发给不同 Page
│   ├── App.css                   # 全局样式（卡片拖拽、背景、弹窗等）
│   │
│   ├── pages/                    # 页面级组件
│   │   ├── Wall.tsx              # 主桌面：承载卡片、模态框、浮动按钮
│   │   ├── Settings.tsx          # 设置页：AI/额度/快捷键/背景
│   │   └── Notification.tsx      # 通知弹窗：提醒卡片弹出窗口
│   │
│   ├── components/               # UI 组件
│   │   ├── PinBoard.tsx          # 桌面卡片容器（渲染可见卡片）
│   │   ├── PinCard.tsx           # 单个便签卡片（拖拽/全屏/右键菜单/AI 润色）
│   │   ├── CardStack.tsx         # 收纳区（隐藏卡片预览 + 展开面板）
│   │   ├── NewCardModal.tsx      # 新建卡片弹窗
│   │   ├── FloatingButtons.tsx   # 右下角浮动按钮（新建/设置）
│   │   ├── Background.tsx        # 桌面背景图
│   │   ├── QuotaCard.tsx         # AI 额度监控浮窗
│   │   ├── SettingsPanel.tsx     # 设置面板 UI
│   │   ├── ShortcutRecorder.tsx  # 快捷键录制器
│   │   └── ui/button.tsx         # shadcn 按钮基础组件
│   │
│   ├── stores/                   # Zustand 状态管理
│   │   ├── cardStore.ts          # 卡片 CRUD + 置顶层级 + Tauri 持久化
│   │   ├── notificationStore.ts  # 通知弹窗状态
│   │   └── languageStore.ts      # 语言切换
│   │
│   ├── hooks/                    # 业务逻辑 Hooks
│   │   ├── useCards.ts           # 卡片视图逻辑（可见/收纳、碰撞解决）
│   │   ├── useReminders.ts       # 提醒轮询 + 通知弹出
│   │   ├── useDailyReset.ts      # 每日打卡重置
│   │   ├── useDailyCard.ts       # 每日 AI 励志卡片
│   │   ├── useHolidayCard.ts     # 节日祝福卡片
│   │   └── useQuotaMonitor.ts    # 额度轮询
│   │
│   ├── services/                 # 外部交互
│   │   ├── storage.ts            # Tauri 文件系统读写（settings）
│   │   ├── aiService.ts          # OpenAI 兼容 API 调用（生成/润色/摘要）
│   │   └── quotaService.ts       # AI 额度查询（OpenAI/DeepSeek）
│   │
│   ├── types/index.ts            # 类型定义
│   ├── data/holidays.ts          # 节日定义 + 农历检测
│   ├── i18n/                     # 国际化
│   │   ├── index.ts              # useI18n Hook + interpolate 工具
│   │   ├── zh.ts                 # 中文翻译
│   │   └── en.ts                 # 英文翻译
│   ├── utils/collision.ts        # 卡片碰撞检测与分离算法
│   └── lib/utils.ts              # cn() 工具函数（clsx + tailwind-merge）
```

### 窗口架构

PinWall 在 Tauri 层面创建了 **3 个独立窗口**，通过 `App.tsx` 的 `WindowRouter` 路由到不同 Page：

| 窗口 label | 对应 Page | 职责 |
|---|---|---|
| `main` | `Wall.tsx` | 主桌面（便签卡片） |
| `settings` | `Settings.tsx` | 设置面板 |
| `notification` | `Notification.tsx` | 通知弹窗（提醒到达时弹出） |

---

## 二、核心模块说明

### 模块 1：卡片管理系统（Card System）

这是 PinWall 最核心的模块，涵盖卡片的 CRUD、拖拽、碰撞、可见/隐藏、提醒等全生命周期。

**涉及文件：**

| 文件 | 职责 |
|---|---|
| `src/stores/cardStore.ts` | 底层状态（Zustand store），所有卡片操作的单一数据源 |
| `src/hooks/useCards.ts` | 业务逻辑层，将 store 操作包装为组件可用的 hooks |
| `src/components/PinCard.tsx` | 卡片 UI：拖拽、全屏、右键菜单、AI 操作 |
| `src/components/PinBoard.tsx` | 卡片容器 |
| `src/components/CardStack.tsx` | 收纳区 |
| `src/utils/collision.ts` | 碰撞检测与分离算法 |

**职责：**
- **数据存储**：`cardStore` 以 `PinCardData[]` 为核心数据，维护 `zIndexMap` 控制层级。卡片通过 `updatedAt` 排序，最新操作的卡片排在最前面。
- **可见/隐藏机制**：按 `updatedAt` 降序排序后，前 5 张显示在 `PinBoard`（桌面），其余放入 `CardStack`（收纳区）。`unstashCard` 将卡片 `updatedAt` 改为当前时间使其回到桌面，同时挤走最旧的一张。
- **拖拽 & 碰撞**：`PinCard` 通过 pointer 事件处理拖拽 → `setPosition` → `onDragEnd` → `useCards.handleDragEnd` → `resolveCollisions`（`collision.ts`）。碰撞算法对重叠矩形沿最短轴推开。
- **卡片创建**：`NewCardModal` 提交 → `useCards.handleCreateCard` → `cardStore.createCard` → `requestAnimationFrame` 内重新排序并碰撞检测。

**对外暴露接口：**

```typescript
// cardStore（直接暴露的 actions）
setPosition(id, x, y)
batchSetPositions([{id, x, y}])
bringToFront(id)
toggleCollapse(id)
closeCard(id)
createCard(title, content, colorIndex, cardType, reminderEnabled, reminderTime, x, y)
updateContent(id, content)
reminderFired(id)
unstashCard(id)
checkinCard(id)
resetDailyCheckins()

// useCards（包装后的 hooks 返回值）
{ visibleCards, stashedCards, zIndexMap, handlePositionChange, handleBringToFront,
  handleToggleCollapse, handleCloseCard, handleMinimizeCard, handleCreateCard,
  handleUnstashCard, handleDragEnd, updateCardReminder, handleReminderFired }
```

**调用关系：**

```
NewCardModal ──create──→ useCards.handleCreateCard ──→ cardStore.createCard
PinCard ──drag──→ handlePositionChange (setPosition)
PinCard ──dragEnd──→ handleDragEnd → collision.resolveCollisions
PinCard ──close──→ handleCloseCard (closeCard)
CardStack ──pin──→ handleUnstashCard (unstashCard)
```

---

### 模块 2：提醒系统（Reminder System）

负责定时检查卡片提醒是否到期，到期时弹出通知窗口并播放声音。

**涉及文件：**

| 文件 | 职责 |
|---|---|
| `src/hooks/useReminders.ts` | 核心逻辑：每秒轮询到期提醒、弹出通知窗口 |
| `src/stores/notificationStore.ts` | 通知状态（当前通知卡片、viewCardId） |
| `src/pages/Notification.tsx` | 通知弹窗 UI + 声音播放 + 自动消失 |

**职责：**
- **提醒轮询**：`useReminders` 每秒 (`setInterval 1000ms`) 遍历所有卡片，筛选条件：`reminderEnabled && !reminderFired && reminderTime <= now`。对 `daily-checkin` 类型额外要求 `!checkinDone`。
- **通知弹出**：到期时设置 `pendingNotificationRef`，200ms 轮询取出通知卡片 → `notificationStore.showNotification(card)` → 获取 Tauri `notification` 窗口 → 设置位置 → show + setFocus。
- **通知交互**：`Notification` 页面显示卡片内容，支持"查看全屏"（`viewCard` → dispatch `pinwall:fullscreen-card` 自定义事件 → `PinCard` 监听并全屏）和"关闭"。15 秒后自动消失。
- **跨窗口通信**：通过 Zustand 跨窗口同步（`@tauri-store/zustand`）和 Tauri invoke (`invoke("summon_main")`) 实现。

**对外暴露接口：**

```typescript
// useReminders 内部（不导出，仅被 Wall.tsx 调用）
useReminders(cards, onReminderFired)

// notificationStore
showNotification(card)
dismissNotification()
viewCard(cardId)
clearViewCard()
```

**调用关系：**

```
Wall ──cards prop──→ useReminders
  ├──每秒检查──→ dueCard 找到
  │   ├── notificationStore.showNotification(card)
  │   └── Tauri notification window show()
  │
  └── Notification page
      ├── handleView → notificationStore.viewCard(id)
      │   └── invoke("summon_main") + CustomEvent("pinwall:fullscreen-card")
      └── handleDismiss → notificationStore.dismissNotification() + window hide()
```

---

### 模块 3：AI & 自动卡片系统

这一模块涵盖 AI 内容生成、自动每日卡片、节日祝福卡片，以及 AI 额度监控。

**涉及文件：**

| 文件 | 职责 |
|---|---|
| `src/services/aiService.ts` | OpenAI 兼容 API 调用（4 个公开函数） |
| `src/services/quotaService.ts` | OpenAI/DeepSeek 额度查询 |
| `src/hooks/useDailyCard.ts` | 启动时生成每日 AI 卡片 |
| `src/hooks/useHolidayCard.ts` | 启动时节日自动弹出祝福卡片 |
| `src/hooks/useQuotaMonitor.ts` | 定时轮询 AI 额度 |
| `src/data/holidays.ts` | 节日定义 + 农历/节气检测 |
| `src/components/NewCardModal.tsx` | AI 内容生成（新建时一键生成） |
| `src/components/PinCard.tsx` | AI 润色/精简（右键菜单） |
| `src/components/QuotaCard.tsx` | 额度浮窗 UI |
| `src/components/SettingsPanel.tsx` | AI 配置 UI |

**职责：**

#### 3a. AI 内容生成 (`aiService.ts`)

**4 个公开函数：**

```typescript
generateNoteContent(config, title, lang) → Promise<string>      // 根据关键词生成内容
polishContent(config, content, lang) → Promise<string>          // 润色现有内容
condenseContent(config, content, lang) → Promise<string>        // 精简内容
generateDailyQuote(config, lang) → Promise<{title, content}>    // 每日励志卡片
generateHolidayGreeting(holidayName, config, lang) → Promise<{title, content}>  // 节日祝福
```

实现统一走 `chatCompletion()` → POST 到 `{apiEndpoint}/chat/completions`，模板化的 system prompt 适配不同场景。

#### 3b. 自动卡片 (`useDailyCard.ts` / `useHolidayCard.ts`)

- **每日卡片**：应用启动时，如果 AI 已配置 + 今日未生成 → 调用 `generateDailyQuote` → `cardStore.createCard()` → 记录 `lastDailyCardDate`。
- **节日卡片**：应用启动时，如果今天是节日 + 今日未发送 → AI 优先（失败回退到预设问候语） → `cardStore.createCard()` → 自动弹出通知窗口 → 记录 `lastHolidayCardDate`。

#### 3c. 额度监控 (`quotaService.ts` + `useQuotaMonitor.ts`)

- **探测器**：从 `apiEndpoint` URL 自动识别提供商（OpenAI / DeepSeek / unknown）。
- **DeepSeek**：调 `/user/balance` → 解析 `total_balance`、`granted_balance`、`topped_up_balance`。
- **OpenAI 兼容**：调 `/dashboard/billing/subscription` + `/dashboard/billing/usage` → 计算已用/剩余。
- **轮询**：`useQuotaMonitor` 按配置间隔（1~60 分钟）定时刷新，失败自动降级。

**调用关系：**

```
NewCardModal ──AI 生成──→ aiService.generateNoteContent
PinCard ──右键菜单──→ aiService.polishContent / condenseContent
useDailyCard ──启动──→ aiService.generateDailyQuote ──→ cardStore.createCard()
useHolidayCard ──启动──→ aiService.generateHolidayGreeting ──→ cardStore.createCard()
useQuotaMonitor ──定时──→ quotaService.fetchAllQuotas ──→ QuotaCard UI
SettingsPanel ──配置──→ storage.updateAIConfig / updateQuotaMonitorConfig
```

---

## 三、待处理项 & 临时实现

本次扫描 **未发现 `TODO` / `FIXME` / `HACK` / `XXX` 等注释标记**。但有几处值得关注的潜在改进点：

### 1. 节日开关字段不一致（向后兼容遗留）

**位置：** `src/types/index.ts:31-32` / `src/services/storage.ts:31-34` / `src/components/SettingsPanel.tsx:229`

类型定义中使用了 `holidayEnabledCn` 和 `holidayEnabledIntl` 两个新字段，但 `SettingsPanel.tsx:229` 仍在读 `settings.holidayEnabled`（旧字段）。`storage.ts` 在 `getSettings` 中有迁移逻辑将旧字段映射到新字段，但 UI 端没有同步读取新字段，可能导致设置面板的开关状态与实际存储不一致。

### 2. 硬编码的尺寸常量

**位置：** `src/utils/collision.ts:14-16`

```typescript
const CARD_WIDTH = 220;
const CARD_HEIGHT_ESTIMATE = 160;
```

卡片碰撞检测使用的宽高是硬编码的估算值，如果 PinCard 实际渲染尺寸变化，碰撞效果会失准。考虑从组件或 CSS 变量读取实际尺寸。

### 3. 除夕的特殊日期处理

**位置：** `src/data/holidays.ts:229-237`

除夕（`new-years-eve`）通过"判断明天是否为春节"来检测，逻辑能工作但不够直观。如果考虑农历月份大小月（腊月可能 29 天而非 30 天），`lunarDay: 30` 这个定义在某些年份可能不准确。目前 `lunar-typescript` 库应该能处理，但建议验证大年三十的边界情况。

### 4. `HolidayRegion` 枚举与 UI 的潜在不匹配

**位置：** `src/data/holidays.ts:199`

`getTodayHoliday` 接收 `enabledRegions: HolidayRegion[]` 参数，但 `useHolidayCard.ts:26` 检查的是 `settings.holidayEnabled === false`（旧布尔字段），而非分别检查 `holidayEnabledCn` 和 `holidayEnabledIntl`。这意味着两个地区开关在逻辑上被旧字段统一控制。

### 5. 碰撞算法的边界保护被 window 对象依赖

**位置：** `src/utils/collision.ts:121-126`

`resolveCollisions` 末尾用 `window.innerWidth` / `window.innerHeight` 做边界限制。在 SSR 或 webview 非标准环境下 `window` 可能不存在。目前代码在 Tauri webview 中运行所以不会出错，但如果未来需要适配其他环境需要注意。
