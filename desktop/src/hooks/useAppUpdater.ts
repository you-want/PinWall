import { useState, useEffect, useCallback } from "react";
import type { UpdateState } from "../types";
import {
  initUpdater,
  getUpdateState,
  subscribeToUpdates,
  checkForUpdates,
  downloadAndInstall,
  skipVersion,
  dismissVersion,
  resetUpdateStatus,
  getReleaseUrl,
} from "../services/updater";

interface UseAppUpdaterReturn {
  state: UpdateState;
  checkForUpdates: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  skipVersion: () => Promise<void>;
  dismissVersion: () => Promise<void>;
  resetUpdateStatus: () => Promise<void>;
  getReleaseUrl: () => string;
}

export function useAppUpdater(version: string): UseAppUpdaterReturn {
  const [state, setState] = useState<UpdateState>({
    status: "idle",
    currentVersion: version,
  });

  useEffect(() => {
    initUpdater(version);
    setState(getUpdateState());
  }, [version]);

  useEffect(() => {
    const unsubscribe = subscribeToUpdates(setState);
    return unsubscribe;
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    try {
      await checkForUpdates(true);
    } catch (error) {
      console.error("Check for updates error:", error);
    }
  }, []);

  const handleDownloadAndInstall = useCallback(async () => {
    await downloadAndInstall();
  }, []);

  const handleSkipVersion = useCallback(async () => {
    if (state.info) {
      await skipVersion(state.info.version);
    }
  }, [state.info]);

  const handleDismissVersion = useCallback(async () => {
    await dismissVersion();
  }, []);

  const handleResetUpdateStatus = useCallback(async () => {
    await resetUpdateStatus();
  }, []);

  return {
    state,
    checkForUpdates: handleCheckForUpdates,
    downloadAndInstall: handleDownloadAndInstall,
    skipVersion: handleSkipVersion,
    dismissVersion: handleDismissVersion,
    resetUpdateStatus: handleResetUpdateStatus,
    getReleaseUrl,
  };
}