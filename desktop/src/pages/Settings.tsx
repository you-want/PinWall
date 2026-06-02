import { useState, useEffect, useCallback } from "react";
import { webviewWindow } from "@tauri-apps/api";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { SettingsPanel } from "../components/SettingsPanel";
import type { Settings } from "../types";
import {
  getSettings,
  addBackgroundImage,
  removeBackgroundImage,
  setDefaultBackgroundImage,
  setCurrentBackgroundImage,
  updateOpacity,
  updateAutoChangeSettings,
} from "../services/storage";

function Settings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  const loadSettings = useCallback(async () => {
    const savedSettings = await getSettings();
    setSettings(savedSettings);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        await webviewWindow.getCurrentWebviewWindow().close();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleClose = async () => {
    await webviewWindow.getCurrentWebviewWindow().close();
  };

  const handleUpload = async () => {
    const result = await open({
      multiple: true,
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp"] },
      ],
    });

    if (!result) return;

    const files = Array.isArray(result) ? result : [result];

    try {
      const imported = await invoke<Array<{ path: string; file_name: string }>>(
        "import_background_images",
        { paths: files },
      );

      for (const item of imported) {
        const updatedSettings = await addBackgroundImage(item.path, item.file_name);
        setSettings(updatedSettings);
      }

      await emit("settings:changed");
    } catch (error) {
      console.error("Failed to import background images:", error);
    }
  };

  const handleSetDefault = async (id: string) => {
    const updatedSettings = await setDefaultBackgroundImage(id);
    setSettings(updatedSettings);
    await emit("settings:changed");
  };

  const handleRemove = async (id: string) => {
    const image = settings?.backgroundImages.find((img) => img.id === id) ?? null;
    if (image) {
      try {
        await invoke("delete_background_image_file", { path: image.path });
      } catch (error) {
        console.error("Failed to delete background image file:", error);
      }
    }
    const updatedSettings = await removeBackgroundImage(id);
    setSettings(updatedSettings);
    await emit("settings:changed");
  };

  const handleClearBackground = async () => {
    const updatedSettings = await setCurrentBackgroundImage(null);
    setSettings(updatedSettings);
    await emit("settings:changed");
  };

  const handleOpacityChange = async (opacity: number) => {
    const updatedSettings = await updateOpacity(opacity);
    setSettings(updatedSettings);
    await emit("settings:changed");
  };

  const handleAutoChangeSettings = async (enabled: boolean, interval: number) => {
    const updatedSettings = await updateAutoChangeSettings(enabled, interval);
    setSettings(updatedSettings);
    await emit("settings:changed");
  };

  if (!settings) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="settings-page">
      <SettingsPanel
        settings={settings}
        onClose={handleClose}
        onUpload={handleUpload}
        onSetDefault={handleSetDefault}
        onRemove={handleRemove}
        onClearBackground={handleClearBackground}
        onOpacityChange={handleOpacityChange}
        onAutoChangeSettings={handleAutoChangeSettings}
      />
    </div>
  );
}

export default Settings;
