export interface BackgroundImage {
  id: string;
  path: string;
  fileName: string;
  createdAt: number;
  isDefault: boolean;
}

export interface AIConfig {
  enabled: boolean;
  apiEndpoint: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  enabled: false,
  apiEndpoint: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
};

// ─── Care Tone ────────────────────────────────────────────
export type CareTone = "warm" | "rational" | "playful";

export const DEFAULT_MOOD_CHECKIN_TIME = "09:10";
export const DEFAULT_MOOD_CHECKIN_TIMES = [DEFAULT_MOOD_CHECKIN_TIME];

export interface Settings {
  backgroundImages: BackgroundImage[];
  currentImageId: string | null;
  opacity: number;
  autoChangeEnabled: boolean;
  autoChangeInterval: number; // in minutes
  launchOnStartup?: boolean; // 开机自启动开关，默认 true
  ai?: AIConfig;
  quotaMonitor?: QuotaMonitorConfig;
  holidayEnabledCn?: boolean;  // 中国节日祝福开关，默认 true
  holidayEnabledIntl?: boolean; // 国际节日祝福开关，默认 true
  lastDailyCardDate?: string; // YYYY-MM-DD, tracks last daily card generation
  lastHolidayCardDate?: string; // YYYY-MM-DD, tracks last holiday card generation
  globalShortcut?: string; // 自定义全局快捷键，默认 CommandOrControl+Shift+Space
  // ── Care / Companion features ──
  careTone?: CareTone; // 关怀语气风格，默认 "warm"
  hydrationGoal?: number; // 每日喝水目标（杯），默认 8
  moodCheckinEnabled?: boolean; // 心情打卡开关，默认 true
  moodCheckinTimes?: string[]; // 心情打卡时间，默认 ["09:10"]
  restReminderEnabled?: boolean; // 休息提醒开关，默认 true
  restInterval?: number; // 休息间隔（分钟），默认 90
  offWorkTime?: string; // 下班时间 HH:MM，默认 "18:00"
  offWorkReminderEnabled?: boolean; // 下班关怀开关，默认 true
  eyeCareEnabled?: boolean; // 护眼提醒开关，默认 true
  eyeCareInterval?: number; // 护眼间隔（分钟），默认 20
  weatherCareEnabled?: boolean; // 天气关怀开关，默认 true
  weatherCity?: string; // 天气城市
  lastWeatherCardDate?: string; // YYYY-MM-DD, tracks last weather card generation
}

export const DEFAULT_GLOBAL_SHORTCUT = "CommandOrControl+Shift+Space";

export type CardType = "note" | "reminder" | "daily-checkin" | "hydration" | "mood";

export type SystemCardKind =
  | "eye-care"
  | "rest"
  | "off-work"
  | "overtime"
  | "weather"
  | "mood-checkin";

export type SystemReminderKind = SystemCardKind;

export type ReminderNotificationLifecycle =
  | "card"
  | "one-time"
  | "recurring"
  | "daily";

export interface ReminderNotification {
  id: string;
  title: string;
  content: string;
  colorIndex: number;
  lifecycle: ReminderNotificationLifecycle;
  source: "card" | "system";
  cardId?: string;
  systemKind?: SystemReminderKind;
  occurrenceKey?: string;
  nextDueAt?: number;
  canView?: boolean;
}

export interface PinCardData {
  id: string;
  title: string;
  content: string;
  x: number;
  y: number;
  collapsed: boolean;
  colorIndex: number;
  createdAt: number;
  updatedAt: number;
  cardType: CardType;
  reminderEnabled: boolean;
  reminderTime: number | null;
  reminderFired: boolean;
  checkinDone: boolean;
  lastCheckinDate: string | null;
  systemKind?: SystemCardKind;
  // ── Hydration card fields ──
  hydrationCount?: number;   // 今日已喝杯数
  hydrationGoal?: number;    // 目标杯数
  hydrationDate?: string;    // YYYY-MM-DD，用于每日重置
}

export const AUTO_CHANGE_INTERVALS = [
  { label: "1分钟", value: 1 },
  { label: "5分钟", value: 5 },
  { label: "10分钟", value: 10 },
  { label: "30分钟", value: 30 },
  { label: "1小时", value: 60 },
  { label: "6小时", value: 360 },
  { label: "1天", value: 1440 },
];

