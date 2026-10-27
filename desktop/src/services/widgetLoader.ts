import { convertFileSrc, invoke } from "@tauri-apps/api/core";
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
  "power",
  "clipboard",
  "ocr", "images", "clipboardHistory", "shelf", "screenCapture", "utilities", "audio", "windows", "input", "video", "maintenance",
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

export interface WidgetInstallResult {
  manifest: WidgetManifest | null;
  error?: string;
}

/** 通过 Tauri command 从本地路径安装 Widget，并返回可展示的失败原因 */
export async function installWidgetFromPathWithResult(sourcePath: string, approved: WidgetManifest): Promise<WidgetInstallResult> {
  try {
    const preview = approved;
    const manifest = await invoke<WidgetManifest>("install_widget", { path: sourcePath, id: preview.id, version: preview.version, permissions: preview.permissions });
    if (validateManifest(manifest)) {
      return { manifest };
    }
    return { manifest: null, error: "Installed widget manifest is invalid." };
  } catch (err) {
    console.error("[WidgetLoader] Install failed:", err);
    return { manifest: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 安装内置官方 Widget */
export async function installOfficialWidget(widgetId: string): Promise<WidgetInstallResult> {
  try {
    const manifest = await invoke<WidgetManifest>("install_official_widget", { id: widgetId });
    if (validateManifest(manifest)) {
      return { manifest };
    }
    return { manifest: null, error: "Installed widget manifest is invalid." };
  } catch (err) {
    console.error("[WidgetLoader] Official install failed:", err);
    return { manifest: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 读取已安装 Widget 的入口 HTML，用于 iframe srcDoc 渲染 */
export async function loadWidgetEntryHtml(widgetId: string): Promise<string> {
  if (!isValidWidgetId(widgetId)) {
    throw new Error("Invalid widget id.");
  }
  return invoke<string>("read_widget_entry_html", { id: widgetId });
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
  return `asset://localhost/widgets/${widgetId}/${filePath}`;
}

export function getWidgetFrameUrl(manifest: WidgetManifest): string {
  if (manifest.installedPath) {
    return convertFileSrc(`${manifest.installedPath}/${manifest.entry}`);
  }
  // asset protocol 需要配置 scope，路径相对于 $APPDATA
  // 实际 URL 格式取决于 Tauri asset protocol 的配置
  return getWidgetAssetUrl(manifest.id, manifest.entry);
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
    Number.isFinite(value.width) && Number.isFinite(value.height) &&
    value.width > 0 && value.width <= 10000 &&
    value.height > 0 && value.height <= 10000
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
export function validateManifest(manifest: unknown): manifest is WidgetManifest {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return false;
  const value = manifest as Record<string, unknown>;
  if (!isValidWidgetId(value.id)) return false;
  if (typeof value.name !== "string" || !value.name) return false;
  if (typeof value.description !== "string") return false;
  if (typeof value.author !== "string") return false;
  if (typeof value.version !== "string") return false;
  if (!isValidWidgetType(value.type)) return false;
  if (!isValidWidgetCategory(value.category)) return false;
  if (!isSafeWidgetRelativePath(value.entry)) return false;
  if (!isSafeWidgetRelativePath(value.icon)) return false;
  if (!hasValidPermissions(value.permissions)) return false;
  if (value.defaultEnabled !== undefined && typeof value.defaultEnabled !== "boolean") return false;
  if (!isValidWidgetSize(value.defaultSize)) return false;
  if (value.minSize !== undefined && !isValidWidgetSize(value.minSize)) return false;
  if (value.maxSize !== undefined && !isValidWidgetSize(value.maxSize)) return false;
  return true;
}

export async function previewWidgetInstall(path: string): Promise<WidgetManifest> {
  const value: unknown = await invoke("preview_widget_install", { path });
  if (!validateManifest(value)) throw new Error("widget_manifest_invalid");
  return value;
}
export async function previousWidgetVersion(id: string): Promise<WidgetManifest | null> {
  const value: unknown = await invoke("get_widget_rollback", { id });
  if (value === null) return null;
  if (!validateManifest(value)) throw new Error("widget_manifest_invalid");
  return value;
}
export async function rollbackWidget(manifest: WidgetManifest): Promise<WidgetManifest> {
  const value: unknown = await invoke("rollback_widget", { id: manifest.id, version: manifest.version, permissions: manifest.permissions });
  if (!validateManifest(value)) throw new Error("widget_manifest_invalid");
  return { ...value, defaultEnabled: false };
}
