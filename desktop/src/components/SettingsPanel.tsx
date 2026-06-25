import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../i18n";
import type { Settings, AIConfig, QuotaMonitorConfig, QuotaMonitorModel, CareTone, WidgetPermission } from "../types";
import {
  AUTO_CHANGE_INTERVALS,
  DEFAULT_QUOTA_MONITOR,
  QUOTA_REFRESH_INTERVALS,
  DEFAULT_GLOBAL_SHORTCUT,
} from "../types";
import { ShortcutRecorder } from "./ShortcutRecorder";
import { useWidgetStore } from "../stores/widgetStore";
import { installWidgetFromPath, uninstallWidget } from "../services/widgetLoader";

// ── Provider presets ──────────────────────────────────────
const PROVIDER_PRESETS = [
  {
    id: "openai",
    name: "OpenAI",
    apiEndpoint: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    apiEndpoint: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
  },
  {
    id: "custom",
    name: "Custom",
    apiEndpoint: "",
    defaultModel: "",
  },
] as const;

interface SettingsPanelProps {
  settings: Settings;
  onClose: () => void;
  onOpacityChange: (opacity: number) => void;
  onAutoChangeSettings: (enabled: boolean, interval: number) => void;
  onAIConfigChange?: (config: AIConfig) => void;
  onQuotaMonitorChange?: (config: QuotaMonitorConfig) => void;
  onHolidayEnabledCnChange?: (enabled: boolean) => void;
  onHolidayEnabledIntlChange?: (enabled: boolean) => void;
  onShortcutChange?: (shortcut: string) => void;
  onLaunchOnStartupChange?: (enabled: boolean) => void;
  onCareToneChange?: (tone: CareTone) => void;
  onCareSettingsChange?: (partial: Partial<Settings>) => void;
}

