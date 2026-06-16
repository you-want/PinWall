import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import type { Settings, BackgroundImage, AIConfig, QuotaMonitorConfig } from "../types";
import { DEFAULT_AI_CONFIG, DEFAULT_QUOTA_MONITOR, DEFAULT_GLOBAL_SHORTCUT } from "../types";

const SETTINGS_FILE = "pinwall-settings.json";

const defaultSettings: Settings = {
  backgroundImages: [],
  currentImageId: null,
  opacity: 0.8,
  autoChangeEnabled: false,
  autoChangeInterval: 60,
  ai: { ...DEFAULT_AI_CONFIG },
  quotaMonitor: { ...DEFAULT_QUOTA_MONITOR },
  holidayEnabledCn: true,
  holidayEnabledIntl: true,
  globalShortcut: DEFAULT_GLOBAL_SHORTCUT,
};

export async function getSettings(): Promise<Settings> {
  try {
    const content = await readTextFile(SETTINGS_FILE, { baseDir: BaseDirectory.AppData });
    const parsed = JSON.parse(content);
    // Ensure ai config exists (backward compat)
    if (!parsed.ai) parsed.ai = { ...DEFAULT_AI_CONFIG };
    // Ensure quotaMonitor config exists (backward compat)
    if (!parsed.quotaMonitor) parsed.quotaMonitor = { ...DEFAULT_QUOTA_MONITOR, models: [] };
    // Ensure holiday region toggles default to true (backward compat)
    // Migrate old holidayEnabled → both new toggles
    if (parsed.holidayEnabled !== undefined && parsed.holidayEnabledCn === undefined) {
      parsed.holidayEnabledCn = parsed.holidayEnabled;
      parsed.holidayEnabledIntl = parsed.holidayEnabled;
      delete parsed.holidayEnabled;
    }
    if (parsed.holidayEnabledCn === undefined) parsed.holidayEnabledCn = true;
    if (parsed.holidayEnabledIntl === undefined) parsed.holidayEnabledIntl = true;
    // Ensure globalShortcut defaults (backward compat)
    if (!parsed.globalShortcut) parsed.globalShortcut = DEFAULT_GLOBAL_SHORTCUT;
    return parsed;
  } catch {
    return { ...defaultSettings };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writeTextFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), {
    baseDir: BaseDirectory.AppData,
  });
}

export async function addBackgroundImage(path: string, fileName: string): Promise<Settings> {
  const settings = await getSettings();
  const newImage: BackgroundImage = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    path,
    fileName,
    createdAt: Date.now(),
    isDefault: settings.backgroundImages.length === 0,
  };
  settings.backgroundImages.push(newImage);
  if (!settings.currentImageId) {
    settings.currentImageId = newImage.id;
  }
  await saveSettings(settings);
  return settings;
}

export async function removeBackgroundImage(id: string): Promise<Settings> {
  const settings = await getSettings();
  const index = settings.backgroundImages.findIndex(img => img.id === id);
  if (index !== -1) {
    settings.backgroundImages.splice(index, 1);
    if (settings.currentImageId === id) {
      settings.currentImageId = settings.backgroundImages[0]?.id || null;
    }
    await saveSettings(settings);
  }
  return settings;
}

export async function setDefaultBackgroundImage(id: string): Promise<Settings> {
  const settings = await getSettings();
  settings.backgroundImages.forEach(img => {
    img.isDefault = img.id === id;
  });
  settings.currentImageId = id;
  await saveSettings(settings);
  return settings;
}

export async function setCurrentBackgroundImage(id: string | null): Promise<Settings> {
  const settings = await getSettings();
  settings.currentImageId = id;
  await saveSettings(settings);
  return settings;
}

export async function updateOpacity(opacity: number): Promise<Settings> {
  const settings = await getSettings();
  settings.opacity = Math.max(0, Math.min(1, opacity));
  await saveSettings(settings);
  return settings;
}

export async function updateAutoChangeSettings(enabled: boolean, interval: number): Promise<Settings> {
  const settings = await getSettings();
  settings.autoChangeEnabled = enabled;
  settings.autoChangeInterval = interval;
  await saveSettings(settings);
  return settings;
}

export async function getCurrentBackgroundImage(settings: Settings): Promise<BackgroundImage | null> {
  if (!settings.currentImageId) return null;
  return settings.backgroundImages.find(img => img.id === settings.currentImageId) || null;
}

export async function getRandomBackgroundImage(settings: Settings): Promise<BackgroundImage | null> {
  if (settings.backgroundImages.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * settings.backgroundImages.length);
  return settings.backgroundImages[randomIndex];
}

export async function updateAIConfig(ai: AIConfig): Promise<Settings> {
  const settings = await getSettings();
  settings.ai = ai;
  await saveSettings(settings);
  return settings;
}

export async function updateLastDailyCardDate(date: string): Promise<Settings> {
  const settings = await getSettings();
  settings.lastDailyCardDate = date;
  await saveSettings(settings);
  return settings;
}

export async function updateQuotaMonitorConfig(config: QuotaMonitorConfig): Promise<Settings> {
  const settings = await getSettings();
  settings.quotaMonitor = config;
  await saveSettings(settings);
  return settings;
}

export async function updateHolidayEnabledCn(enabled: boolean): Promise<Settings> {
  const settings = await getSettings();
  settings.holidayEnabledCn = enabled;
  await saveSettings(settings);
  return settings;
}

export async function updateHolidayEnabledIntl(enabled: boolean): Promise<Settings> {
  const settings = await getSettings();
  settings.holidayEnabledIntl = enabled;
  await saveSettings(settings);
  return settings;
}

export async function updateLastHolidayCardDate(date: string): Promise<Settings> {
  const settings = await getSettings();
  settings.lastHolidayCardDate = date;
  await saveSettings(settings);
  return settings;
}

export async function updateGlobalShortcut(shortcut: string): Promise<Settings> {
  const settings = await getSettings();
  settings.globalShortcut = shortcut;
  await saveSettings(settings);
  return settings;
}
