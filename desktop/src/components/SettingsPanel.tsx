import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../i18n";
import type { Settings, AIConfig, QuotaMonitorConfig, QuotaMonitorModel, CareTone, WidgetManifest, WidgetPermission } from "../types";
import {
  AUTO_CHANGE_INTERVALS,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_QUOTA_MONITOR,
  QUOTA_REFRESH_INTERVALS,
  DEFAULT_MOOD_CHECKIN_TIME,
} from "../types";
import { ShortcutRecorder } from "./ShortcutRecorder";
import { useWidgetStore } from "../stores/widgetStore";
import { installOfficialWidget, installWidgetFromPathWithResult, uninstallWidget } from "../services/widgetLoader";
import { detectCurrentCity } from "../services/weatherService";
import { OFFICIAL_WIDGETS } from "../data/officialWidgets";
import {
  getWidgetPermissionDescription,
  getWidgetPermissionLabel,
  getWidgetPermissionRiskLabel,
  hasHighRiskWidgetPermissions,
  WIDGET_PERMISSION_RISK,
} from "../data/widgetPermissions";

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

type SettingsTab = "basics" | "notes" | "care" | "experimental";

interface SettingsPanelProps {
  settings: Settings;
  onClose: () => void;
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
  const [activeTab, setActiveTab] = useState<SettingsTab>("basics");
  const [statusMessage, setStatusMessage] = useState("");

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
  const [detectingCity, setDetectingCity] = useState(false);
  const [weatherCityDraft, setWeatherCityDraft] = useState(settings.weatherCity ?? "");

  useEffect(() => {
    setWeatherCityDraft(settings.weatherCity ?? "");
  }, [settings.weatherCity]);

  const enabledCareCount = [
    settings.restReminderEnabled ?? true,
    settings.eyeCareEnabled ?? true,
    settings.offWorkReminderEnabled ?? true,
    settings.moodCheckinEnabled ?? true,
    settings.weatherCareEnabled ?? true,
  ].filter(Boolean).length;
  const moodCheckinTime = settings.moodCheckinTimes?.[0] ?? DEFAULT_MOOD_CHECKIN_TIME;

  const tabs = useMemo(() => ([
    {
      id: "basics" as const,
      title: lang === "zh" ? "基础" : "Basics",
      desc: lang === "zh" ? "语言、启动、快捷键" : "Language, startup, shortcut",
    },
    {
      id: "notes" as const,
      title: lang === "zh" ? "便签体验" : "Notes",
      desc: lang === "zh" ? "背景、节日" : "Background, holidays",
    },
    {
      id: "care" as const,
      title: lang === "zh" ? "关怀提醒" : "Care",
      desc: lang === "zh" ? `${enabledCareCount} 项已开启` : `${enabledCareCount} enabled`,
    },
    {
      id: "experimental" as const,
      title: lang === "zh" ? "实验功能" : "Experimental",
      desc: lang === "zh" ? "AI、额度、Widget" : "AI, quota, widgets",
    },
  ]), [enabledCareCount, lang]);

  const changeLang = (newLang: "zh" | "en") => {
    setLang(newLang);
    invoke("update_tray_menu", { lang: newLang }).catch(() => {
      setStatusMessage(lang === "zh" ? "托盘菜单更新失败" : "Failed to update tray menu");
    });
  };

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
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

  const commitWeatherCity = () => {
    const next = weatherCityDraft.trim();
    if (next !== (settings.weatherCity ?? "")) {
      onCareSettingsChange?.({ weatherCity: next });
    }
  };

  const detectCity = async () => {
    setDetectingCity(true);
    setStatusMessage("");
    try {
      const city = await detectCurrentCity();
      if (city) {
        setWeatherCityDraft(city);
        onCareSettingsChange?.({ weatherCity: city });
      } else {
        setStatusMessage(lang === "zh" ? "暂时无法定位城市，请手动输入。" : "Could not detect city. Enter it manually.");
      }
    } catch {
      setStatusMessage(lang === "zh" ? "暂时无法定位城市，请手动输入。" : "Could not detect city. Enter it manually.");
    } finally {
      setDetectingCity(false);
    }
  };

