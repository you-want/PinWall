import { invoke } from "@tauri-apps/api/core";
import type { WidgetManifest } from "../types";

/**
 * Widget 加载器
 * 负责从 Tauri 后端获取已安装的 Widget 列表并校验 manifest
 */

/** 通过 Tauri command 列出已安装 Widget 的 manifest */
export async function loadInstalledWidgets(): Promise<WidgetManifest[]> {
  try {
    const manifests = await invoke<WidgetManifest[]>("list_installed_widgets");
    return manifests.filter(validateManifest);
  } catch (err) {
    console.warn("[WidgetLoader] Failed to load widgets:", err);
    return [];
  }
}

/** 通过 Tauri command 从本地路径安装 Widget */
export async function installWidgetFromPath(sourcePath: string): Promise<WidgetManifest | null> {
  try {
    const manifest = await invoke<WidgetManifest>("install_widget", { path: sourcePath });
    if (validateManifest(manifest)) {
      return manifest;
    }
    console.warn("[WidgetLoader] Invalid manifest after install:", manifest);
    return null;
  } catch (err) {
    console.error("[WidgetLoader] Install failed:", err);
    return null;
  }
}

/** 通过 Tauri command 卸载 Widget */
export async function uninstallWidget(widgetId: string): Promise<boolean> {
  try {
    await invoke("uninstall_widget", { id: widgetId });
    return true;
  } catch (err) {
    console.error("[WidgetLoader] Uninstall failed:", err);
    return false;
  }
}

/** 获取 Widget 资源文件的 asset protocol URL（用于 iframe src） */
export function getWidgetAssetUrl(widgetId: string, filePath: string): string {
  // asset protocol 需要配置 scope，路径相对于 $APPDATA
  // 实际 URL 格式取决于 Tauri asset protocol 的配置
  return `asset://localhost/widgets/${widgetId}/${filePath}`;
}

/** 校验 Widget Manifest 是否合法 */
export function validateManifest(manifest: any): manifest is WidgetManifest {
  if (!manifest) return false;
  if (typeof manifest.id !== "string" || !manifest.id) return false;
  if (typeof manifest.name !== "string" || !manifest.name) return false;
  if (typeof manifest.version !== "string") return false;
  if (typeof manifest.entry !== "string" || !manifest.entry) return false;
  if (!Array.isArray(manifest.permissions)) return false;
  if (!manifest.defaultSize || typeof manifest.defaultSize.width !== "number") return false;
  return true;
}
