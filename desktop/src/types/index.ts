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

export interface Settings {
  backgroundImages: BackgroundImage[];
  currentImageId: string | null;
  opacity: number;
  autoChangeEnabled: boolean;
  autoChangeInterval: number; // in minutes
  ai?: AIConfig;
  quotaMonitor?: QuotaMonitorConfig;
  holidayEnabled?: boolean; // 节日祝福开关，默认 true
  lastDailyCardDate?: string; // YYYY-MM-DD, tracks last daily card generation
  lastHolidayCardDate?: string; // YYYY-MM-DD, tracks last holiday card generation
  globalShortcut?: string; // 自定义全局快捷键，默认 CommandOrControl+Shift+Space
}

export const DEFAULT_GLOBAL_SHORTCUT = "CommandOrControl+Shift+Space";

export type CardType = "note" | "reminder" | "daily-checkin";

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
