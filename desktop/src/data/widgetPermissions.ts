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
  power: "high",
  clipboard: "high",
  ocr: "high",
  images: "high",
  clipboardHistory: "high",
  shelf: "high",
  utilities: "high",
  audio: "high",
  windows: "high",
  input: "high",
  video: "high",
  screenCapture: "high",
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
    power: "防休眠",
    clipboard: "剪贴板转便签",
    ocr: "本地图片识字",
    images: "图片选择和导出",
    clipboardHistory: "剪贴板历史",
    shelf: "所选文件引用",
    audio: "系统音频与媒体控制",
    input: "全局输入监听与注入",
    video: "视频文件与无声录屏",
    windows: "窗口布局与预览",
    utilities: "本地文本片段与主动复制",
    screenCapture: "区域截图与取色",
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
    power: "Keep awake",
    clipboard: "Clipboard to note",
    ocr: "Local image recognition",
    images: "Image import and export",
    clipboardHistory: "Clipboard history",
    shelf: "Selected file references",
    audio: "Audio and media control",
    input: "Global input monitoring and injection",
    video: "Video files and silent screen recording",
    windows: "Window layout and previews",
    utilities: "Local snippets and explicit copy",
    screenCapture: "Screen region capture",
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
    power: "在你设定的时长内阻止 Mac 因空闲休眠；不会阻止合盖或手动休眠。",
    ocr: "由你选择图片，在本机识别并预览后创建便签；图片和文字不发给插件。",
    images: "在宿主选择图片并导出到你选择的位置；保留原图，不向插件提供文件路径或图像。",
    audio: "仅从宿主操作音频设备、音量、静音和运行中的 Music/Spotify。媒体控制另需自动化授权。每应用路由另需系统音频捕获授权，主动开始才处理所选进程的声音；不录制麦克风、不保存音频。",
    video: "宿主选择本地视频后裁剪、压缩或静音另存，不覆盖原文件；主动开始才录制主屏，最长五分钟、不采集音频。视频和路径不交给插件，不上传；临时副本在关闭或停用时清理。",
    input: "主动开始才监听并修改滚轮/键盘事件，支持应用排除。文本展开仅匹配有限触发词，不保存按键、跳过安全输入。关闭面板仍运行；停止、停用或退出才释放。需系统辅助功能和输入监控授权。",
    windows: "宿主枚举应用窗口并通过辅助功能权限调整布局、切换及恢复；仅点击预览时请求屏幕权限。窗口标题和图像不进入插件。",
    utilities: "在宿主处理你输入的链接和算式；片段保存在本机，点击复制才写入剪贴板。不读取剪贴板、不监听键盘、不上传。",
    shelf: "仅保存你选择或拖入的文件引用，保留七天；可定位或另存副本。路径仅保存在本机宿主，不交给插件；清空不会删除原文件。",
    screenCapture: "点击宿主按钮后请求 macOS 屏幕录制权限，仅截取你选择的区域。本地识字、取色或导出；复制仅写入已取出的颜色值。",
    clipboardHistory: "由你主动开始记录新复制的纯文本；历史仅在内存，退出或停用清空。私密标记会被跳过，但无法识别未标记的敏感文本。",
    clipboard: "打开宿主导入窗口，由你确认读取一次文本、预览并创建便签；不持续监听，也不向插件提供文本或已有便签。",
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
    power: "Prevents idle system sleep for a duration you choose. Closing the lid or sleeping manually still works.",
    ocr: "Recognizes text in an image you choose locally. Review before creating a note; images and text never reach the widget.",
    images: "Selects an image and exports to a location you choose. Original files stay intact; paths and pixels never reach the widget.",
    audio: "Host controls for audio devices, volume, mute and running Music/Spotify. Media control also needs Automation permission. Per-app routing separately needs System Audio Recording permission and processes only an explicitly selected process. No microphone recording or audio files.",
    video: "Host selects local videos for trimming, compression or muted export without replacing originals. Only Start records the main display, up to five minutes, without audio. Paths and video never reach the widget or network; private copies clear on close or disable.",
    input: "Starts global scroll/key monitoring and injection only after an explicit Start, with app exclusions. Text expansion keeps only bounded trigger candidates, skips secure input and never stores keystrokes. Closing the panel keeps it running; Stop, disable or quit releases it. Requires Accessibility and Input Monitoring.",
    windows: "Host enumerates application windows and uses Accessibility to arrange, switch and restore them. Screen permission is requested only for previews. Titles and images stay outside the plugin.",
    utilities: "Processes links and expressions you enter in the host. Snippets persist locally; only Copy writes the clipboard. No clipboard reads, input monitoring or uploads.",
    shelf: "Keeps references to files you select or drop for seven days. Reveal or save a copy; paths stay in the local host. Clearing never deletes originals.",
    screenCapture: "Requests macOS Screen Recording permission after a host click and captures a region you select. Local OCR, pixel color or export; copying writes only the sampled color.",
    clipboardHistory: "Records newly copied text after you explicitly start. History stays in memory and clears on exit or disable. Marked private text is skipped; unmarked sensitive text may be recorded.",
    clipboard: "Opens a host dialog for one confirmed text read, preview and note creation. No history, clipboard text or existing notes are exposed to the widget.",
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
