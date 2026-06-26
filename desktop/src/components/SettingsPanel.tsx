import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../i18n";
import type { Settings, AIConfig, QuotaMonitorConfig, QuotaMonitorModel, CareTone, WidgetPermission } from "../types";
import {
  AUTO_CHANGE_INTERVALS,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_QUOTA_MONITOR,
  QUOTA_REFRESH_INTERVALS,
} from "../types";
import { ShortcutRecorder } from "./ShortcutRecorder";
import { useWidgetStore } from "../stores/widgetStore";
import { installWidgetFromPath, uninstallWidget } from "../services/widgetLoader";
import { detectCurrentCity } from "../services/weatherService";

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

  const tabs = useMemo(() => ([
    {
      id: "basics" as const,
      title: lang === "zh" ? "基础" : "Basics",
      desc: lang === "zh" ? "语言、启动、快捷键" : "Language, startup, shortcut",
    },
    {
      id: "notes" as const,
      title: lang === "zh" ? "便签体验" : "Notes",
      desc: lang === "zh" ? "透明度、背景、节日" : "Opacity, background, holidays",
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
            description={lang === "zh" ? "控制桌面墙透明度、背景轮换和节日卡片。" : "Control desktop wall opacity, background rotation, and holiday cards."}
            summary={lang === "zh" ? `透明度 ${Math.round((settings.opacity ?? 0.8) * 100)}%` : `Opacity ${Math.round((settings.opacity ?? 0.8) * 100)}%`}
          />

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
                  <span className="opacity-value">{Math.round((settings.opacity ?? 0.8) * 100)}%</span>
                </div>
              </div>
              <div className="ap-divider" />
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
                description={lang === "zh" ? "默认 10:00 与 18:00 提醒" : "Defaults to 10:00 and 18:00"}
                checked={settings.moodCheckinEnabled ?? true}
                onChange={(checked) => onCareSettingsChange?.({ moodCheckinEnabled: checked })}
              />
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
                  <div className="mt-1 text-xs text-white/45">{w.manifest.description}</div>
                  <div className="ap-widget-permissions">
                    {w.manifest.permissions.map((permission) => {
                      const isRisky = HIGH_RISK_WIDGET_PERMISSIONS.has(permission);
                      return (
                        <span key={permission} className={`ap-widget-permission ${isRisky ? "risk" : ""}`}>
                          {getWidgetPermissionLabel(permission, lang)}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button className="text-xs text-red-400/70 hover:text-red-400 transition-colors cursor-pointer" onClick={() => handleUninstall(w.manifest.id)}>
                    {lang === "zh" ? "移除" : "Remove"}
                  </button>
                  <label className="ap-switch">
                    <input type="checkbox" checked={w.enabled} onChange={(e) => toggleWidget(w.manifest.id, e.target.checked)} />
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
          <button className="flex-1 py-2 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/15 text-white/80 transition-colors cursor-pointer" onClick={handleInstall}>
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
