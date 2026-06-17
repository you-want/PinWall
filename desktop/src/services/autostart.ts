import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import type { Settings } from "../types";
import { getSettings, saveSettings, updateLaunchOnStartup } from "./storage";

export async function syncLaunchOnStartupSetting(settings?: Settings): Promise<Settings> {
  const currentSettings = settings ?? await getSettings();
  const normalizedSettings =
    currentSettings.launchOnStartup === undefined
      ? { ...currentSettings, launchOnStartup: true }
      : currentSettings;

  if (normalizedSettings !== currentSettings) {
    await saveSettings(normalizedSettings);
  }

  const systemEnabled = await isEnabled();
  if (systemEnabled !== normalizedSettings.launchOnStartup) {
    if (normalizedSettings.launchOnStartup) {
      await enable();
    } else {
      await disable();
    }
  }

  return normalizedSettings;
}

export async function setLaunchOnStartup(enabled: boolean): Promise<Settings> {
  if (enabled) {
    await enable();
  } else {
    await disable();
  }

  return updateLaunchOnStartup(enabled);
}