// ─── Quota Monitor ────────────────────────────────────────

export interface QuotaMonitorModel {
  id: string;
  name: string;          // 用户自定义名称，如 "GPT-4o"
  apiEndpoint: string;   // API 地址
  apiKey: string;        // API Key
  model: string;         // 模型标识
}

export interface QuotaMonitorConfig {
  enabled: boolean;
  models: QuotaMonitorModel[];
  refreshInterval: number; // 分钟，默认 5
}

export interface QuotaResult {
  modelId: string;
  total: number | null;      // 总额度（美元），null 表示查询失败
  used: number | null;       // 已用额度
  remaining: number | null;  // 剩余额度
  currency: string;          // 货币单位
  lastUpdated: number;       // 时间戳
  error?: string;            // 错误信息
}

export const DEFAULT_QUOTA_MONITOR: QuotaMonitorConfig = {
  enabled: false,
  models: [],
  refreshInterval: 5,
};

export const QUOTA_REFRESH_INTERVALS = [
  { label: "1分钟", value: 1 },
  { label: "5分钟", value: 5 },
  { label: "15分钟", value: 15 },
  { label: "30分钟", value: 30 },
  { label: "1小时", value: 60 },
];

// ─── Widget Extension System ────────────────────────────────

/** Widget 权限标识 */
export type WidgetPermission =
  | "storage"
  | "theme"
  | "notify"
  | "cards"
  | "events"
  | "app"
  | "ai"
  | "system"
  | "network"
  | "i18n";

/** Widget 分类 */
export type WidgetCategory =
  | "utility"
  | "productivity"
  | "beautification"
  | "entertainment"
  | "system"
  | "social"
  | "developer"
  | "other";

/** Widget 类型标识 */
export type WidgetType = "official" | "community";

/** Widget Manifest 中的设置项定义 */
export interface WidgetSettingDefinition {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "color";
  default?: any;
  options?: string[];       // type="select" 时使用
  min?: number;             // type="number" 时使用
  max?: number;             // type="number" 时使用
  description?: string;
}

/** Widget 尺寸 */
export interface WidgetSize {
  width: number;
  height: number;
}

/** Widget Manifest（widget.json 结构） */
export interface WidgetManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  entry: string;             // 入口 HTML 文件路径，如 "index.html"
  icon: string;              // 图标文件路径
  type: WidgetType;
  category: WidgetCategory;
  permissions: WidgetPermission[];
  defaultSize: WidgetSize;
  minSize?: WidgetSize;
  maxSize?: WidgetSize;
  settings?: WidgetSettingDefinition[];
}

/** Widget 预设尺寸档位 */
export type WidgetSizePreset = "S" | "M" | "L";

/** Widget 实例（已安装 + 运行时的状态） */
export interface WidgetInstance {
  manifest: WidgetManifest;
  enabled: boolean;
  x: number;
  y: number;
  size: WidgetSize;
  zIndex: number;
  settings: Record<string, any>;  // 用户自定义设置值
  installedAt: number;
  updatedAt: number;
}

/** Widget Bridge 消息协议 */
export interface WidgetBridgeRequest {
  type: "request";
  id: string;                // 请求唯一 ID
  module: string;            // API 模块名（storage/cards/theme...）
  method: string;            // 方法名
  args?: any[];              // 参数
}

export interface WidgetBridgeResponse {
  type: "response";
  id: string;                // 对应请求 ID
  success: boolean;
  data?: any;
  error?: string;
}

export interface WidgetBridgeEvent {
  type: "event";
  event: string;             // 事件名
  payload?: any;
}

export type WidgetBridgeMessage = WidgetBridgeRequest | WidgetBridgeResponse | WidgetBridgeEvent;

/** Widget 尺寸预设值 */
export const WIDGET_SIZE_PRESETS: Record<WidgetSizePreset, WidgetSize> = {
  S: { width: 160, height: 160 },
  M: { width: 260, height: 260 },
  L: { width: 380, height: 380 },
};
