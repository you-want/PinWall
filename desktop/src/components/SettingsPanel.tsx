import { useState } from "react";
// import { convertFileSrc } from "@tauri-apps/api/core";
// import { open } from "@tauri-apps/plugin-shell";
import { useI18n } from "../i18n";
import type { Settings, 
  // BackgroundImage 
} from "../types";
import { AUTO_CHANGE_INTERVALS } from "../types";

interface SettingsPanelProps {
  settings: Settings;
  onClose: () => void;
  onUpload: () => void;
  onSetDefault: (id: string) => void;
  onRemove: (id: string) => void;
  onClearBackground: () => void;
  onOpacityChange: (opacity: number) => void;
  onAutoChangeSettings: (enabled: boolean, interval: number) => void;
}

export function SettingsPanel({
  settings,
  onClose,
  // onUpload,
  // onSetDefault,
  // onRemove,
  // onClearBackground,
  onOpacityChange,
  onAutoChangeSettings,
}: SettingsPanelProps) {
  const { t, lang, setLang } = useI18n();
  const [selectedInterval, setSelectedInterval] = useState(settings.autoChangeInterval);
  const [autoChangeEnabled, setAutoChangeEnabled] = useState(settings.autoChangeEnabled);

  const handleIntervalChange = (value: number) => {
    setSelectedInterval(value);
    onAutoChangeSettings(autoChangeEnabled, value);
  };

  const handleAutoChangeToggle = (enabled: boolean) => {
    setAutoChangeEnabled(enabled);
    onAutoChangeSettings(enabled, selectedInterval);
  };

  // Map interval value → i18n label
  const intervalLabelMap: Record<number, string> = {
    1:    t.interval_1min,
    5:    t.interval_5min,
    10:   t.interval_10min,
    30:   t.interval_30min,
    60:   t.interval_1hour,
    360:  t.interval_6hour,
    1440: t.interval_1day,
  };

  // const formatDate = (timestamp: number) => {
  //   return new Date(timestamp).toLocaleString(lang === "zh" ? "zh-CN" : "en-US");
  // };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>{t.settings_title}</h2>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="settings-section">
        <h3>{t.language_label}</h3>
        <div className="language-switcher" style={{ display: "flex", gap: "8px" }}>
          <button
            className={`btn-lang ${lang === "zh" ? "active" : ""}`}
            onClick={() => setLang("zh")}
            style={{
              padding: "6px 16px",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: lang === "zh" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.85)",
              cursor: "pointer",
              fontWeight: lang === "zh" ? 600 : 400,
              transition: "all 0.15s",
            }}
          >
            中文
          </button>
          <button
            className={`btn-lang ${lang === "en" ? "active" : ""}`}
            onClick={() => setLang("en")}
            style={{
              padding: "6px 16px",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: lang === "en" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.85)",
              cursor: "pointer",
              fontWeight: lang === "en" ? 600 : 400,
              transition: "all 0.15s",
            }}
          >
            English
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t.window_opacity}</h3>
        <div className="opacity-control">
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(settings.opacity * 100)}
            onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
            className="opacity-slider"
          />
          <span className="opacity-value">{Math.round(settings.opacity * 100)}%</span>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t.auto_change_bg}</h3>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={autoChangeEnabled}
            onChange={(e) => handleAutoChangeToggle(e.target.checked)}
            className="toggle-checkbox"
          />
          <span className="toggle-text">{t.enable_auto_change}</span>
        </label>

        {autoChangeEnabled && (
          <div className="interval-selector">
            <span>{t.interval_label}</span>
            <select
              value={selectedInterval}
              onChange={(e) => handleIntervalChange(Number(e.target.value))}
              className="interval-select"
            >
              {AUTO_CHANGE_INTERVALS.map((option) => (
                <option key={option.value} value={option.value}>
                  {intervalLabelMap[option.value] ?? option.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* <div className="settings-section">
        <div className="upload-section">
          <h3>背景图管理</h3>
          <button className="upload-btn" onClick={onUpload}>
            上传背景图
          </button>
        </div>

        <div className={`image-item ${settings.currentImageId === null ? "active" : ""}`}>
          <div className="image-thumbnail empty-thumbnail">
            <span className="empty-icon">◎</span>
          </div>
          <div className="image-info">
            <span className="image-name">无背景（显示桌面）</span>
            <span className="image-date">直接显示桌面背景</span>
          </div>
          <div className="image-actions">
            {settings.currentImageId !== null && (
              <button
                className="action-btn default-btn"
                onClick={onClearBackground}
              >
                设置为默认
              </button>
            )}
          </div>
        </div>

        {settings.backgroundImages.length === 0 ? (
          <p className="empty-state">暂无背景图，请上传</p>
        ) : (
          <div className="image-list">
            {settings.backgroundImages.map((image: BackgroundImage) => (
              <div
                key={image.id}
                className={`image-item ${settings.currentImageId === image.id ? "active" : ""}`}
              >
                <div className="image-thumbnail">
                  <img src={convertFileSrc(image.path)} alt={image.fileName} />
                </div>
                <div className="image-info">
                  <span className="image-name">{image.fileName}</span>
                  <span className="image-date">{formatDate(image.createdAt)}</span>
                </div>
                <div className="image-actions">
                  {settings.currentImageId !== image.id && (
                    <button
                      className="action-btn default-btn"
                      onClick={() => onSetDefault(image.id)}
                    >
                      设置为默认
                    </button>
                  )}
                  {settings.backgroundImages.length > 1 && (
                    <button
                      className="action-btn remove-btn"
                      onClick={() => onRemove(image.id)}
                    >
                      删除
                    </button>
                  )}
                  <button
                    className="action-btn open-btn"
                    onClick={() => open(image.path)}
                  >
                    打开位置
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div> */}
    </div>
  );
}
