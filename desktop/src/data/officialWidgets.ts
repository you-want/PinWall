import type { WidgetManifest } from "../types";

export interface OfficialWidgetCatalogItem {
  manifest: WidgetManifest;
  sourcePath: string;
}

export const OFFICIAL_WIDGETS: OfficialWidgetCatalogItem[] = [
  {
    sourcePath: "../widgets/widget-clock",
    manifest: {
      id: "com.pinwall.clock",
      name: "时钟小组件",
      description: "美观的桌面时钟，支持模拟/数字模式",
      version: "1.0.0",
      author: "PinWall Team",
      entry: "index.html",
      icon: "icon.svg",
      type: "official",
      category: "utility",
      permissions: ["storage", "theme", "i18n"],
      defaultSize: { width: 200, height: 200 },
      minSize: { width: 140, height: 140 },
      maxSize: { width: 400, height: 400 },
      settings: [
        { key: "mode", label: "显示模式", type: "select", options: ["analog", "digital"], default: "analog" },
        { key: "showSeconds", label: "显示秒", type: "boolean", default: true },
        { key: "showDate", label: "显示日期", type: "boolean", default: true },
        { key: "accentColor", label: "强调色", type: "color", default: "#6366f1" },
      ],
    },
  },
  {
    sourcePath: "../widgets/widget-weather",
    manifest: {
      id: "com.pinwall.weather",
      name: "天气小组件",
      description: "实时天气与未来预报",
      version: "1.0.0",
      author: "PinWall Team",
      entry: "index.html",
      icon: "icon.svg",
      type: "official",
      category: "utility",
      permissions: ["storage", "theme", "i18n", "network"],
      defaultSize: { width: 260, height: 200 },
      minSize: { width: 200, height: 160 },
      maxSize: { width: 400, height: 350 },
      settings: [
        { key: "city", label: "城市", type: "text", default: "" },
        { key: "unit", label: "温度单位", type: "select", options: ["celsius", "fahrenheit"], default: "celsius" },
      ],
    },
  },
  {
    sourcePath: "../widgets/widget-pomodoro",
    manifest: {
      id: "com.pinwall.pomodoro",
      name: "番茄钟",
      description: "专注工作番茄钟，提升效率",
      version: "1.0.0",
      author: "PinWall Team",
      entry: "index.html",
      icon: "icon.svg",
      type: "official",
      category: "productivity",
      permissions: ["storage", "theme", "i18n", "notify"],
      defaultSize: { width: 220, height: 260 },
      minSize: { width: 180, height: 220 },
      maxSize: { width: 350, height: 400 },
      settings: [
        { key: "workMinutes", label: "工作时长(分钟)", type: "number", default: 25, min: 5, max: 60 },
        { key: "breakMinutes", label: "休息时长(分钟)", type: "number", default: 5, min: 1, max: 30 },
      ],
    },
  },
  {
    sourcePath: "../widgets/widget-system-monitor",
    manifest: {
      id: "com.pinwall.system-monitor",
      name: "系统监控",
      description: "实时 CPU/内存/电池状态监控",
      version: "1.0.0",
      author: "PinWall Team",
      entry: "index.html",
      icon: "icon.svg",
      type: "official",
      category: "utility",
      permissions: ["storage", "theme", "i18n", "system"],
      defaultSize: { width: 200, height: 240 },
      minSize: { width: 160, height: 200 },
      maxSize: { width: 350, height: 400 },
      settings: [
        { key: "refreshInterval", label: "刷新间隔(秒)", type: "number", default: 3, min: 1, max: 30 },
      ],
    },
  },
  {
    sourcePath: "../widgets/widget-music",
    manifest: {
      id: "com.pinwall.music",
      name: "音乐控制",
      description: "控制当前播放的音乐",
      version: "1.0.0",
      author: "PinWall Team",
      entry: "index.html",
      icon: "icon.svg",
      type: "official",
      category: "entertainment",
      permissions: ["theme", "i18n", "system"],
      defaultSize: { width: 240, height: 160 },
      minSize: { width: 200, height: 120 },
      maxSize: { width: 380, height: 250 },
      settings: [],
    },
  },
];
