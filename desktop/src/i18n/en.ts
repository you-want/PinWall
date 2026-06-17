export const en = {
  // Common
  loading: "Loading...",

  // New Card Modal
  new_card: "New Note",
  title_label: "Title",
  title_placeholder: "Enter title...",
  use_current_time: "Use current time as title",
  content_label: "Content",
  content_placeholder: "Enter content...",
  color_label: "Color",
  color_n: "Color {{n}}",
  color_random_hint: "No color selected — will be random",
  reminder_label: "Reminder",
  btn_cancel: "Cancel",
  btn_create: "Create",
  btn_creating: "Creating...",

  // PinCard
  confirm_delete_msg: "Are you sure you want to delete this note?",
  confirm_delete_title: "Confirm Delete",
  btn_delete: "Delete",
  aria_close: "Close",
  aria_minimize: "Minimize",
  aria_maximize: "Maximize",
  aria_restore: "Restore",
  aria_fullscreen: "Fullscreen",

  // Settings Panel
  settings_title: "Settings",
  window_opacity: "Window Opacity",
  auto_change_bg: "Auto-change Background",
  enable_auto_change: "Enable auto-change",
  interval_label: "Interval: ",
  interval_1min: "1 minute",
  interval_5min: "5 minutes",
  interval_10min: "10 minutes",
  interval_30min: "30 minutes",
  interval_1hour: "1 hour",
  interval_6hour: "6 hours",
  interval_1day: "1 day",
  language_label: "Language / 语言",

  // Floating Buttons
  floating_settings: "Settings",
  floating_new_card: "New Card (⌘⇧N)",

  // Card Stack
  stashed_notes: "Stashed Notes ({{n}})",
  aria_collapse: "Collapse",
  pin_back: "Pin back to desktop",

  // Wall
  welcome_title: "Welcome to PinWall",
  welcome_subtitle: "Tap the button in the bottom-right to create a note or open settings",

  // Settings Page
  developing_title: "In Development",
  developing_subtitle: "Stay tuned",

  // AI Features
  ai_settings_title: "AI Assistant",
  ai_enable: "Enable AI Features",
  ai_endpoint: "API Endpoint",
  ai_endpoint_placeholder: "https://api.openai.com/v1",
  ai_api_key: "API Key",
  ai_api_key_placeholder: "sk-...",
  ai_model: "Model",
  ai_model_placeholder: "gpt-4o-mini",
  ai_generate: "AI Generate",
  ai_generating: "Generating...",
  ai_polish: "AI Polish",
  ai_condense: "AI Condense",
  ai_polishing: "Polishing...",
  ai_condensing: "Condensing...",
  ai_not_configured: "Please configure AI in settings",
  ai_error: "AI generation failed, please retry",
  ai_daily_title: "Daily Quote",

  // Notification
  aria_dismiss_reminder: "Dismiss reminder",
  view_fullscreen: "View Fullscreen",

  // Quota Monitor
  quota_title: "Quota Monitor",
  quota_enable: "Enable Quota Monitor",
  quota_provider: "Provider",
  quota_add_model: "Add Model",
  quota_confirm_add: "Confirm",
  quota_cancel: "Cancel",
  quota_model_name: "Model Name",
  quota_refresh_interval: "Refresh Interval",
  quota_remaining: "Remaining",
  quota_used: "Used",
  quota_total: "Total",
  quota_last_update: "Last Updated",
  quota_refresh: "Refresh",
  quota_error: "Query Failed",
  quota_no_models: "No models configured",
  quota_models_monitoring: "models monitored",

  // Holiday Greetings
  holiday_title: "Holiday Greetings",
  holiday_cn: "Chinese Holidays",
  holiday_intl: "International Holidays",

  // Global Shortcut
  shortcut_title: "Global Shortcut",
  shortcut_desc: "Show or hide the PinWall window",
  shortcut_record: "Record Shortcut",
  shortcut_recording: "Press keys...",
  shortcut_reset: "Reset to Default",
  shortcut_saved: "Saved",
  shortcut_need_modifier: "At least one modifier key is required",
  shortcut_hint: "Tip: Press Esc to cancel recording",

  // Launch On Startup
  launch_on_startup_title: "Launch On Startup",
  launch_on_startup_label: "Launch PinWall when the system starts",
  launch_on_startup_desc: "Enabled by default and starts quietly after you log in",

  // Card Types
  card_type_note: "Note",
  card_type_reminder: "One-time Reminder",
  card_type_daily_checkin: "Daily Check-in",
  card_type_label: "Type",
  checkin_time_label: "Reminder Time",
  btn_checkin: "Check in",
  btn_checked_in: "Checked in",

  // Card default messages (used when no content provided)
  msg_1: "Stay in a good mood",
  msg_2: "Drink more water",
  msg_3: "You worked hard today",
  msg_4: "Get some rest early",
  msg_5: "Don't forget to eat fruit",
  msg_6: "You can do it!",
  msg_7: "Wishing you all the best",
  msg_8: "Keep smiling",
  msg_9: "May all worries fade away",
  msg_10: "Looking forward to next time",
  msg_11: "Dreams do come true",
  msg_12: "It's getting cold, dress warm",
  msg_13: "Remember to take a break",
  msg_14: "Stay energetic every day",
  msg_15: "Love yourself today",
  msg_16: "Take a little rest",
} as const;
