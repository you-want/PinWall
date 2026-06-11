import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import type { Settings, AIConfig, QuotaMonitorConfig, QuotaMonitorModel } from "../types";
import { DEFAULT_QUOTA_MONITOR, QUOTA_REFRESH_INTERVALS, DEFAULT_GLOBAL_SHORTCUT } from "../types";
import { ShortcutRecorder } from "./ShortcutRecorder";

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
  onUpload: () => void;
  onSetDefault: (id: string) => void;
  onRemove: (id: string) => void;
  onClearBackground: () => void;
  onOpacityChange: (opacity: number) => void;
  onAutoChangeSettings: (enabled: boolean, interval: number) => void;
  onAIConfigChange?: (config: AIConfig) => void;
  onQuotaMonitorChange?: (config: QuotaMonitorConfig) => void;
  onHolidayEnabledChange?: (enabled: boolean) => void;
  onShortcutChange?: (shortcut: string) => void;
}

export function SettingsPanel({
  settings,
  onAIConfigChange,
  onQuotaMonitorChange,
  onHolidayEnabledChange,
  onShortcutChange,
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
            <div className="ap-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
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

        {/* ── Holiday Greetings ── */}
        <div className="ap-group">
          <div className="ap-group-label">{t.holiday_enable}</div>
          <div className="ap-card">
            <div className="ap-row ap-row-toggle">
              <span className="ap-row-label">{t.holiday_enable}</span>
              <label className="ap-switch">
                <input
                  type="checkbox"
                  checked={settings.holidayEnabled ?? true}
                  onChange={(e) => onHolidayEnabledChange?.(e.target.checked)}
                />
                <span className="ap-switch-track">
                  <span className="ap-switch-thumb" />
                </span>
              </label>
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
                <div className="ap-segmented" style={{ marginTop: 6 }}>
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
                  <div className="ap-row" style={{ justifyContent: "space-between" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>
                        {m.name}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.model} &middot; {m.apiEndpoint}
                      </div>
                    </div>
                    <button
                      className="ap-btn"
                      style={{ marginLeft: 8, padding: "4px 10px", fontSize: 11, color: "rgba(255,59,48,0.9)" }}
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
                    <div className="ap-segmented" style={{ marginTop: 6 }}>
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
                      <div className="ap-row" style={{ padding: "8px 16px", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{t.ai_endpoint}</div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{newModel.apiEndpoint}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{t.ai_model}</div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{newModel.model}</div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Action buttons */}
                  <div className="ap-divider" />
                  <div className="ap-row" style={{ gap: 8 }}>
                    <button
                      className="ap-btn"
                      style={{ flex: 1, padding: "6px 0", fontSize: 12 }}
                      onClick={addModel}
                    >
                      {t.quota_confirm_add}
                    </button>
                    <button
                      className="ap-btn"
                      style={{ flex: 1, padding: "6px 0", fontSize: 12, opacity: 0.6 }}
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
                    className="ap-btn"
                    style={{ width: "100%", padding: "8px 0", fontSize: 12 }}
                    onClick={() => { setShowAddForm(true); selectProvider("openai"); }}
                  >
                    + {t.quota_add_model}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
