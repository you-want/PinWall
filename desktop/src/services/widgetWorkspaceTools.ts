import { toolCall } from "./widgetTools";
import { validClipboardText } from "./widgetClipboard";

export interface ShelfItem { id: string; name: string; bytes: number; addedAt: number; expiresAt: number; available: boolean }
export interface ShelfSnapshot { entries: ShelfItem[]; added: number; skipped: number }
export type ShelfAction = { method: "activate" | "status" | "add" | "clear" } | { method: "remove" | "export" | "reveal"; id: string };
export interface ScreenPreview { token: string; width: number; height: number; preview: string }
export type ScreenResult = { kind: "capture"; image: ScreenPreview } | { kind: "text"; text: string } | { kind: "color"; hex: string; r: number; g: number; b: number; copied: boolean } | { kind: "exported"; bytes: number } | { kind: "cancelled" };
export type ScreenAction = { method: "capture" } | { method: "ocr" | "export"; token: string } | { method: "color"; token: string; x: number; y: number; copy: boolean };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;

export function shelfRequest(action: ShelfAction, signal: AbortSignal) {
  return toolCall("widget_shelf_request", { action }, signal, (v): v is ShelfSnapshot => {
    if (!object(v) || !Array.isArray(v.entries) || v.entries.length > 50 || !integer(v.added, 0, 50) || !integer(v.skipped)) return false;
    const ids = new Set<string>();
    return v.entries.every(e => object(e) && typeof e.id === "string" && /^\d[\d-]{0,63}$/.test(e.id) && !ids.has(e.id) && !!ids.add(e.id)
      && typeof e.name === "string" && new TextEncoder().encode(e.name).length > 0 && new TextEncoder().encode(e.name).length <= 1024
      && integer(e.bytes, 0, 100 * 1024 * 1024) && integer(e.addedAt) && integer(e.expiresAt) && e.expiresAt === e.addedAt + 7 * 86400000 && typeof e.available === "boolean");
  });
}
export function screenRequest(action: ScreenAction, signal: AbortSignal) {
  return toolCall("widget_screen_request", { action }, signal, (v): v is ScreenResult => {
    if (!object(v)) return false;
    if (v.kind === "cancelled") return true;
    if (v.kind === "text") return validClipboardText(v.text);
    if (v.kind === "exported") return integer(v.bytes, 1, 80 * 1024 * 1024);
    if (v.kind === "color") return typeof v.hex === "string" && /^#[0-9A-F]{6}$/.test(v.hex) && integer(v.r, 0, 255) && integer(v.g, 0, 255) && integer(v.b, 0, 255) && typeof v.copied === "boolean" && v.hex === `#${[v.r, v.g, v.b].map(n => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    const p = v.image;
    return v.kind === "capture" && object(p) && typeof p.token === "string" && p.token.length > 0 && p.token.length < 128
      && integer(p.width, 1, 8192) && integer(p.height, 1, 8192) && p.width * p.height <= 16000000
      && typeof p.preview === "string" && p.preview.length < 3 * 1024 * 1024 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.preview);
  });
}
/** Map the actual displayed image rectangle to original pixel coordinates, including keyboard selection. */
export function originalPixel(fraction: number, dimension: number): number {
  return Math.max(0, Math.min(dimension - 1, Math.floor(Math.max(0, Math.min(1, fraction)) * dimension)));
}
