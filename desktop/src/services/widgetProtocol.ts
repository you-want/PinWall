import type { WidgetBridgeRequest } from "../types";

const MAX_REQUEST_BYTES = 1024 * 1024;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isJson(value: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => isJson(item, depth + 1));
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.entries(value).every(([key, item]) => !UNSAFE_KEYS.has(key) && isJson(item, depth + 1));
}

/** Legacy envelopes remain supported; unknown protocol versions fail closed. */
export function parseWidgetRequest(input: unknown): WidgetBridgeRequest | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (value.type !== "request" || typeof value.id !== "string" || !/^[\w:-]{1,128}$/.test(value.id)) return null;
  if (value.version !== undefined && value.version !== 1) return null;
  if (typeof value.module !== "string" || !/^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(value.module)) return null;
  if (typeof value.method !== "string" || !/^[a-zA-Z]{1,48}$/.test(value.method)) return null;
  if (value.args !== undefined && (!Array.isArray(value.args) || value.args.length > 8)) return null;
  try {
    if (!isJson(value.args) || new TextEncoder().encode(JSON.stringify(value)).length > MAX_REQUEST_BYTES) return null;
  } catch {
    return null;
  }
  return value as unknown as WidgetBridgeRequest;
}

/** The first policy cannot be weakened by a later policy inside plugin HTML. */
export function prepareWidgetHtml(html: string): string {
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}">${html}`;
}

export function validWidgetArguments(request: WidgetBridgeRequest): boolean {
  const args: unknown[] = request.args ?? [];
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
  const key = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 256 && !UNSAFE_KEYS.has(value);
  const text = (value: unknown) => typeof value === "string";
  const [first, second] = args;
  switch (`${request.module}.${request.method}`) {
    case "power.start": return args.length === 1 && typeof first === "number" && Number.isInteger(first) && first >= 1 && first <= 480;
    case "power.status": case "power.stop":
    case "storage.clear": case "theme.get": case "i18n.getLocale": case "settings.getAll":
    case "app.getVersion": case "app.getLocale":
    case "system.getBattery": case "system.getMemoryInfo": case "system.getMediaInfo":
      return args.length === 0;
    case "storage.get": case "storage.remove": case "settings.get": case "cards.delete":
      return args.length === 1 && key(first);
    case "storage.set": return args.length === 2 && key(first);
    case "cards.list": return args.length === 0 || (args.length === 1 && (first === undefined || object(first)));
    case "cards.create": {
      if (args.length !== 1 || !object(first)) return false;
      for (const field of ["title", "content"]) if (first[field] !== undefined && !text(first[field])) return false;
      for (const field of ["x", "y", "colorIndex"]) if (first[field] !== undefined && (typeof first[field] !== "number" || !Number.isFinite(first[field]))) return false;
      if (first.colorIndex !== undefined && (!Number.isInteger(first.colorIndex) || Number(first.colorIndex) < 0 || Number(first.colorIndex) > 7)) return false;
      if (first.cardType !== undefined && !["note", "reminder", "daily-checkin", "hydration", "mood"].includes(String(first.cardType))) return false;
      if (first.reminderEnabled !== undefined && typeof first.reminderEnabled !== "boolean") return false;
      return first.reminderTime === undefined || first.reminderTime === null || text(first.reminderTime);
    }
    case "cards.update": return args.length === 2 && key(first) && object(second) && (second.content === undefined || text(second.content));
    case "notify.send": return args.length === 1 && object(first) && text(first.title) && text(first.body);
    case "ai.generate": return args.length <= 1 && (first === undefined || text(first));
    case "system.mediaControl": return args.length === 1 && ["play", "pause", "toggle", "next", "previous", "playPause"].includes(String(first));
    case "network.get": case "network.post": return args.length >= 1 && args.length <= 2 && text(first) && (second === undefined || object(second));
    case "events.emit": return args.length >= 1 && args.length <= 2 && key(first);
    default: return true; // Dispatch rejects unknown modules and methods with their existing error contract.
  }
}
