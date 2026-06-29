import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import type { UpdateInfo, UpdateProgress, UpdateState, UpdateStatus } from "../../types";
import { getSettings, updateLastUpdateCheckAt, updateSkippedVersion, updateLastUpdatePromptedVersion } from "../storage";

const RELEASE_URL = "https://github.com/rain9/pinwall/releases";

let currentState: UpdateState = {
  status: "idle",
  currentVersion: "__APP_VERSION__",
};

let stateListeners: Set<(state: UpdateState) => void> = new Set();

function notifyListeners() {
  stateListeners.forEach((listener) => listener({ ...currentState }));
}

function setStatus(status: UpdateStatus, error?: string) {
  currentState.status = status;
  if (error) {
    currentState.error = error;
    currentState.info = undefined;
    currentState.progress = undefined;
  }
  notifyListeners();
}

function setInfo(info: UpdateInfo) {
  currentState.info = info;
  currentState.error = undefined;
  notifyListeners();
}

function setProgress(progress: UpdateProgress) {
  currentState.progress = progress;
  notifyListeners();
}

export function initUpdater(version: string) {
  currentState.currentVersion = version;
}

export function getUpdateState(): UpdateState {
  return { ...currentState };
}

export function subscribeToUpdates(listener: (state: UpdateState) => void): () => void {
  stateListeners.add(listener);
  listener({ ...currentState });
  return () => stateListeners.delete(listener);
}

export async function checkForUpdates(manual = false): Promise<UpdateState> {
  try {
    console.log("[Updater] Starting checkForUpdates, manual:", manual);
    setStatus("checking");
    
    const settings = await getSettings();

    // 添加超时机制，避免长时间等待
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error("Request timeout")), 10000);
    });

    const update = await Promise.race([
      check(),
      timeoutPromise
    ]);
    
    await updateLastUpdateCheckAt(Date.now());

    if (update) {
      const info: UpdateInfo = {
        version: update.version,
        date: update.date ?? "",
        body: update.body ?? "",
        size: update.rawJson.size as number || 0,
      };
      
      const skippedVersion = settings.skippedVersion;
      if (skippedVersion && compareVersions(update.version, skippedVersion) <= 0) {
        setStatus("up-to-date");
        return { ...currentState };
      }

      setInfo(info);
      setStatus("available");
      
      if (!manual) {
        await updateLastUpdatePromptedVersion(update.version);
      }
    } else {
      setStatus("up-to-date");
    }
  } catch (error) {
    console.error("Update check failed:", error);
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      if (error.message.includes("network") || error.message.includes("fetch")) {
        errorMessage = "Network connection failed";
      } else if (error.message.includes("signature")) {
        errorMessage = "Security verification failed";
      } else {
        errorMessage = error.message;
      }
    }
    setStatus("failed", errorMessage);
  }
  
  return { ...currentState };
}

export async function downloadAndInstall(): Promise<UpdateState> {
  try {
    setStatus("downloading");
    
    const update = await check();
    
    if (!update) {
      setStatus("up-to-date");
      return { ...currentState };
    }

    let totalBytes = 0;
    let downloadedBytes = 0;

    await update.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === "Started") {
        totalBytes = event.data.contentLength || 0;
        downloadedBytes = 0;
        setProgress({
          downloadedBytes,
          totalBytes,
          percentage: 0,
        });
      } else if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
        const percentage = totalBytes > 0 
          ? Math.round((downloadedBytes / totalBytes) * 100) 
          : Math.min(99, downloadedBytes / 10000);
        setProgress({
          downloadedBytes,
          totalBytes,
          percentage,
        });
      } else if (event.event === "Finished") {
        setStatus("installing");
      }
    });

    setStatus("pending-restart");
  } catch (error) {
    console.error("Download/install failed:", error);
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    setStatus("failed", errorMessage);
  }
  
  return { ...currentState };
}

export async function skipVersion(version: string): Promise<void> {
  await updateSkippedVersion(version);
  setStatus("up-to-date");
}

export async function dismissVersion(): Promise<void> {
  if (currentState.info) {
    await updateLastUpdatePromptedVersion(currentState.info.version);
  }
}

export async function resetUpdateStatus(): Promise<void> {
  currentState.status = "idle";
  currentState.info = undefined;
  currentState.progress = undefined;
  currentState.error = undefined;
  notifyListeners();
}

export function getReleaseUrl(): string {
  return RELEASE_URL;
}

export async function autoCheckForUpdates(): Promise<void> {
  try {
    const settings = await getSettings();
    
    if (!settings.autoCheckUpdates) {
      return;
    }
    
    const now = Date.now();
    const lastCheckAt = settings.lastUpdateCheckAt || 0;
    const checkInterval = 24 * 60 * 60 * 1000;
    
    if (now - lastCheckAt < checkInterval) {
      return;
    }
    
    await checkForUpdates(false);
  } catch (error) {
    console.error("Auto update check failed:", error);
  }
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.replace(/^v/, "").split(".").map(Number);
  const parts2 = v2.replace(/^v/, "").split(".").map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export async function shouldPromptUpdate(): Promise<boolean> {
  const settings = await getSettings();
  if (!currentState.info) return false;
  if (settings.skippedVersion && compareVersions(currentState.info.version, settings.skippedVersion) <= 0) {
    return false;
  }
  if (settings.lastUpdatePromptedVersion === currentState.info.version) {
    return false;
  }
  return true;
}