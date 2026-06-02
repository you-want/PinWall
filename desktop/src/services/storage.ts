import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import type { Settings, BackgroundImage } from "../types";

const SETTINGS_FILE = "pinwall-settings.json";

const defaultSettings: Settings = {
  backgroundImages: [],
  currentImageId: null,
  opacity: 0.8,
  autoChangeEnabled: false,
  autoChangeInterval: 60,
};

export async function getSettings(): Promise<Settings> {
  try {
    const content = await readTextFile(SETTINGS_FILE, { baseDir: BaseDirectory.AppData });
    return JSON.parse(content);
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