export function SettingsPanel({
  settings,
  onOpacityChange,
  onAutoChangeSettings,
  onAIConfigChange,
  onQuotaMonitorChange,
  onHolidayEnabledCnChange,
  onHolidayEnabledIntlChange,
  onShortcutChange,
  onLaunchOnStartupChange,
  onCareToneChange,
  onCareSettingsChange,
}: SettingsPanelProps) {
  const { t, lang, setLang } = useI18n();

  const changeLang = (newLang: "zh" | "en") => {
    setLang(newLang);
    invoke("update_tray_menu", { lang: newLang }).catch(console.error);
  };

  const [aiConfig, setAIConfig] = useState<AIConfig>(settings.ai ?? {
    enabled: false,
    apiEndpoint: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
  });

  const [quotaConfig, setQuotaConfig] = useState<QuotaMonitorConfig>(
    settings.quotaMonitor ?? { ...DEFAULT_QUOTA_MONITOR },
  );

  const [newModel, setNewModel] = useState<Partial<QuotaMonitorModel>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("openai");

  const updateAI = (partial: Partial<AIConfig>) => {
    const next = { ...aiConfig, ...partial };
    setAIConfig(next);
    onAIConfigChange?.(next);
  };

  const updateQuota = (partial: Partial<QuotaMonitorConfig>) => {
    const next = { ...quotaConfig, ...partial };
    setQuotaConfig(next);
    onQuotaMonitorChange?.(next);
  };

  const selectProvider = (providerId: string) => {
    setSelectedProvider(providerId);
    const preset = PROVIDER_PRESETS.find((p) => p.id === providerId);
    if (preset && preset.id !== "custom") {
      setNewModel({
        ...newModel,
        name: preset.name,
        apiEndpoint: preset.apiEndpoint,
        model: preset.defaultModel,
      });
    }
  };

  const addModel = () => {
    if (!newModel.name || !newModel.apiEndpoint || !newModel.apiKey) return;
    const model: QuotaMonitorModel = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: newModel.name,
      apiEndpoint: newModel.apiEndpoint,
      apiKey: newModel.apiKey,
      model: newModel.model || "",
    };
    updateQuota({ models: [...quotaConfig.models, model] });
    setNewModel({});
    setShowAddForm(false);
    setSelectedProvider("openai");
  };

  const removeModel = (id: string) => {
    updateQuota({ models: quotaConfig.models.filter((m) => m.id !== id) });
  };

  return (
    <div className="ap-settings">
      {/* Scrollable content */}
      <div className="ap-scroll">

        <SettingsSection
          title={lang === "zh" ? "基础" : "Basics"}
          description={lang === "zh" ? "语言、启动和全局快捷键。" : "Language, startup, and global shortcut."}
        />

        {/* ── Language ── */}
        <div className="ap-group">
          <div className="ap-group-label">{t.language_label}</div>
          <div className="ap-card">
            <div className="ap-segmented">
              <button
                className={`ap-segment ${lang === "zh" ? "active" : ""}`}
                onClick={() => changeLang("zh")}
              >
                中文
              </button>
              <button
                className={`ap-segment ${lang === "en" ? "active" : ""}`}
                onClick={() => changeLang("en")}
              >
                English
              </button>
            </div>
          </div>
        </div>

        {/* ── Global Shortcut ── */}
        <div className="ap-group">
          <div className="ap-group-label">{t.shortcut_title}</div>
          <div className="ap-card">
            <div className="ap-row flex-col! items-start! gap-2">
              <div className="text-xs text-white/45">
                {t.shortcut_desc}
              </div>
              <ShortcutRecorder
                value={settings.globalShortcut ?? DEFAULT_GLOBAL_SHORTCUT}
                defaultValue={DEFAULT_GLOBAL_SHORTCUT}
                onChange={(shortcut) => onShortcutChange?.(shortcut)}
                onReset={() => onShortcutChange?.(DEFAULT_GLOBAL_SHORTCUT)}
                t={t as unknown as Record<string, string>}
              />
            </div>
          </div>
        </div>

        {/* ── Launch On Startup ── */}
        <div className="ap-group">
          <div className="ap-group-label">{t.launch_on_startup_title}</div>
          <div className="ap-card">
            <div className="ap-row ap-row-toggle">
              <div className="min-w-0 pr-4">
                <div className="ap-row-label">{t.launch_on_startup_label}</div>
                <div className="mt-1 text-xs text-white/45">
                  {t.launch_on_startup_desc}
                </div>
              </div>
              <label className="ap-switch">
                <input
                  type="checkbox"
                  checked={settings.launchOnStartup ?? true}
                  onChange={(e) => onLaunchOnStartupChange?.(e.target.checked)}
                />
                <span className="ap-switch-track">
                  <span className="ap-switch-thumb" />
                </span>
              </label>
            </div>
          </div>
        </div>

        <SettingsSection
          title={lang === "zh" ? "便签体验" : "Note Experience"}
          description={lang === "zh" ? "透明度、背景轮换和节日卡片。" : "Opacity, background rotation, and holiday cards."}
        />

        {/* ── Desktop Appearance ── */}
        <div className="ap-group">
          <div className="ap-group-label">{lang === "zh" ? "桌面外观" : "Desktop Appearance"}</div>
          <div className="ap-card">
            <div className="ap-field">
              <label className="ap-field-label">{t.window_opacity}</label>
              <div className="opacity-control">
                <input
                  className="opacity-slider"
                  type="range"
                  min="0.2"
                  max="1"
                  step="0.05"
                  value={settings.opacity ?? 0.8}
                  onChange={(e) => onOpacityChange(Number(e.target.value))}
                />
                <span className="opacity-value">
                  {Math.round((settings.opacity ?? 0.8) * 100)}%
                </span>
              </div>
            </div>
            <div className="ap-divider" />
            <div className="ap-row ap-row-toggle">
              <div className="min-w-0 pr-4">
                <div className="ap-row-label">{lang === "zh" ? "自动切换背景" : "Auto-change Background"}</div>
                <div className="mt-1 text-xs text-white/45">
                  {lang === "zh"
                    ? `${settings.backgroundImages.length} 张背景图可用`
                    : `${settings.backgroundImages.length} background images available`}
                </div>
              </div>
              <label className="ap-switch">
                <input
                  type="checkbox"
                  checked={settings.autoChangeEnabled}
                  onChange={(e) => onAutoChangeSettings(e.target.checked, settings.autoChangeInterval)}
                />
                <span className="ap-switch-track">
                  <span className="ap-switch-thumb" />
                </span>
              </label>
            </div>
            <div className={`ap-ai-fields ${settings.autoChangeEnabled ? "open" : ""}`}>
              <div className="ap-divider" />
              <div className="ap-field">
                <label className="ap-field-label">{lang === "zh" ? "切换间隔" : "Rotation Interval"}</label>
                <div className="ap-segmented mt-1.5">
                  {AUTO_CHANGE_INTERVALS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`ap-segment ${settings.autoChangeInterval === opt.value ? "active" : ""}`}
                      onClick={() => onAutoChangeSettings(settings.autoChangeEnabled, opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Holiday Greetings ── */}
        <div className="ap-group">
          <div className="ap-group-label">{t.holiday_title}</div>
          <div className="ap-card">
            <div className="ap-row ap-row-toggle">
              <span className="ap-row-label">{t.holiday_cn}</span>
              <label className="ap-switch">
                <input
                  type="checkbox"
                  checked={settings.holidayEnabledCn ?? true}
                  onChange={(e) => onHolidayEnabledCnChange?.(e.target.checked)}
                />
                <span className="ap-switch-track">
                  <span className="ap-switch-thumb" />
                </span>
              </label>
            </div>
            <div className="ap-divider" />
            <div className="ap-row ap-row-toggle">
              <span className="ap-row-label">{t.holiday_intl}</span>
              <label className="ap-switch">
                <input
                  type="checkbox"
                  checked={settings.holidayEnabledIntl ?? true}
                  onChange={(e) => onHolidayEnabledIntlChange?.(e.target.checked)}
                />
                <span className="ap-switch-track">
                  <span className="ap-switch-thumb" />
                </span>
              </label>
            </div>
          </div>
        </div>

        <SettingsSection
          title={lang === "zh" ? "关怀提醒" : "Care Reminders"}
          description={lang === "zh" ? "喝水、休息、护眼、下班和心情提醒。" : "Hydration, rest, eye care, off-work, and mood reminders."}
        />

        {/* ── Care Tone ── */}
        <div className="ap-group">
          <div className="ap-group-label">{t.care_tone_title}</div>
          <div className="ap-card">
            <div className="ap-row flex-col! items-start! gap-2">
              <div className="text-xs text-white/45">{t.care_tone_desc}</div>
              <div className="ap-segmented w-full">
                {(["warm", "rational", "playful"] as const).map((tone) => (
                  <button
                    key={tone}
                    className={`ap-segment flex-1 ${settings.careTone === tone ? "active" : ""}`}
                    onClick={() => onCareToneChange?.(tone)}
                  >
                    {tone === "warm" && "🌸 "}{t.care_tone_warm}
                    {tone === "rational" && " 🧭 "}{t.care_tone_rational}
                    {tone === "playful" && " 🎈 "}{t.care_tone_playful}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Rest Reminder ── */}
        <div className="ap-group">
          <div className="ap-group-label">{t.rest_title}</div>
          <div className="ap-card">
            <div className="ap-row ap-row-toggle">
              <span className="ap-row-label">{t.rest_enabled}</span>
              <label className="ap-switch">
                <input
                  type="checkbox"
                  checked={settings.restReminderEnabled ?? true}
                  onChange={(e) => onCareSettingsChange?.({ restReminderEnabled: e.target.checked })}
                />
                <span className="ap-switch-track"><span className="ap-switch-thumb" /></span>
              </label>
            </div>
            <div className="ap-divider" />
            <div className="ap-field px-4 py-2">
              <label className="ap-field-label">{t.rest_interval_label}</label>
              <div className="ap-segmented mt-1.5">
                {[30, 45, 60, 90, 120].map((min) => (
                  <button
                    key={min}
                    className={`ap-segment ${(settings.restInterval ?? 90) === min ? "active" : ""}`}
                    onClick={() => onCareSettingsChange?.({ restInterval: min })}
                  >
                    {min}{t.rest_minutes}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Off-work Care ── */}
        <div className="ap-group">
          <div className="ap-group-label">{t.offwork_title}</div>
          <div className="ap-card">
            <div className="ap-row ap-row-toggle">
              <span className="ap-row-label">{t.offwork_enabled}</span>
              <label className="ap-switch">
                <input
                  type="checkbox"
                  checked={settings.offWorkReminderEnabled ?? true}
                  onChange={(e) => onCareSettingsChange?.({ offWorkReminderEnabled: e.target.checked })}
                />
                <span className="ap-switch-track"><span className="ap-switch-thumb" /></span>
              </label>
            </div>
            <div className="ap-divider" />
            <div className="ap-field px-4 py-2">
              <label className="ap-field-label">{t.offwork_time_label}</label>
              <input
                className="ap-input mt-1.5"
                type="time"
                value={settings.offWorkTime ?? "18:00"}
                onChange={(e) => onCareSettingsChange?.({ offWorkTime: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* ── Eye Care ── */}
        <div className="ap-group">
          <div className="ap-group-label">{t.eyecare_title}</div>
          <div className="ap-card">
            <div className="ap-row ap-row-toggle">
              <span className="ap-row-label">{t.eyecare_enabled}</span>
              <label className="ap-switch">
                <input
                  type="checkbox"
                  checked={settings.eyeCareEnabled ?? true}
                  onChange={(e) => onCareSettingsChange?.({ eyeCareEnabled: e.target.checked })}
                />
                <span className="ap-switch-track"><span className="ap-switch-thumb" /></span>
              </label>
            </div>
          </div>
        </div>

        {/* ── Mood Check-in ── */}
        <div className="ap-group">
          <div className="ap-group-label">{t.mood_title}</div>
          <div className="ap-card">
            <div className="ap-row ap-row-toggle">
              <span className="ap-row-label">{t.mood_enabled}</span>
              <label className="ap-switch">
                <input
                  type="checkbox"
                  checked={settings.moodCheckinEnabled ?? true}
                  onChange={(e) => onCareSettingsChange?.({ moodCheckinEnabled: e.target.checked })}
                />
                <span className="ap-switch-track"><span className="ap-switch-thumb" /></span>
              </label>
            </div>
          </div>
        </div>

        {/* ── Weather Care ── */}
        <div className="ap-group">
          <div className="ap-group-label">{t.weather_title}</div>
          <div className="ap-card">
            <div className="ap-row ap-row-toggle">
              <span className="ap-row-label">{t.weather_enabled}</span>
              <label className="ap-switch">
                <input
                  type="checkbox"
                  checked={settings.weatherCareEnabled ?? true}
                  onChange={(e) => onCareSettingsChange?.({ weatherCareEnabled: e.target.checked })}
                />
                <span className="ap-switch-track"><span className="ap-switch-thumb" /></span>
              </label>
            </div>
            <div className="ap-divider" />
            <div className="ap-field px-4 py-2">
              <label className="ap-field-label">{t.weather_city_label}</label>
              <input
                className="ap-input mt-1.5"
                type="text"
                value={settings.weatherCity ?? ""}
                onChange={(e) => onCareSettingsChange?.({ weatherCity: e.target.value })}
                placeholder={t.weather_city_placeholder}
              />
            </div>
          </div>
        </div>

        <SettingsSection
          title={lang === "zh" ? "实验功能" : "Experimental"}
          description={lang === "zh" ? "AI、额度监控和本地 Widget。后续版本再开放市场生态。" : "AI, quota monitor, and local widgets. Marketplace comes later."}
        />

        {/* ── AI Assistant ── */}
        <div className="ap-group">
          <div className="ap-group-label">{t.ai_settings_title}</div>
          <div className="ap-card">
            {/* Toggle row */}
            <div className="ap-row ap-row-toggle">
              <span className="ap-row-label">{t.ai_enable}</span>
              <label className="ap-switch">
                <input
                  type="checkbox"
                  checked={aiConfig.enabled}
                  onChange={(e) => updateAI({ enabled: e.target.checked })}
                />
                <span className="ap-switch-track">
                  <span className="ap-switch-thumb" />
                </span>
              </label>
            </div>

            {/* AI config fields (animated reveal) */}
            <div className={`ap-ai-fields ${aiConfig.enabled ? "open" : ""}`}>
              <div className="ap-divider" />
              <div className="ap-field">
                <label className="ap-field-label">{t.ai_endpoint}</label>
                <input
                  className="ap-input"
                  type="text"
                  value={aiConfig.apiEndpoint}
                  onChange={(e) => updateAI({ apiEndpoint: e.target.value })}
                  placeholder={t.ai_endpoint_placeholder}
                  spellCheck={false}
                />
              </div>
              <div className="ap-divider" />
              <div className="ap-field">
                <label className="ap-field-label">{t.ai_api_key}</label>
                <input
                  className="ap-input"
                  type="password"
                  value={aiConfig.apiKey}
                  onChange={(e) => updateAI({ apiKey: e.target.value })}
                  placeholder={t.ai_api_key_placeholder}
                  spellCheck={false}
                />
              </div>
              <div className="ap-divider" />
              <div className="ap-field">
                <label className="ap-field-label">{t.ai_model}</label>
                <input
                  className="ap-input"
                  type="text"
                  value={aiConfig.model}
                  onChange={(e) => updateAI({ model: e.target.value })}
                  placeholder={t.ai_model_placeholder}
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Quota Monitor ── */}
        <div className="ap-group">
          <div className="ap-group-label">{t.quota_title}</div>
          <div className="ap-card">
            {/* Toggle row */}
            <div className="ap-row ap-row-toggle">
              <span className="ap-row-label">{t.quota_enable}</span>
              <label className="ap-switch">
                <input
                  type="checkbox"
                  checked={quotaConfig.enabled}
                  onChange={(e) => updateQuota({ enabled: e.target.checked })}
                />
                <span className="ap-switch-track">
                  <span className="ap-switch-thumb" />
                </span>
              </label>
            </div>

            {/* Quota config fields (animated reveal) */}
            <div className={`ap-ai-fields ${quotaConfig.enabled ? "open" : ""}`}>
              {/* Refresh interval */}
              <div className="ap-divider" />
              <div className="ap-field">
                <label className="ap-field-label">{t.quota_refresh_interval}</label>
                <div className="ap-segmented mt-1.5">
                  {QUOTA_REFRESH_INTERVALS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`ap-segment ${quotaConfig.refreshInterval === opt.value ? "active" : ""}`}
                      onClick={() => updateQuota({ refreshInterval: opt.value })}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model list */}
              {quotaConfig.models.map((m) => (
                <div key={m.id}>
                  <div className="ap-divider" />
                  <div className="ap-row justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-white/90">
                        {m.name}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-white/40">
                        {m.model} &middot; {m.apiEndpoint}
                      </div>
                    </div>
                    <button
                      className="ap-btn ml-2 cursor-pointer px-2.5 py-1 text-xl text-red-500/90"
                      onClick={() => removeModel(m.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}

              {quotaConfig.models.length === 0 && !showAddForm && (
                <div className="ap-divider" />
              )}

              {/* Add model form */}
              {showAddForm ? (
                <>
                  {/* Provider selector */}
                  <div className="ap-divider" />
                  <div className="ap-field">
                    <label className="ap-field-label">{t.quota_provider}</label>
                    <div className="ap-segmented mt-1.5">
                      {PROVIDER_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          className={`ap-segment ${selectedProvider === p.id ? "active" : ""}`}
                          onClick={() => selectProvider(p.id)}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* API Key (always manual) */}
                  <div className="ap-divider" />
                  <div className="ap-field">
                    <label className="ap-field-label">{t.ai_api_key}</label>
                    <input
                      className="ap-input"
                      type="password"
                      value={newModel.apiKey || ""}
                      onChange={(e) => setNewModel({ ...newModel, apiKey: e.target.value })}
                      placeholder="sk-..."
                      spellCheck={false}
                    />
                  </div>

                  {/* Custom provider: show all fields for manual input */}
                  {selectedProvider === "custom" && (
                    <>
                      <div className="ap-divider" />
                      <div className="ap-field">
                        <label className="ap-field-label">{t.quota_model_name}</label>
                        <input
                          className="ap-input"
                          type="text"
                          value={newModel.name || ""}
                          onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                          placeholder="My Model"
                          spellCheck={false}
                        />
                      </div>
                      <div className="ap-divider" />
                      <div className="ap-field">
                        <label className="ap-field-label">{t.ai_endpoint}</label>
                        <input
                          className="ap-input"
                          type="text"
                          value={newModel.apiEndpoint || ""}
                          onChange={(e) => setNewModel({ ...newModel, apiEndpoint: e.target.value })}
                          placeholder="https://api.example.com/v1"
                          spellCheck={false}
                        />
                      </div>
                      <div className="ap-divider" />
                      <div className="ap-field">
                        <label className="ap-field-label">{t.ai_model}</label>
                        <input
                          className="ap-input"
                          type="text"
                          value={newModel.model || ""}
                          onChange={(e) => setNewModel({ ...newModel, model: e.target.value })}
                          placeholder="model-name"
                          spellCheck={false}
                        />
                      </div>
                    </>
                  )}

                  {/* Preset providers: show auto-filled info (read-only display) */}
                  {selectedProvider !== "custom" && (
                    <>
                      <div className="ap-divider" />
                      <div className="ap-row gap-2 px-4 py-2">
                        <div className="flex-1">
                          <div className="text-[11px] text-white/35">{t.ai_endpoint}</div>
                          <div className="mt-0.5 text-xs text-white/70">{newModel.apiEndpoint}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-white/35">{t.ai_model}</div>
                          <div className="mt-0.5 text-xs text-white/70">{newModel.model}</div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Action buttons */}
                  <div className="ap-divider" />
                  <div className="ap-row gap-2">
                    <button
                      className="ap-btn flex-1 py-1.5 text-xs"
                      onClick={addModel}
                    >
                      {t.quota_confirm_add}
                    </button>
                    <button
                      className="ap-btn flex-1 py-1.5 text-xs opacity-60"
                      onClick={() => { setShowAddForm(false); setNewModel({}); setSelectedProvider("openai"); }}
                    >
                      {t.quota_cancel}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="ap-divider" />
                  <button
                    className="ap-btn w-full py-2 text-xs"
                    onClick={() => { setShowAddForm(true); selectProvider("openai"); }}
                  >
                    + {t.quota_add_model}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Widget Extensions ── */}
        <WidgetExtensionsSection />

      </div>
    </div>
  );
}

function SettingsSection({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="ap-section">
      <div className="ap-section-title">{title}</div>
      <div className="ap-section-desc">{description}</div>
    </div>
  );
}

const HIGH_RISK_WIDGET_PERMISSIONS = new Set<WidgetPermission>([
  "cards",
  "ai",
  "system",
  "network",
]);

function getWidgetPermissionLabel(permission: WidgetPermission, lang: "zh" | "en"): string {
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

function WidgetExtensionsSection() {
  const { widgets, toggleWidget } = useWidgetStore();
  const lang = useI18n().lang;

  const handleInstall = async () => {
    const selected = await open({
      directory: true,
      title: lang === "zh" ? "选择 Widget 目录" : "Select Widget Directory",
    });
    if (selected) {
      const manifest = await installWidgetFromPath(selected as string);
      if (manifest) {
        useWidgetStore.getState().installWidget(manifest);
      }
    }
  };

  const handleUninstall = async (id: string) => {
    const ok = await uninstallWidget(id);
    if (ok) {
      useWidgetStore.getState().uninstallWidget(id);
    }
  };

  return (
    <div className="ap-group">
      <div className="ap-group-label">{lang === "zh" ? "小组件扩展" : "Widget Extensions"}</div>
      <div className="ap-card">
        <div className="ap-widget-security-note">
          <div className="ap-widget-security-title">
            {lang === "zh" ? "仅安装可信来源的小组件" : "Install widgets only from trusted sources"}
          </div>
          <div className="ap-widget-security-desc">
            {lang === "zh"
              ? "本地小组件运行在桌面宿主中；网络、系统、便签和 AI 权限会访问更敏感的能力。"
              : "Local widgets run inside the desktop host. Network, system, cards, and AI permissions can access more sensitive capabilities."}
          </div>
        </div>
        <div className="ap-divider" />
        {widgets.length === 0 ? (
          <div className="px-4 py-3 text-sm text-white/45">
            {lang === "zh" ? "尚未安装任何小组件" : "No widgets installed"}
          </div>
        ) : (
          widgets.map((w) => (
            <div key={w.manifest.id}>
              <div className="ap-row ap-row-toggle">
                <div className="min-w-0 pr-4">
                  <div className="ap-row-label flex items-center gap-2">
                    <span>{w.manifest.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                      v{w.manifest.version}
                    </span>
                    {w.manifest.type === "official" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300">
                        {lang === "zh" ? "官方" : "Official"}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    {w.manifest.description}
                  </div>
                  <div className="ap-widget-permissions">
                    {w.manifest.permissions.map((permission) => {
                      const isRisky = HIGH_RISK_WIDGET_PERMISSIONS.has(permission);
                      return (
                        <span
                          key={permission}
                          className={`ap-widget-permission ${isRisky ? "risk" : ""}`}
                        >
                          {getWidgetPermissionLabel(permission, lang)}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    className="text-xs text-red-400/70 hover:text-red-400 transition-colors cursor-pointer"
                    onClick={() => handleUninstall(w.manifest.id)}
                  >
                    {lang === "zh" ? "移除" : "Remove"}
                  </button>
                  <label className="ap-switch">
                    <input
                      type="checkbox"
                      checked={w.enabled}
                      onChange={(e) => toggleWidget(w.manifest.id, e.target.checked)}
                    />
                    <span className="ap-switch-track"><span className="ap-switch-thumb" /></span>
                  </label>
                </div>
              </div>
              {w !== widgets[widgets.length - 1] && <div className="ap-divider" />}
            </div>
          ))
        )}
        <div className="ap-divider" />
        <div className="px-4 py-3 flex gap-2">
          <button
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/15 text-white/80 transition-colors cursor-pointer"
            onClick={handleInstall}
          >
            + {lang === "zh" ? "本地安装" : "Local Install"}
          </button>
          <span className="flex items-center rounded-lg bg-white/5 px-3 text-xs text-white/35">
            {lang === "zh" ? "市场实验中" : "Marketplace experimental"}
          </span>
        </div>
      </div>
    </div>
  );
}
