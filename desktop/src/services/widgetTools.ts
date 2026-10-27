import { invoke } from "@tauri-apps/api/core";
import { validClipboardText } from "./widgetClipboard";
import { revokeWidgetPower } from "./widgetPower";
import type { Translations } from "../i18n";

export const NATIVE_TOOLS = {
  maintenance: { id: "com.pinwall.maintenance", permission: "maintenance" },
  video: { id: "com.pinwall.video-tools", permission: "video" },
  input: { id: "com.pinwall.input-tools", permission: "input" },
  audio: { id: "com.pinwall.music", permission: "audio" },
  windows: { id: "com.pinwall.window-tools", permission: "windows" },
  utilities: { id: "com.pinwall.local-tools", permission: "utilities" },
  shelf: { id: "com.pinwall.file-shelf", permission: "shelf" },
  screen: { id: "com.pinwall.screen-tools", permission: "screenCapture" },
  ocr: { id: "com.pinwall.ocr-note", permission: "ocr" },
  images: { id: "com.pinwall.image-tools", permission: "images" },
  clipboardHistory: { id: "com.pinwall.clipboard-history", permission: "clipboardHistory" },
} as const;
export type NativeTool = keyof typeof NATIVE_TOOLS;
export type ToolResult = { created: false } | { created: true; cardId: string } | { closed: true };
export interface ImagePreview { token: string; width: number; height: number; originalBytes: number; preview: string }
export interface ExportOptions { width: number; height: number; format: "png" | "jpeg" | "webp"; quality: number }
export interface ImageExport { width: number; height: number; bytes: number; format: ExportOptions["format"] }
export interface HistoryEntry { id: string; text: string; createdAt: number }
export interface HistorySnapshot { recording: boolean; stopping: boolean; entries: HistoryEntry[]; skipped: number; failed: boolean }
export type HistoryAction = { method: "status" | "start" | "pause" | "clear" } | { method: "delete" | "copy"; id: string };

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const dimensions = (v: Record<string, unknown>) => integer(v.width, 1, 8192) && integer(v.height, 1, 8192) && v.width * v.height <= 16_000_000;
const knownErrors = new Set(["widget_storage_busy", "maintenance_invalid", "maintenance_expired", "maintenance_changed", "maintenance_running", "maintenance_signal_failed", "maintenance_brew_failed", "maintenance_brew_missing", "maintenance_limit", "maintenance_timeout", "maintenance_unavailable", "maintenance_busy", "desktop_dock_busy", "desktop_dock_permission", "video_busy", "video_limit", "video_invalid", "video_format", "video_invalid_range", "video_original", "video_expired", "video_export_failed", "video_record_failed", "video_timeout", "video_unavailable","input_invalid_profile", "input_permission_denied", "input_tap_disabled", "input_no_features", "input_unavailable","desktop_route_failed", "desktop_route_denied", "desktop_route_format", "desktop_route_expired", "desktop_route_stalled", "desktop_route_cleanup", "desktop_route_duplicate", "desktop_route_limit","desktop_unsupported", "desktop_invalid_action", "desktop_unavailable", "desktop_device_missing", "desktop_device_readonly", "desktop_player_missing", "desktop_automation_denied", "desktop_media_failed", "desktop_accessibility_denied", "desktop_window_expired", "desktop_window_failed", "desktop_no_undo", "desktop_screen_denied", "desktop_timeout","utility_invalid_snippet", "utility_snippet_limit", "utility_unsupported", "widget_storage_corrupt", "widget_storage_future", "widget_storage_limit","shelf_corrupt", "shelf_future_version", "shelf_file_unavailable", "shelf_busy", "screen_permission_denied", "screen_capture_failed", "screen_timeout", "screen_expired", "screen_unsupported", "tool_unsafe_path", "tool_io_failed", "tool_too_large", "clipboard_busy","tool_cancelled", "tool_permission_denied", "tool_reinstall_required", "image_too_large", "image_invalid", "image_busy", "image_source_protected", "image_unsafe_path", "image_expired", "image_save_failed", "image_extension_mismatch", "ocr_no_text", "ocr_text_too_large", "ocr_unsupported", "history_unsupported", "history_busy"]);

