import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import type { Settings, BackgroundImage } from "../types";
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
  onUpload,
  onSetDefault,
  onRemove,
  onClearBackground,
  onOpacityChange,
  onAutoChangeSettings,
}: SettingsPanelProps) {
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

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("zh-CN");
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>设置</h2>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="settings-section">
        <h3>窗口透明度</h3>
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
        <h3>自动切换背景</h3>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={autoChangeEnabled}
            onChange={(e) => handleAutoChangeToggle(e.target.checked)}
            className="toggle-checkbox"
          />
          <span className="toggle-text">启用自动切换</span>
        </label>

        {autoChangeEnabled && (
          <div className="interval-selector">
            <span>切换间隔：</span>
            <select
              value={selectedInterval}
              onChange={(e) => handleIntervalChange(Number(e.target.value))}
              className="interval-select"
            >
              {AUTO_CHANGE_INTERVALS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="settings-section">
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
      </div>
    </div>
  );
}