  const renderSection = () => {
    if (activeTab === "basics") {
      return (
        <>
          <SettingsSection
            title={lang === "zh" ? "基础" : "Basics"}
            description={lang === "zh" ? "最常用的应用行为设置。" : "Core app behavior you use most often."}
            summary={settings.launchOnStartup ? (lang === "zh" ? "开机启动已开启" : "Startup enabled") : (lang === "zh" ? "开机启动已关闭" : "Startup disabled")}
          />

          <div className="ap-group">
            <div className="ap-group-label">{t.language_label}</div>
            <div className="ap-card">
              <div className="ap-segmented">
                <button className={`ap-segment ${lang === "zh" ? "active" : ""}`} onClick={() => changeLang("zh")}>
                  中文
                </button>
                <button className={`ap-segment ${lang === "en" ? "active" : ""}`} onClick={() => changeLang("en")}>
                  English
                </button>
              </div>
            </div>
          </div>

          <div className="ap-group">
            <div className="ap-group-label">{t.launch_on_startup_title}</div>
            <div className="ap-card">
              <ToggleRow
                label={t.launch_on_startup_label}
                description={t.launch_on_startup_desc}
                checked={settings.launchOnStartup ?? true}
                onChange={(checked) => {
                  setStatusMessage("");
                  onLaunchOnStartupChange?.(checked);
                }}
              />
            </div>
          </div>

          <div className="ap-group">
            <div className="ap-group-label">{t.shortcut_title}</div>
            <div className="ap-card">
              <div className="ap-row flex-col! items-start! gap-2">
                <div className="text-xs text-white/45">{t.shortcut_desc}</div>
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
        </>
      );
    }

    if (activeTab === "notes") {
      return (
        <>
          <SettingsSection
            title={lang === "zh" ? "便签体验" : "Note Experience"}
            description={lang === "zh" ? "控制背景轮换和节日卡片。" : "Control background rotation and holiday cards."}
            summary={lang === "zh" ? "窗口透明度由程序默认控制" : "Window opacity is managed by PinWall"}
          />

          <div className="ap-group">
            <div className="ap-group-label">{lang === "zh" ? "桌面外观" : "Desktop Appearance"}</div>
            <div className="ap-card">
              <ToggleRow
                label={lang === "zh" ? "自动切换背景" : "Auto-change Background"}
                description={lang === "zh"
                  ? `${settings.backgroundImages.length} 张背景图可用`
                  : `${settings.backgroundImages.length} background images available`}
                checked={settings.autoChangeEnabled}
                onChange={(checked) => onAutoChangeSettings(checked, settings.autoChangeInterval)}
              />
              <div className={`ap-ai-fields ${settings.autoChangeEnabled ? "open" : ""}`}>
                <div className="ap-divider" />
                <div className="ap-field">
                  <label className="ap-field-label">{lang === "zh" ? "切换间隔" : "Rotation Interval"}</label>
                  <div className="ap-segmented ap-segmented-wrap mt-1.5">
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

          <div className="ap-group">
            <div className="ap-group-label">{t.holiday_title}</div>
            <div className="ap-card">
              <ToggleRow
                label={t.holiday_cn}
                checked={settings.holidayEnabledCn ?? true}
                onChange={(checked) => onHolidayEnabledCnChange?.(checked)}
              />
              <div className="ap-divider" />
              <ToggleRow
                label={t.holiday_intl}
                checked={settings.holidayEnabledIntl ?? true}
                onChange={(checked) => onHolidayEnabledIntlChange?.(checked)}
              />
            </div>
          </div>
        </>
      );
    }

    if (activeTab === "care") {
      return (
        <>
          <SettingsSection
            title={lang === "zh" ? "关怀提醒" : "Care Reminders"}
            description={lang === "zh" ? "到点后通过右上角通知提醒，不再默认铺成桌面卡片。" : "Care reminders appear as top-right notifications instead of desktop cards."}
            summary={lang === "zh" ? `${enabledCareCount} 项已开启` : `${enabledCareCount} enabled`}
          />

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
                      {tone === "warm" && "Warm"}
                      {tone === "rational" && "Calm"}
                      {tone === "playful" && "Playful"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="ap-group">
            <div className="ap-group-label">{lang === "zh" ? "提醒项目" : "Reminder Items"}</div>
            <div className="ap-card">
              <ToggleRow
                label={t.rest_title}
                description={`${t.rest_interval_label}: ${settings.restInterval ?? 90}${t.rest_minutes}`}
                checked={settings.restReminderEnabled ?? true}
                onChange={(checked) => onCareSettingsChange?.({ restReminderEnabled: checked })}
              />
              <div className="ap-field pt-0">
                <div className="ap-segmented ap-segmented-wrap mt-1.5">
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
              <div className="ap-divider" />
              <ToggleRow
                label={t.eyecare_title}
                description={`${t.eyecare_interval_label}: ${settings.eyeCareInterval ?? 20}${t.rest_minutes}`}
                checked={settings.eyeCareEnabled ?? true}
                onChange={(checked) => onCareSettingsChange?.({ eyeCareEnabled: checked })}
              />
              <div className="ap-field pt-0">
                <div className="ap-segmented ap-segmented-wrap mt-1.5">
                  {[15, 20, 30, 45].map((min) => (
                    <button
                      key={min}
                      className={`ap-segment ${(settings.eyeCareInterval ?? 20) === min ? "active" : ""}`}
                      onClick={() => onCareSettingsChange?.({ eyeCareInterval: min })}
                    >
                      {min}{t.rest_minutes}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ap-divider" />
              <ToggleRow
                label={t.offwork_title}
                description={`${t.offwork_time_label}: ${settings.offWorkTime ?? "18:00"}`}
                checked={settings.offWorkReminderEnabled ?? true}
                onChange={(checked) => onCareSettingsChange?.({ offWorkReminderEnabled: checked })}
              />
              <div className="ap-field pt-0">
                <input
                  className="ap-input mt-1.5"
                  type="time"
                  value={settings.offWorkTime ?? "18:00"}
                  onChange={(e) => onCareSettingsChange?.({ offWorkTime: e.target.value })}
                />
              </div>
              <div className="ap-divider" />
              <ToggleRow
                label={t.mood_title}
                description={lang === "zh" ? `${moodCheckinTime} 提醒` : `Reminds at ${moodCheckinTime}`}
                checked={settings.moodCheckinEnabled ?? true}
                onChange={(checked) => onCareSettingsChange?.({ moodCheckinEnabled: checked })}
              />
              <div className="ap-field pt-0">
                <label className="ap-field-label" htmlFor="mood-checkin-time">
                  {lang === "zh" ? "打卡提醒时间" : "Check-in reminder time"}
                </label>
                <input
                  id="mood-checkin-time"
                  className="ap-input mt-1.5"
                  type="time"
                  value={moodCheckinTime}
                  onChange={(e) => onCareSettingsChange?.({ moodCheckinTimes: [e.target.value || DEFAULT_MOOD_CHECKIN_TIME] })}
                />
              </div>
              <div className="ap-divider" />
              <ToggleRow
                label={t.weather_title}
                description={settings.weatherCity
                  ? `${settings.weatherCity} · ${lang === "zh" ? "实时天气" : "Live weather"}`
                  : (lang === "zh" ? "主窗口显示实时天气，可自动定位或手动输入" : "Shows live weather on the wall. Detect automatically or enter one.")}
                checked={settings.weatherCareEnabled ?? true}
                onChange={(checked) => onCareSettingsChange?.({ weatherCareEnabled: checked })}
              />
              <div className="ap-field pt-0">
                <label className="ap-field-label">{t.weather_city_label}</label>
                <div className="ap-inline-field">
                  <input
                    className="ap-input"
                    type="text"
                    value={weatherCityDraft}
                    onChange={(e) => setWeatherCityDraft(e.target.value)}
                    onBlur={commitWeatherCity}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      }
                    }}
                    placeholder={t.weather_city_placeholder}
                  />
                  <button className="ap-btn ap-inline-btn" type="button" onClick={detectCity} disabled={detectingCity}>
                    {detectingCity
                      ? (lang === "zh" ? "定位中" : "Detecting")
                      : (lang === "zh" ? "自动定位" : "Detect")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <SettingsSection
          title={lang === "zh" ? "实验功能" : "Experimental"}
          description={lang === "zh" ? "AI、额度监控和本地 Widget。后续版本再开放市场生态。" : "AI, quota monitor, and local widgets. Marketplace comes later."}
          summary={lang === "zh" ? "默认折叠高级配置" : "Advanced config stays collapsed"}
        />

        <div className="ap-group">
          <div className="ap-group-label">{t.ai_settings_title}</div>
          <div className="ap-card">
            <ToggleRow
              label={t.ai_enable}
              description={aiConfig.enabled ? aiConfig.model : (lang === "zh" ? "未启用" : "Disabled")}
              checked={aiConfig.enabled}
              onChange={(checked) => updateAI({ enabled: checked })}
            />
            <div className={`ap-ai-fields ${aiConfig.enabled ? "open" : ""}`}>
              <div className="ap-divider" />
              <TextField label={t.ai_endpoint} value={aiConfig.apiEndpoint} onChange={(value) => updateAI({ apiEndpoint: value })} placeholder={t.ai_endpoint_placeholder} />
              <div className="ap-divider" />
              <TextField label={t.ai_api_key} type="password" value={aiConfig.apiKey} onChange={(value) => updateAI({ apiKey: value })} placeholder={t.ai_api_key_placeholder} />
              <div className="ap-divider" />
              <TextField label={t.ai_model} value={aiConfig.model} onChange={(value) => updateAI({ model: value })} placeholder={t.ai_model_placeholder} />
            </div>
          </div>
        </div>

        <div className="ap-group">
          <div className="ap-group-label">{t.quota_title}</div>
          <div className="ap-card">
            <ToggleRow
              label={t.quota_enable}
              description={quotaConfig.enabled ? `${quotaConfig.models.length} ${t.quota_models_monitoring}` : (lang === "zh" ? "未启用" : "Disabled")}
              checked={quotaConfig.enabled}
              onChange={(checked) => updateQuota({ enabled: checked })}
            />
            <div className={`ap-ai-fields ${quotaConfig.enabled ? "open" : ""}`}>
              <div className="ap-divider" />
              <div className="ap-field">
                <label className="ap-field-label">{t.quota_refresh_interval}</label>
                <div className="ap-segmented ap-segmented-wrap mt-1.5">
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

              {quotaConfig.models.map((m) => (
                <div key={m.id}>
                  <div className="ap-divider" />
                  <div className="ap-row justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-white/90">{m.name}</div>
                      <div className="mt-0.5 truncate text-[11px] text-white/40">{m.model} &middot; {m.apiEndpoint}</div>
                    </div>
                    <button className="ap-btn ml-2 cursor-pointer px-2.5 py-1 text-xl text-red-500/90" onClick={() => removeModel(m.id)}>
                      x
                    </button>
                  </div>
                </div>
              ))}

              {showAddForm ? (
                <>
                  <div className="ap-divider" />
                  <div className="ap-field">
                    <label className="ap-field-label">{t.quota_provider}</label>
                    <div className="ap-segmented mt-1.5">
                      {PROVIDER_PRESETS.map((p) => (
                        <button key={p.id} className={`ap-segment ${selectedProvider === p.id ? "active" : ""}`} onClick={() => selectProvider(p.id)}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ap-divider" />
                  <TextField label={t.ai_api_key} type="password" value={newModel.apiKey || ""} onChange={(value) => setNewModel({ ...newModel, apiKey: value })} placeholder="sk-..." />

                  {selectedProvider === "custom" && (
                    <>
                      <div className="ap-divider" />
                      <TextField label={t.quota_model_name} value={newModel.name || ""} onChange={(value) => setNewModel({ ...newModel, name: value })} placeholder="My Model" />
                      <div className="ap-divider" />
                      <TextField label={t.ai_endpoint} value={newModel.apiEndpoint || ""} onChange={(value) => setNewModel({ ...newModel, apiEndpoint: value })} placeholder="https://api.example.com/v1" />
                      <div className="ap-divider" />
                      <TextField label={t.ai_model} value={newModel.model || ""} onChange={(value) => setNewModel({ ...newModel, model: value })} placeholder="model-name" />
                    </>
                  )}

                  {selectedProvider !== "custom" && (
                    <>
                      <div className="ap-divider" />
                      <div className="ap-row gap-2 px-4 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] text-white/35">{t.ai_endpoint}</div>
                          <div className="mt-0.5 truncate text-xs text-white/70">{newModel.apiEndpoint}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-white/35">{t.ai_model}</div>
                          <div className="mt-0.5 text-xs text-white/70">{newModel.model}</div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="ap-divider" />
                  <div className="ap-row gap-2">
                    <button className="ap-btn flex-1 py-1.5 text-xs" onClick={addModel}>{t.quota_confirm_add}</button>
                    <button className="ap-btn flex-1 py-1.5 text-xs opacity-60" onClick={() => { setShowAddForm(false); setNewModel({}); setSelectedProvider("openai"); }}>{t.quota_cancel}</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="ap-divider" />
                  <button className="ap-btn w-full py-2 text-xs" onClick={() => { setShowAddForm(true); selectProvider("openai"); }}>
                    + {t.quota_add_model}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <WidgetExtensionsSection />
      </>
    );
  };

  return (
    <div className="ap-settings ap-settings-shell">
      <aside className="ap-sidebar">
        <div className="ap-sidebar-title">PinWall</div>
        <div className="ap-sidebar-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`ap-sidebar-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.title}</span>
              <small>{tab.desc}</small>
            </button>
          ))}
        </div>
        {statusMessage && <div className="ap-status">{statusMessage}</div>}
      </aside>
      <main className="ap-scroll ap-content">
        <div className="ap-mobile-tabs">
          {tabs.map((tab) => (
            <button key={tab.id} className={`ap-mobile-tab ${activeTab === tab.id ? "active" : ""}`} onClick={() => setActiveTab(tab.id)}>
              {tab.title}
            </button>
          ))}
        </div>
        {renderSection()}
      </main>
    </div>
  );
}

function SettingsSection({
  title,
  description,
  summary,
}: {
  title: string;
  description: string;
  summary?: string;
}) {
  return (
    <div className="ap-section">
      <div>
        <div className="ap-section-title">{title}</div>
        <div className="ap-section-desc">{description}</div>
      </div>
      {summary && <div className="ap-section-summary">{summary}</div>}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="ap-row ap-row-toggle">
      <div className="min-w-0 pr-4">
        <div className="ap-row-label">{label}</div>
        {description && <div className="mt-1 text-xs text-white/45">{description}</div>}
      </div>
      <label className="ap-switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="ap-switch-track"><span className="ap-switch-thumb" /></span>
      </label>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "password";
}) {
  return (
    <div className="ap-field">
      <label className="ap-field-label">{label}</label>
      <input
        className="ap-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
    </div>
  );
}

function WidgetExtensionsSection() {
  const { widgets, toggleWidget } = useWidgetStore();
  const lang = useI18n().lang;
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const installedIds = useMemo(() => new Set(widgets.map((w) => w.manifest.id)), [widgets]);

  const setWidgetStatus = (message: string) => {
    setStatus(message);
  };

  const finishInstall = (manifest: WidgetManifest | null, error?: string) => {
    if (manifest) {
      useWidgetStore.getState().installWidget(manifest);
      setWidgetStatus(lang === "zh" ? `${manifest.name} 已安装` : `${manifest.name} installed`);
      return;
    }
    setWidgetStatus(error || (lang === "zh" ? "安装失败" : "Install failed"));
  };

  const handleOfficialInstall = async (manifest: WidgetManifest) => {
    if (hasHighRiskWidgetPermissions(manifest.permissions)) {
      const highRisk = manifest.permissions
        .filter((permission) => WIDGET_PERMISSION_RISK[permission] === "high")
        .map((permission) => getWidgetPermissionLabel(permission, lang))
        .join(lang === "zh" ? "、" : ", ");
      const accepted = window.confirm(
        lang === "zh"
          ? `${manifest.name} 需要高风险权限：${highRisk}。确认安装？`
          : `${manifest.name} requests high-risk permissions: ${highRisk}. Install it?`
      );
      if (!accepted) {
        setWidgetStatus(lang === "zh" ? "已取消安装" : "Install cancelled");
        return;
      }
    }

    setInstallingId(manifest.id);
    const result = await installOfficialWidget(manifest.id);
    finishInstall(result.manifest, result.error);
    setInstallingId(null);
  };

  const handleInstall = async () => {
    const selected = await open({
      directory: true,
      title: lang === "zh" ? "选择可信小组件目录" : "Select Trusted Widget Directory",
    });
    if (selected) {
      const result = await installWidgetFromPathWithResult(selected as string);
      finishInstall(result.manifest, result.error);
    }
  };

  const handleUninstall = async (id: string) => {
    const ok = await uninstallWidget(id);
    if (ok) {
      useWidgetStore.getState().uninstallWidget(id);
      setWidgetStatus(lang === "zh" ? "小组件已移除" : "Widget removed");
    } else {
      setWidgetStatus(lang === "zh" ? "移除失败" : "Remove failed");
    }
  };

  return (
    <div className="ap-group">
      <div className="ap-group-label">{lang === "zh" ? "官方小组件中心" : "Official Widget Hub"}</div>
      <div className="ap-card">
        <div className="ap-widget-security-note">
          <div className="ap-widget-security-title">
            {lang === "zh" ? "先从官方小组件开始" : "Start with official widgets"}
          </div>
          <div className="ap-widget-security-desc">
            {lang === "zh"
              ? "官方小组件会显示请求的权限；网络、系统、便签和 AI 权限安装前需要确认。"
              : "Official widgets show requested permissions. Network, system, cards, and AI permissions require confirmation before install."}
          </div>
        </div>
        <div className="ap-divider" />

        <div className="ap-widget-catalog">
          {OFFICIAL_WIDGETS.map((item) => (
            <OfficialWidgetCard
              key={item.manifest.id}
              manifest={item.manifest}
              installed={installedIds.has(item.manifest.id)}
              installing={installingId === item.manifest.id}
              lang={lang}
              onInstall={() => handleOfficialInstall(item.manifest)}
            />
          ))}
        </div>

        <div className="ap-divider" />
        <div className="ap-widget-subhead">
          {lang === "zh" ? "已安装小组件" : "Installed Widgets"}
        </div>
        {widgets.length === 0 ? (
          <div className="px-4 py-3 text-sm text-white/45">
            {lang === "zh" ? "尚未安装任何小组件" : "No widgets installed"}
          </div>
        ) : (
          widgets.map((w) => (
            <div key={w.manifest.id} className="ap-widget-installed-row">
              <InstalledWidgetRow
                manifest={w.manifest}
                enabled={w.enabled}
                lang={lang}
                onToggle={(enabled) => toggleWidget(w.manifest.id, enabled)}
                onUninstall={() => handleUninstall(w.manifest.id)}
              />
              {w !== widgets[widgets.length - 1] && <div className="ap-divider" />}
            </div>
          ))
        )}

        <div className="ap-divider" />
        <div className="ap-widget-local-install">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-white/70">
              {lang === "zh" ? "本地安装（高级）" : "Local install (advanced)"}
            </div>
            <div className="mt-1 text-xs text-white/35">
              {lang === "zh" ? "仅安装可信来源的小组件目录。" : "Install only trusted local widget directories."}
            </div>
          </div>
          <button className="ap-btn px-3 py-2 text-xs" onClick={handleInstall}>
            + {lang === "zh" ? "选择目录" : "Choose Folder"}
          </button>
        </div>
        {status && <div className="ap-widget-status">{status}</div>}
      </div>
    </div>
  );
}

function OfficialWidgetCard({
  manifest,
  installed,
  installing,
  lang,
  onInstall,
}: {
  manifest: WidgetManifest;
  installed: boolean;
  installing: boolean;
  lang: "zh" | "en";
  onInstall: () => void;
}) {
  return (
    <div className="ap-widget-catalog-card">
      <div className="ap-widget-card-main">
        <div className="ap-row-label flex items-center gap-2">
          <span>{manifest.name}</span>
          <span className="ap-widget-source-badge">{lang === "zh" ? "官方" : "Official"}</span>
        </div>
        <div className="mt-1 text-xs text-white/45">{manifest.description}</div>
        <div className="mt-1 text-[11px] text-white/35">
          {manifest.category} · v{manifest.version} · {manifest.defaultSize.width}x{manifest.defaultSize.height}
        </div>
        <WidgetPermissionChips permissions={manifest.permissions} lang={lang} />
        <WidgetPermissionDescriptions permissions={manifest.permissions} lang={lang} />
      </div>
      <button className="ap-btn ap-widget-install-btn" disabled={installing} onClick={onInstall}>
        {installing
            ? (lang === "zh" ? "安装中" : "Installing")
            : installed
              ? (lang === "zh" ? "更新" : "Update")
            : (lang === "zh" ? "安装" : "Install")}
      </button>
    </div>
  );
}

function InstalledWidgetRow({
  manifest,
  enabled,
  lang,
  onToggle,
  onUninstall,
}: {
  manifest: WidgetManifest;
  enabled: boolean;
  lang: "zh" | "en";
  onToggle: (enabled: boolean) => void;
  onUninstall: () => void;
}) {
  return (
    <div className="ap-row ap-row-toggle">
      <div className="min-w-0 pr-4">
        <div className="ap-row-label flex items-center gap-2">
          <span>{manifest.name}</span>
          <span className="ap-widget-version-badge">v{manifest.version}</span>
          <span className="ap-widget-source-badge">
            {manifest.type === "official" ? (lang === "zh" ? "官方" : "Official") : (lang === "zh" ? "本地" : "Local")}
          </span>
        </div>
        <div className="mt-1 text-xs text-white/45">{manifest.description}</div>
        <div className="mt-1 text-[11px] text-white/35">
          {manifest.category} · {manifest.defaultSize.width}x{manifest.defaultSize.height}
        </div>
        <WidgetPermissionChips permissions={manifest.permissions} lang={lang} />
      </div>
      <div className="flex items-center gap-3">
        <button className="text-xs text-red-400/70 hover:text-red-400 transition-colors cursor-pointer" onClick={onUninstall}>
          {lang === "zh" ? "移除" : "Remove"}
        </button>
        <label className="ap-switch">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          <span className="ap-switch-track"><span className="ap-switch-thumb" /></span>
        </label>
      </div>
    </div>
  );
}

function WidgetPermissionChips({
  permissions,
  lang,
}: {
  permissions: WidgetPermission[];
  lang: "zh" | "en";
}) {
  return (
    <div className="ap-widget-permissions">
      {permissions.map((permission) => {
        const risk = WIDGET_PERMISSION_RISK[permission];
        return (
          <span key={permission} className={`ap-widget-permission ${risk} ${risk === "high" ? "risk" : ""}`}>
            {getWidgetPermissionLabel(permission, lang)}
          </span>
        );
      })}
    </div>
  );
}

function WidgetPermissionDescriptions({
  permissions,
  lang,
}: {
  permissions: WidgetPermission[];
  lang: "zh" | "en";
}) {
  return (
    <div className="ap-widget-permission-details">
      {permissions.map((permission) => {
        const risk = WIDGET_PERMISSION_RISK[permission];
        return (
          <div key={permission} className="ap-widget-permission-detail">
            <span>{getWidgetPermissionLabel(permission, lang)}</span>
            <small>{getWidgetPermissionRiskLabel(risk, lang)} · {getWidgetPermissionDescription(permission, lang)}</small>
          </div>
        );
      })}
    </div>
  );
}