export async function toolCall<T>(command: string, args: Record<string, unknown>, signal: AbortSignal, valid: (v: unknown) => v is T): Promise<T> {
  if (signal.aborted) throw new Error("tool_cancelled");
  let abort = () => {};
  try {
    const cancelled = new Promise<never>((_, reject) => { abort = () => reject(new Error("tool_cancelled")); signal.addEventListener("abort", abort, { once: true }); });
    const result = await Promise.race([invoke<unknown>(command, args), cancelled]);
    if (signal.aborted) throw new Error("tool_cancelled");
    if (!valid(result)) throw new Error("tool_invalid_response");
    return result;
  } catch (error: unknown) {
    const code = typeof error === "string" ? error : error instanceof Error ? error.message : "";
    throw new Error(knownErrors.has(code) || code === "tool_invalid_response" ? code : "tool_unavailable");
  } finally { signal.removeEventListener("abort", abort); }
}
export function recognizeImage(signal: AbortSignal) {
  return toolCall("recognize_widget_image", {}, signal, (v): v is string | null => v === null || validClipboardText(v));
}
export function selectImage(signal: AbortSignal) {
  return toolCall("select_widget_image", {}, signal, (v): v is ImagePreview | null => v === null || record(v) && dimensions(v) && typeof v.token === "string" && v.token.length < 128 && integer(v.originalBytes, 1, 20 * 1024 * 1024) && typeof v.preview === "string" && v.preview.length < 1024 * 1024 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.preview));
}
export function exportImage(token: string, options: ExportOptions, signal: AbortSignal) {
  return toolCall("export_widget_image", { token, options }, signal, (v): v is ImageExport | null => v === null || record(v) && dimensions(v) && integer(v.bytes, 1) && ["png", "jpeg", "webp"].includes(String(v.format)));
}
export function historyRequest(action: HistoryAction, signal: AbortSignal) {
  return toolCall("widget_history_request", { action }, signal, (v): v is HistorySnapshot => {
    if (!record(v) || typeof v.recording !== "boolean" || typeof v.stopping !== "boolean" || typeof v.failed !== "boolean" || !integer(v.skipped) || !Array.isArray(v.entries) || v.entries.length > 100) return false;
    let bytes = 0;
    return v.entries.every(entry => record(entry) && typeof entry.id === "string" && /^\d{1,32}$/.test(entry.id) && integer(entry.createdAt) && validClipboardText(entry.text) && (bytes += new TextEncoder().encode(entry.text).length) <= 1024 * 1024);
  });
}
export async function historyStatus(signal: AbortSignal) {
  return toolCall("get_widget_history_status", {}, signal, (v): v is { recording: boolean; count: number; revision: string } => record(v) && typeof v.recording === "boolean" && integer(v.count, 0, 100) && typeof v.revision === "string" && v.revision.length <= 128);
}
export async function clearNativeTool(widgetId: string): Promise<void> {
  if (Object.values(NATIVE_TOOLS).some(tool => tool.id === widgetId)) await invoke("revoke_widget_tool", { widgetId });
}
export async function revokeWidgetTools(widgetId: string): Promise<void> {
  await revokeWidgetPower(widgetId); await clearNativeTool(widgetId);
}
export function toolError(error: unknown, t: Translations): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "widget_storage_busy") return t.tools_busy;
  if (code === "maintenance_busy") return t.tools_busy;
  if (code === "maintenance_changed") return t.maintenance_changed;
  if (code === "maintenance_expired") return t.maintenance_expired;
  if (code === "maintenance_running") return t.maintenance_running;
  if (code === "maintenance_brew_missing") return t.maintenance_brew_missing;
  if (code === "maintenance_brew_failed") return t.maintenance_brew_failed;
  if (code === "maintenance_timeout") return t.maintenance_timeout;
  if (code === "maintenance_limit") return t.maintenance_limit;
  if (code.startsWith("maintenance_")) return t.maintenance_failed;
  if (code === "video_busy") return t.tools_busy;
  if (code === "video_limit") return t.video_limit;
  if (code === "video_original") return t.video_original;
  if (code === "video_expired") return t.video_expired;
  if (code === "video_invalid_range") return t.video_range_error;
  if (code === "video_format") return t.video_format_error;
  if (code === "video_timeout") return t.video_timeout;
  if (code.startsWith("video_")) return t.video_failed;
  if (code === "desktop_dock_permission") return t.dock_permission;
  if (code === "desktop_dock_busy") return t.dock_busy;
  if (code === "input_invalid_profile") return t.input_invalid;
  if (code === "input_permission_denied") return t.input_permission_hint;
  if (code === "input_tap_disabled") return t.input_tap_disabled;
  if (code === "input_no_features") return t.input_no_features;
  if (code === "input_unavailable") return t.input_failed;
  if (code === "desktop_route_denied") return t.audio_route_denied;
  if (code === "desktop_route_format") return t.audio_route_format;
  if (code === "desktop_route_expired") return t.audio_route_expired;
  if (code === "desktop_route_stalled") return t.audio_route_stalled;
  if (code === "desktop_route_cleanup") return t.audio_route_cleanup;
  if (code === "desktop_route_duplicate" || code === "desktop_route_limit") return t.audio_route_limit;
  if (code === "desktop_unsupported") return t.desktop_unsupported;
  if (code === "desktop_device_readonly") return t.desktop_readonly;
  if (code === "desktop_automation_denied") return t.desktop_automation;
  if (code === "desktop_accessibility_denied") return t.desktop_accessibility;
  if (code === "desktop_screen_denied") return t.desktop_screen;
  if (["desktop_device_missing", "desktop_player_missing", "desktop_window_expired", "desktop_no_undo"].includes(code)) return t.desktop_expired;
  if (code === "desktop_timeout") return t.desktop_timeout;
  if (code.startsWith("desktop_")) return t.desktop_failed;
  if (code === "utility_invalid_snippet" || code === "utility_snippet_limit" || code === "widget_storage_limit") return t.utility_limits;
  if (code === "widget_storage_corrupt") return t.utility_corrupt;
  if (code === "widget_storage_future") return t.utility_future;
  if (code === "utility_unsupported") return t.tools_unsupported;
  if (code === "shelf_corrupt") return t.shelf_corrupt;
  if (code === "shelf_future_version") return t.shelf_future;
  if (code === "shelf_file_unavailable") return t.shelf_unavailable;
  if (code === "screen_permission_denied") return t.screen_permission;
  if (code === "screen_capture_failed") return t.screen_failed;
  if (code === "screen_timeout") return t.screen_timeout;
  if (code === "screen_expired") return t.screen_expired;
  if (code === "screen_unsupported") return t.tools_unsupported;
  if (code === "shelf_busy" || code === "clipboard_busy") return t.tools_busy;
  if (code === "tool_too_large") return t.workspace_large;
  if (code === "tool_unsafe_path") return t.tools_source_protected;
  if (code === "tool_io_failed") return t.workspace_io;
  if (code === "tool_reinstall_required") return t.tools_reinstall;
  if (code === "image_busy" || code === "history_busy") return t.tools_busy;
  if (code === "image_too_large" || code === "ocr_text_too_large") return t.tools_large;
  if (code === "image_invalid") return t.tools_invalid_image;
  if (code === "image_source_protected" || code === "image_unsafe_path") return t.tools_source_protected;
  if (code === "image_expired") return t.tools_expired;
  if (code === "image_extension_mismatch") return t.tools_extension;
  if (code === "image_save_failed") return t.tools_save_failed;
  if (code === "ocr_no_text") return t.ocr_no_text;
  if (code === "ocr_unsupported" || code === "history_unsupported") return t.tools_unsupported;
  return t.tools_failed;
}
