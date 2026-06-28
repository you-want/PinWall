import type { WidgetPermission } from "../types";

export type WidgetPermissionRisk = "low" | "medium" | "high";

export const WIDGET_PERMISSION_RISK: Record<WidgetPermission, WidgetPermissionRisk> = {
  theme: "low",
  i18n: "low",
  app: "low",
  storage: "medium",
  notify: "medium",
  events: "medium",
  network: "high",
  system: "high",
  cards: "high",
  ai: "high",
};

export function isHighRiskWidgetPermission(permission: WidgetPermission) {
  return WIDGET_PERMISSION_RISK[permission] === "high";
}

export function hasHighRiskWidgetPermissions(permissions: WidgetPermission[]) {
  return permissions.some(isHighRiskWidgetPermission);
}

export function getWidgetPermissionLabel(permission: WidgetPermission, lang: "zh" | "en"): string {
  const zh: Record<WidgetPermission, string> = {
    storage: "本地存储",
    theme: "主题",
    notify: "通知",
    cards: "便签",
    events: "事件",
    app: "应用信息",
    ai: "AI",
    system: "系统状态",
    network: "网络",
    i18n: "语言",
  };
  const en: Record<WidgetPermission, string> = {
    storage: "Storage",
    theme: "Theme",
    notify: "Notify",
    cards: "Cards",
    events: "Events",
    app: "App Info",
    ai: "AI",
    system: "System",
    network: "Network",
    i18n: "Language",
  };
  return (lang === "zh" ? zh : en)[permission];
}

export function getWidgetPermissionDescription(permission: WidgetPermission, lang: "zh" | "en"): string {
  const zh: Record<WidgetPermission, string> = {
    storage: "保存该小组件自己的本地数据。",
    theme: "读取 PinWall 主题信息，用于匹配桌面外观。",
    notify: "发送小组件相关通知。",
    cards: "读取或操作便签内容。",
    events: "订阅 PinWall 应用事件。",
    app: "读取应用基础信息。",
    ai: "使用 PinWall 已配置的 AI 能力。",
    system: "读取系统状态，例如 CPU、内存或电池。",
    network: "访问外部网络资源。",
    i18n: "读取当前语言以展示对应文案。",
  };
  const en: Record<WidgetPermission, string> = {
    storage: "Stores this widget's own local data.",
    theme: "Reads PinWall theme data to match the desktop.",
    notify: "Sends widget-related notifications.",
    cards: "Reads or modifies notes.",
    events: "Subscribes to PinWall app events.",
    app: "Reads basic app information.",
    ai: "Uses PinWall's configured AI capability.",
    system: "Reads system status such as CPU, memory, or battery.",
    network: "Accesses external network resources.",
    i18n: "Reads the current language for localized text.",
  };
  return (lang === "zh" ? zh : en)[permission];
}

export function getWidgetPermissionRiskLabel(risk: WidgetPermissionRisk, lang: "zh" | "en") {
  if (lang === "zh") {
    return risk === "high" ? "高风险" : risk === "medium" ? "中风险" : "低风险";
  }
  return risk === "high" ? "High" : risk === "medium" ? "Medium" : "Low";
}
