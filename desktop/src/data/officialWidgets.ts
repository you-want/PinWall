import type { WidgetManifest } from "../types";

export interface OfficialWidgetCatalogItem {
  manifest: WidgetManifest;
  sourcePath: string;
}

export const OFFICIAL_WIDGETS: OfficialWidgetCatalogItem[] = [
  { sourcePath: "resources/widgets/widget-maintenance", manifest: {"id": "com.pinwall.maintenance", "name": "系统维护 / Maintenance", "description": "预览后移入废纸篓、管理 Homebrew 和自己的进程。 / Review trash operations, Homebrew formulas and your processes.", "version": "1.0.0", "author": "PinWall Team", "entry": "index.html", "icon": "icon.svg", "type": "official", "category": "productivity", "permissions": ["maintenance", "i18n"], "defaultEnabled": false, "defaultSize": {"width": 260, "height": 240}, "minSize": {"width": 210, "height": 210}} },
  { sourcePath: "resources/widgets/widget-video-tools", manifest: {"id": "com.pinwall.video-tools", "name": "视频与录屏 / Video Tools", "description": "本地视频裁剪压缩与无声屏幕录制。 / Local video trimming, compression and silent screen recording.", "version": "1.0.0", "author": "PinWall Team", "entry": "index.html", "icon": "icon.svg", "type": "official", "category": "productivity", "permissions": ["video", "i18n"], "defaultEnabled": false, "defaultSize": {"width": 260, "height": 240}, "minSize": {"width": 210, "height": 210}} },
  { sourcePath: "resources/widgets/widget-input-tools", manifest: {"id": "com.pinwall.input-tools", "name": "输入增强 / Input Tools", "description": "按需滚轮方向、方向键映射和文本触发词展开。 / Opt-in scroll directions, arrow shortcuts and text expansion.", "version": "1.0.0", "author": "PinWall Team", "entry": "index.html", "icon": "icon.svg", "type": "official", "category": "productivity", "permissions": ["input", "i18n"], "defaultEnabled": false, "defaultSize": {"width": 260, "height": 240}, "minSize": {"width": 210, "height": 210}} },
  { sourcePath: "resources/widgets/widget-music", manifest: {"id": "com.pinwall.music", "name": "音频与媒体 / Audio & Media", "description": "音频设备、音量和运行中的播放器。 / Audio devices, volume and running music players.", "version": "2.0.0", "author": "PinWall Team", "entry": "index.html", "icon": "icon.svg", "type": "official", "category": "productivity", "permissions": ["audio", "i18n"], "defaultEnabled": false, "defaultSize": {"width": 260, "height": 240}, "minSize": {"width": 210, "height": 210}} },
  { sourcePath: "resources/widgets/widget-window-tools", manifest: {"id": "com.pinwall.window-tools", "name": "窗口工具 / Window Tools", "description": "窗口布局、切换和按需预览。 / Arrange, switch and preview application windows.", "version": "1.0.0", "author": "PinWall Team", "entry": "index.html", "icon": "icon.svg", "type": "official", "category": "productivity", "permissions": ["windows", "i18n"], "defaultEnabled": false, "defaultSize": {"width": 260, "height": 240}, "minSize": {"width": 210, "height": 210}} },

  { sourcePath: "resources/widgets/widget-local-tools", manifest: {"id": "com.pinwall.local-tools", "name": "本地工具 / Local Tools", "description": "链接清理、计算器和可搜索的文本片段库。 / Clean links, calculate and keep searchable text snippets locally.", "version": "1.0.0", "author": "PinWall Team", "entry": "index.html", "icon": "icon.svg", "type": "official", "category": "productivity", "permissions": ["utilities", "i18n"], "defaultEnabled": false, "defaultSize": {"width": 260, "height": 240}, "minSize": {"width": 210, "height": 210}} },
  {
    sourcePath: "resources/widgets/widget-file-shelf",
    manifest: {
      "id": "com.pinwall.file-shelf",
      "name": "文件暂存 / File Shelf",
      "description": "保存所选文件的引用，保留七天；原文件不移动。 / Keep selected file references for seven days. Originals stay in place.",
      "version": "1.0.0",
      "author": "PinWall Team",
      "entry": "index.html",
      "icon": "icon.svg",
      "type": "official",
      "category": "productivity",
      "permissions": [
        "shelf",
        "i18n"
      ],
      "defaultEnabled": false,
      "defaultSize": {
        "width": 260,
        "height": 240
      },
      "minSize": {
        "width": 210,
        "height": 210
      }
    }
  },
  {
    sourcePath: "resources/widgets/widget-screen-tools",
    manifest: {
      "id": "com.pinwall.screen-tools",
      "name": "屏幕工具 / Screen Tools",
      "description": "选择屏幕区域，本地识字、取色或保存截图。 / Select a screen region, recognize text or pick a pixel color locally.",
      "version": "1.0.0",
      "author": "PinWall Team",
      "entry": "index.html",
      "icon": "icon.svg",
      "type": "official",
      "category": "productivity",
      "permissions": [
        "screenCapture",
        "i18n"
      ],
      "defaultEnabled": false,
      "defaultSize": {
        "width": 260,
        "height": 240
      },
      "minSize": {
        "width": 210,
        "height": 210
      }
    }
  },
  {
    sourcePath: "resources/widgets/widget-ocr-note",
    manifest: {
      "id": "com.pinwall.ocr-note",
      "name": "图片识字 / Image to Note",
      "description": "图片文字本地识别并转为便签 / Recognize image text locally and create a note",
      "version": "1.0.0",
      "author": "PinWall Team",
      "entry": "index.html",
      "icon": "icon.svg",
      "type": "official",
      "category": "productivity",
      "permissions": [
        "ocr",
        "i18n"
      ],
      "defaultEnabled": false,
      "defaultSize": {
        "width": 260,
        "height": 240
      },
      "minSize": {
        "width": 210,
        "height": 210
      }
    },
  },
  {
    sourcePath: "resources/widgets/widget-image-tools",
    manifest: {
      "id": "com.pinwall.image-tools",
      "name": "图片工具 / Image Tools",
      "description": "本地压缩、缩放与格式转换 / Local resize, compression and conversion",
      "version": "1.0.0",
      "author": "PinWall Team",
      "entry": "index.html",
      "icon": "icon.svg",
      "type": "official",
      "category": "productivity",
      "permissions": [
        "images",
        "i18n"
      ],
      "defaultEnabled": false,
      "defaultSize": {
        "width": 260,
        "height": 240
      },
      "minSize": {
        "width": 210,
        "height": 210
      }
    },
  },
  {
    sourcePath: "resources/widgets/widget-clipboard-history",
    manifest: {
      "id": "com.pinwall.clipboard-history",
      "name": "剪贴板历史 / Clipboard History",
      "description": "主动开启的本次会话文本历史 / Opt-in text history for this app session",
      "version": "1.0.0",
      "author": "PinWall Team",
      "entry": "index.html",
      "icon": "icon.svg",
      "type": "official",
      "category": "productivity",
      "permissions": [
        "clipboardHistory",
        "i18n"
      ],
      "defaultEnabled": false,
      "defaultSize": {
        "width": 260,
        "height": 240
      },
      "minSize": {
        "width": 210,
        "height": 210
      }
    },
  },

  {
    sourcePath: "resources/widgets/widget-clipboard-note",
    manifest: {
      id: "com.pinwall.clipboard-note",
      name: "剪贴板转便签 / Clipboard to Note",
      description: "确认读取一次文本，预览后创建便签 / Confirm one text read, preview and create a note",
      version: "1.0.0",
      author: "PinWall Team",
      entry: "index.html",
      icon: "icon.svg",
      type: "official",
      category: "productivity",
      permissions: ["clipboard", "i18n"],
      defaultEnabled: false,
      defaultSize: { width: 260, height: 240 },
      minSize: { width: 210, height: 210 }
    },
  },
  {
    sourcePath: "resources/widgets/widget-keep-awake",
    manifest: {
      id: "com.pinwall.keep-awake",
      name: "防休眠 / Keep Awake",
      description: "按需阻止 Mac 空闲休眠 / Prevent idle sleep for a duration you choose",
      version: "1.0.0",
      author: "PinWall Team",
      entry: "index.html",
      icon: "icon.svg",
      type: "official",
      category: "utility",
      permissions: ["power", "i18n"],
      defaultEnabled: false,
      defaultSize: { width: 260, height: 300 },
      minSize: { width: 200, height: 280 },
    },
  },
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
    sourcePath: "resources/widgets/widget-system-monitor",
    manifest: {
      id: "com.pinwall.system-monitor",
      name: "系统监控 / System Monitor",
      description: "按需查看 CPU、内存与电池 / CPU, memory and battery on demand",
      version: "2.0.0",
      author: "PinWall Team",
      entry: "index.html",
      icon: "icon.svg",
      type: "official",
      category: "utility",
      permissions: ["system", "i18n"],
      defaultEnabled: false,
      defaultSize: { width: 260, height: 360 },
      minSize: { width: 210, height: 300 }
    },
  },

];
