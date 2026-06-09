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
  lastDailyCardDate?: string; // YYYY-MM-DD, tracks last daily card generation
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
  reminderEnabled: boolean;
  reminderTime: number | null;
  reminderFired: boolean;
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
