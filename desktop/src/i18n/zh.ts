export const zh = {
  // Common
  loading: "加载中...",

  // New Card Modal
  new_card: "新建便签",
  title_label: "标题",
  title_placeholder: "输入标题...",
  use_current_time: "使用当前时间作为标题",
  content_label: "内容",
  content_placeholder: "输入内容...",
  color_label: "颜色",
  color_n: "颜色 {{n}}",
  color_random_hint: "未选择颜色，将随机分配",
  reminder_label: "提醒",
  btn_cancel: "取消",
  btn_create: "创建",
  btn_creating: "创建中...",

  // PinCard
  confirm_delete_msg: "确定要删除这个便签吗？",
  confirm_delete_title: "确认删除",
  btn_delete: "删除",
  aria_close: "关闭",
  aria_minimize: "最小化",
  aria_maximize: "最大化",
  aria_restore: "恢复",
  aria_fullscreen: "全屏",

  // Settings Panel
  settings_title: "设置",
  window_opacity: "窗口透明度",
  auto_change_bg: "自动切换背景",
  enable_auto_change: "启用自动切换",
  interval_label: "切换间隔：",
  interval_1min: "1分钟",
  interval_5min: "5分钟",
  interval_10min: "10分钟",
  interval_30min: "30分钟",
  interval_1hour: "1小时",
  interval_6hour: "6小时",
  interval_1day: "1天",
  language_label: "语言 / Language",

  // Floating Buttons
  floating_settings: "设置",
  floating_new_card: "新建卡片 (⌘⇧N)",

  // Card Stack
  stashed_notes: "收纳的便签 ({{n}})",
  aria_collapse: "收起",
  pin_back: "钉回桌面",

  // Wall
  welcome_title: "欢迎来到 PinWall",
  welcome_subtitle: "点击右下角按钮创建便签或打开设置",

  // Settings Page
  developing_title: "正在开发中",
  developing_subtitle: "敬请期待",

  // AI Features
  ai_settings_title: "AI 智能助手",
  ai_enable: "启用 AI 功能",
  ai_endpoint: "API 地址",
  ai_endpoint_placeholder: "https://api.openai.com/v1",
  ai_api_key: "API 密钥",
  ai_api_key_placeholder: "sk-...",
  ai_model: "模型",
  ai_model_placeholder: "gpt-4o-mini",
  ai_generate: "AI 生成",
  ai_generating: "AI 生成中...",
  ai_polish: "AI 润色",
  ai_condense: "AI 精简",
  ai_polishing: "润色中...",
  ai_condensing: "精简中...",
  ai_not_configured: "请先在设置中配置 AI",
  ai_error: "AI 生成失败，请重试",
  ai_daily_title: "每日一句",

  // Notification
  aria_dismiss_reminder: "关闭提醒",
  view_fullscreen: "全屏查看",

  // Card default messages (used when no content provided)
  msg_1: "保持好心情",
  msg_2: "多喝水哦",
  msg_3: "今天辛苦啦",
  msg_4: "早点休息",
  msg_5: "记得吃水果",
  msg_6: "加油，你可以的",
  msg_7: "祝你顺利",
  msg_8: "保持微笑呀",
  msg_9: "愿所有烦恼都消失",
  msg_10: "期待下一次见面",
  msg_11: "梦想总会实现",
  msg_12: "天气冷了，多穿衣服",
  msg_13: "记得给自己放松",
  msg_14: "每天都要元气满满",
  msg_15: "今天也要好好爱自己",
  msg_16: "适当休息一下",
} as const;
