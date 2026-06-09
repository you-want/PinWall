import { useState } from "react";
import { useI18n } from "../i18n";
import type { Settings, AIConfig } from "../types";

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
}

export function SettingsPanel({
  settings,
  onAIConfigChange,
}: SettingsPanelProps) {
  const { t, lang, setLang } = useI18n();

  const [aiConfig, setAIConfig] = useState<AIConfig>(settings.ai ?? {
    enabled: false,
    apiEndpoint: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
  });

  const updateAI = (partial: Partial<AIConfig>) => {
    const next = { ...aiConfig, ...partial };
    setAIConfig(next);
    onAIConfigChange?.(next);
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
                onClick={() => setLang("zh")}
              >
                中文
              </button>
              <button
                className={`ap-segment ${lang === "en" ? "active" : ""}`}
                onClick={() => setLang("en")}
              >
                English
              </button>
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

      </div>
    </div>
  );
}
