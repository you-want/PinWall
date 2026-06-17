import { useState, useEffect, useCallback } from "react";
import { webviewWindow } from "@tauri-apps/api";
import { useI18n } from "../i18n";
import { SettingsPanel } from "../components/SettingsPanel";
import type { Settings as SettingsType, AIConfig, QuotaMonitorConfig } from "../types";
import { DEFAULT_GLOBAL_SHORTCUT } from "../types";
import { getSettings, saveSettings, updateAIConfig, updateQuotaMonitorConfig, updateHolidayEnabledCn, updateHolidayEnabledIntl, updateGlobalShortcut } from "../services/storage";
import { invoke } from "@tauri-apps/api/core";

function Settings() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<SettingsType | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const handleClose = useCallback(async () => {
    try {
      const win = webviewWindow.getCurrentWebviewWindow();
      await win.hide();
    } catch {
      window.close();
    }
  }, []);

  const handleOpacityChange = useCallback(async (opacity: number) => {
    const s = await getSettings();
    s.opacity = Math.max(0, Math.min(1, opacity));
    await saveSettings(s);
    setSettings(s);
  }, []);

  const handleAutoChange = useCallback(async (enabled: boolean, interval: number) => {
    const s = await getSettings();
    s.autoChangeEnabled = enabled;
    s.autoChangeInterval = interval;
    await saveSettings(s);
    setSettings(s);
  }, []);

  const handleAIConfigChange = useCallback(async (config: AIConfig) => {
    const s = await updateAIConfig(config);
    setSettings(s);
  }, []);

  const handleQuotaMonitorChange = useCallback(async (config: QuotaMonitorConfig) => {
    const s = await updateQuotaMonitorConfig(config);
    setSettings(s);
  }, []);

  const handleHolidayEnabledCnChange = useCallback(async (enabled: boolean) => {
    const s = await updateHolidayEnabledCn(enabled);
    setSettings(s);
  }, []);

  const handleHolidayEnabledIntlChange = useCallback(async (enabled: boolean) => {
    const s = await updateHolidayEnabledIntl(enabled);
    setSettings(s);
  }, []);

  const handleShortcutChange = useCallback(async (newShortcut: string) => {
    const s = await getSettings();
    const oldShortcut = s.globalShortcut ?? DEFAULT_GLOBAL_SHORTCUT;

    if (oldShortcut === newShortcut) return;

    try {
      // Delegate to Rust: unregister old, register new, update tray display
      await invoke("update_shortcut_display", {
        oldShortcut,
        newShortcut,
      });
      // Save to settings
      const updated = await updateGlobalShortcut(newShortcut);
      setSettings(updated);
    } catch (err) {
      console.error("Failed to update shortcut:", err);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        await handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  if (!settings) {
    return (
      <div style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(28,28,30,0.92)",
        color: "rgba(255,255,255,0.5)",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      }}>
        {t.loading}
      </div>
    );
  }

  return (
    <SettingsPanel
      settings={settings}
      onClose={handleClose}
      onOpacityChange={handleOpacityChange}
      onAutoChangeSettings={handleAutoChange}
      onAIConfigChange={handleAIConfigChange}
      onQuotaMonitorChange={handleQuotaMonitorChange}
      onHolidayEnabledCnChange={handleHolidayEnabledCnChange}
      onHolidayEnabledIntlChange={handleHolidayEnabledIntlChange}
      onShortcutChange={handleShortcutChange}
    />
  );
}

export default Settings;
