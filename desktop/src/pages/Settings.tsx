import { useState, useEffect, useCallback } from "react";
import { webviewWindow } from "@tauri-apps/api";
import { listen } from "@tauri-apps/api/event";
import { useI18n } from "../i18n";
import { SettingsPanel } from "../components/SettingsPanel";
import type { Settings as SettingsType, AIConfig, QuotaMonitorConfig, CareTone, UpdateChannel } from "../types";
import { DEFAULT_GLOBAL_SHORTCUT } from "../types";
import { getSettings, updateAutoChangeSettings, updateAIConfig, updateQuotaMonitorConfig, updateHolidayEnabledCn, updateHolidayEnabledIntl, updateGlobalShortcut, updateCareTone, updateCareSettings, updateAutoCheckUpdates, updateUpdateChannel } from "../services/storage";
import { setLaunchOnStartup, syncLaunchOnStartupSetting } from "../services/autostart";
import { invoke } from "@tauri-apps/api/core";

function Settings() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<SettingsType | null>(null);

  const [saveFailed, setSaveFailed] = useState(false);
  const [credentialFailed, setCredentialFailed] = useState(false);
  const reportFailure = useCallback((error: unknown) => {
    setSaveFailed(true);
    setCredentialFailed(typeof error === "string" && error.startsWith("credentials_"));
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      setSettings(await syncLaunchOnStartupSetting());
      setSaveFailed(false);
    } catch (error: unknown) {
      reportFailure(error);
    }
  }, [reportFailure]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => {
    const unlisten = listen("settings:changed", () => {
      getSettings().then(setSettings).catch(reportFailure);
    });
    return () => { void unlisten.then(stop => stop()); };
  }, [reportFailure]);

  const save = useCallback(async (operation: () => Promise<SettingsType>) => {
    try {
      setSettings(await operation());
      setSaveFailed(false);
    } catch (error: unknown) {
      reportFailure(error);
    }
  }, [reportFailure]);

  const handleClose = useCallback(async () => {
    try {
      const win = webviewWindow.getCurrentWebviewWindow();
      await win.hide();
    } catch {
      window.close();
    }
  }, []);

  const handleAutoChange = (enabled: boolean, interval: number) => save(() => updateAutoChangeSettings(enabled, interval));
  const handleAIConfigChange = (config: AIConfig) => save(() => updateAIConfig(config));
  const handleQuotaMonitorChange = (config: QuotaMonitorConfig) => save(() => updateQuotaMonitorConfig(config));
  const handleHolidayEnabledCnChange = (enabled: boolean) => save(() => updateHolidayEnabledCn(enabled));
  const handleHolidayEnabledIntlChange = (enabled: boolean) => save(() => updateHolidayEnabledIntl(enabled));
  const handleLaunchOnStartupChange = (enabled: boolean) => save(() => setLaunchOnStartup(enabled));
  const handleCareToneChange = (tone: CareTone) => save(() => updateCareTone(tone));
  const handleCareSettingsChange = (partial: Partial<SettingsType>) => save(() => updateCareSettings(partial));
  const handleAutoCheckUpdatesChange = (enabled: boolean) => save(() => updateAutoCheckUpdates(enabled));
  const handleUpdateChannelChange = (channel: UpdateChannel) => save(() => updateUpdateChannel(channel));

  const handleShortcutChange = (newShortcut: string) => save(async () => {
    const current = await getSettings();
    const oldShortcut = current.globalShortcut ?? DEFAULT_GLOBAL_SHORTCUT;
    if (oldShortcut === newShortcut) return current;
    await invoke("update_shortcut_display", { oldShortcut, newShortcut });
    try {
      return await updateGlobalShortcut(newShortcut);
    } catch (error: unknown) {
      // Keep the registered shortcut consistent if persistence fails.
      await invoke("update_shortcut_display", { oldShortcut: newShortcut, newShortcut: oldShortcut });
      throw error;
    }
  });

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
        {saveFailed ? <div role="alert"><p>{credentialFailed ? t.credentials_unavailable : t.settings_save_failed}</p><button className="btn-v2" onClick={() => void loadSettings()}>{t.startup_retry}</button></div> : t.loading}
      </div>
    );
  }

  return (
    <>
    {saveFailed && <div className="settings-storage-error" role="alert">{credentialFailed ? t.credentials_unavailable : t.settings_save_failed}</div>}
    <SettingsPanel
      settings={settings}
      onClose={handleClose}
      onAutoChangeSettings={handleAutoChange}
      onAIConfigChange={handleAIConfigChange}
      onQuotaMonitorChange={handleQuotaMonitorChange}
      onHolidayEnabledCnChange={handleHolidayEnabledCnChange}
      onHolidayEnabledIntlChange={handleHolidayEnabledIntlChange}
      onShortcutChange={handleShortcutChange}
      onLaunchOnStartupChange={handleLaunchOnStartupChange}
      onCareToneChange={handleCareToneChange}
      onCareSettingsChange={handleCareSettingsChange}
      onAutoCheckUpdatesChange={handleAutoCheckUpdatesChange}
      onUpdateChannelChange={handleUpdateChannelChange}
    />
    </>
  );
}

export default Settings;
