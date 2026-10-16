import { invoke } from "@tauri-apps/api/core";
import type { Settings, BackgroundImage, AIConfig, QuotaMonitorConfig } from "../types";
import { DEFAULT_AI_CONFIG, DEFAULT_MOOD_CHECKIN_TIMES, DEFAULT_QUOTA_MONITOR, DEFAULT_GLOBAL_SHORTCUT } from "../types";

const defaultSettings: Settings = {
  backgroundImages: [],
  currentImageId: null,
  opacity: 0.8,
  autoChangeEnabled: false,
  autoChangeInterval: 60,
  launchOnStartup: true,
  ai: { ...DEFAULT_AI_CONFIG },
  quotaMonitor: { ...DEFAULT_QUOTA_MONITOR },
  holidayEnabledCn: true,
  holidayEnabledIntl: true,
  globalShortcut: DEFAULT_GLOBAL_SHORTCUT,
  // ── Care / Companion defaults ──
  careTone: "warm",
  hydrationGoal: 8,
  moodCheckinEnabled: true,
  moodCheckinTimes: [...DEFAULT_MOOD_CHECKIN_TIMES],
  restReminderEnabled: true,
  restInterval: 90,
  offWorkTime: "18:00",
  offWorkReminderEnabled: true,
  eyeCareEnabled: true,
  eyeCareInterval: 20,
  weatherCareEnabled: true,
  weatherCity: "",
  // ── App Update defaults ──
  autoCheckUpdates: true,
  updateChannel: "stable",
  skippedVersion: "",
  lastUpdateCheckAt: 0,
  lastUpdatePromptedVersion: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Rust validates the full persisted schema; this also checks the IPC boundary before casting.
function decodeDocument(value: unknown): { settings: Settings; revision: number } {
  if (!isRecord(value) || (value.schemaVersion !== undefined && value.schemaVersion !== 0 && value.schemaVersion !== 1 && value.schemaVersion !== 2)
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
    throw new Error("storage_corrupt");
  }
  const defaults = structuredClone(defaultSettings);
  for (const [key, fallback] of Object.entries(defaults)) {
    const field = value[key];
    if (field === undefined || fallback === null) continue;
    if (Array.isArray(fallback) ? !Array.isArray(field) : typeof field !== typeof fallback || (typeof field === "object" && !isRecord(field))) {
      throw new Error("storage_corrupt");
    }
  }
  const { schemaVersion: _version, revision, holidayEnabled, ...fields } = value;
  const settings = { ...defaults, ...fields } as Settings;
  if (typeof holidayEnabled === "boolean") {
    settings.holidayEnabledCn = (fields.holidayEnabledCn as boolean | undefined) ?? holidayEnabled;
    settings.holidayEnabledIntl = (fields.holidayEnabledIntl as boolean | undefined) ?? holidayEnabled;
  }
  return { settings, revision: revision as number };
}

export async function getSettings(): Promise<Settings> {
  return decodeDocument(await invoke<unknown>("settings_read")).settings;
}

/** Replay a pure mutation on the latest revision. The commit is serialized across native windows. */
async function updateSettings(mutate: (settings: Settings) => void): Promise<Settings> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { settings, revision } = decodeDocument(await invoke<unknown>("settings_read"));
    mutate(settings);
    const result = await invoke<unknown>("settings_compare_and_swap", {
      expectedRevision: revision,
      data: settings,
    });
    if (result !== null) return decodeDocument(result).settings;
  }
  throw new Error("settings_busy");
}

export async function addBackgroundImage(path: string, fileName: string): Promise<Settings> {
  return updateSettings((settings) => {
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
  });
}

export async function removeBackgroundImage(id: string): Promise<Settings> {
  return updateSettings((settings) => {
    const index = settings.backgroundImages.findIndex(img => img.id === id);
    if (index !== -1) {
      settings.backgroundImages.splice(index, 1);
      if (settings.currentImageId === id) {
        settings.currentImageId = settings.backgroundImages[0]?.id || null;
      }
    }
  });
}

export async function setDefaultBackgroundImage(id: string): Promise<Settings> {
  return updateSettings((settings) => {
    settings.backgroundImages.forEach(img => {
      img.isDefault = img.id === id;
    });
    settings.currentImageId = id;
  });
}

export async function setCurrentBackgroundImage(id: string | null): Promise<Settings> {
  return updateSettings((settings) => {
    settings.currentImageId = id;
  });
}

export async function updateOpacity(opacity: number): Promise<Settings> {
  return updateSettings((settings) => {
    settings.opacity = Math.max(0, Math.min(1, opacity));
  });
}

export async function updateAutoChangeSettings(enabled: boolean, interval: number): Promise<Settings> {
  return updateSettings((settings) => {
    settings.autoChangeEnabled = enabled;
    settings.autoChangeInterval = interval;
  });
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
  return updateSettings((settings) => {
    settings.ai = ai;
  });
}

export async function updateLastDailyCardDate(date: string): Promise<Settings> {
  return updateSettings((settings) => {
    settings.lastDailyCardDate = date;
  });
}

export async function updateQuotaMonitorConfig(config: QuotaMonitorConfig): Promise<Settings> {
  return updateSettings((settings) => {
    settings.quotaMonitor = config;
  });
}

export async function updateHolidayEnabledCn(enabled: boolean): Promise<Settings> {
  return updateSettings((settings) => {
    settings.holidayEnabledCn = enabled;
  });
}

export async function updateHolidayEnabledIntl(enabled: boolean): Promise<Settings> {
  return updateSettings((settings) => {
    settings.holidayEnabledIntl = enabled;
  });
}

export async function updateLastHolidayCardDate(date: string): Promise<Settings> {
  return updateSettings((settings) => {
    settings.lastHolidayCardDate = date;
  });
}

export async function updateGlobalShortcut(shortcut: string): Promise<Settings> {
  return updateSettings((settings) => {
    settings.globalShortcut = shortcut;
  });
}

export async function updateLaunchOnStartup(enabled: boolean): Promise<Settings> {
  return updateSettings((settings) => {
    settings.launchOnStartup = enabled;
  });
}

// ── Care / Companion settings ─────────────────────────────

export async function updateCareTone(tone: import("../types").CareTone): Promise<Settings> {
  return updateSettings((settings) => {
    settings.careTone = tone;
  });
}

export async function updateCareSettings(partial: Partial<Settings>): Promise<Settings> {
  return updateSettings((settings) => {
    Object.assign(settings, partial);
  });
}

// ── App Update settings ─────────────────────────────────

export async function updateAutoCheckUpdates(enabled: boolean): Promise<Settings> {
  return updateSettings((settings) => {
    settings.autoCheckUpdates = enabled;
  });
}

export async function updateUpdateChannel(channel: string): Promise<Settings> {
  return updateSettings((settings) => {
    settings.updateChannel = channel;
  });
}

export async function updateSkippedVersion(version: string): Promise<Settings> {
  return updateSettings((settings) => {
    settings.skippedVersion = version;
  });
}

export async function updateLastUpdateCheckAt(timestamp: number): Promise<Settings> {
  return updateSettings((settings) => {
    settings.lastUpdateCheckAt = timestamp;
  });
}

export async function updateLastUpdatePromptedVersion(version: string): Promise<Settings> {
  return updateSettings((settings) => {
    settings.lastUpdatePromptedVersion = version;
  });
}
