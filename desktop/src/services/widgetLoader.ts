import { invoke } from "@tauri-apps/api/core";
import type { WidgetCategory, WidgetManifest, WidgetPermission, WidgetType } from "../types";

const VALID_WIDGET_TYPES = new Set<WidgetType>(["official", "community"]);
const VALID_WIDGET_CATEGORIES = new Set<WidgetCategory>([
  "utility",
  "productivity",
  "beautification",
  "entertainment",
  "system",
  "social",
  "developer",
  "other",
]);
const VALID_WIDGET_PERMISSIONS = new Set<WidgetPermission>([
  "storage",
  "theme",
  "notify",
  "cards",
  "events",
  "app",
  "ai",
  "system",
  "network",
  "i18n",
]);

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

export function isValidWidgetId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  if (id.length < 5 || id.length > 120) return false;
  if (id.startsWith(".") || id.endsWith(".") || id.includes("..")) return false;
  const parts = id.split(".");
  if (parts.length < 3) return false;
  return parts.every((part) =>
    part.length > 0 &&
    !part.startsWith("-") &&
    !part.endsWith("-") &&
    /^[a-z0-9-]+$/.test(part)
  );
}

export function isSafeWidgetRelativePath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  return !path.split("/").some((part) => part === "..");
}

function isValidWidgetSize(size: unknown): size is WidgetManifest["defaultSize"] {
  if (!size || typeof size !== "object") return false;
  const value = size as { width?: unknown; height?: unknown };
  return (
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    value.width > 0 &&
    value.height > 0
  );
}

function isValidWidgetType(type: unknown): type is WidgetType {
  return typeof type === "string" && VALID_WIDGET_TYPES.has(type as WidgetType);
}

function isValidWidgetCategory(category: unknown): category is WidgetCategory {
  return typeof category === "string" && VALID_WIDGET_CATEGORIES.has(category as WidgetCategory);
}

function hasValidPermissions(permissions: unknown): permissions is WidgetPermission[] {
  return Array.isArray(permissions) &&
    permissions.every((permission) =>
      typeof permission === "string" &&
      VALID_WIDGET_PERMISSIONS.has(permission as WidgetPermission)
    );
}

/** 校验 Widget Manifest 是否合法 */
export function validateManifest(manifest: any): manifest is WidgetManifest {
  if (!manifest) return false;
  if (!isValidWidgetId(manifest.id)) return false;
  if (typeof manifest.name !== "string" || !manifest.name) return false;
  if (typeof manifest.description !== "string") return false;
  if (typeof manifest.author !== "string") return false;
  if (typeof manifest.version !== "string") return false;
  if (!isValidWidgetType(manifest.type)) return false;
  if (!isValidWidgetCategory(manifest.category)) return false;
  if (!isSafeWidgetRelativePath(manifest.entry)) return false;
  if (!isSafeWidgetRelativePath(manifest.icon)) return false;
  if (!hasValidPermissions(manifest.permissions)) return false;
  if (!isValidWidgetSize(manifest.defaultSize)) return false;
  if (manifest.minSize !== undefined && !isValidWidgetSize(manifest.minSize)) return false;
  if (manifest.maxSize !== undefined && !isValidWidgetSize(manifest.maxSize)) return false;
  return true;
}
