import { invoke } from "@tauri-apps/api/core";
import type {
  WidgetManifest,
  WidgetPermission,
  WidgetBridgeRequest,
  WidgetBridgeResponse,
} from "../types";
import { useCardStore } from "../stores/cardStore";
import { useLanguageStore } from "../stores/languageStore";
import { getSettings } from "./storage";

/**
 * Widget Host API Bridge
 *
 * 处理 Widget iframe 通过 postMessage 发送的请求，
 * 路由到 PinWall 宿主内部能力，并根据 manifest.permissions 做权限校验。
 */

/** 事件订阅器 */
type EventSubscriber = (event: string, payload: any) => void;
const eventSubscribers = new Map<string, Set<EventSubscriber>>();

const BLOCKED_NETWORK_HOSTS = new Set([
  "localhost",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
]);

const BLOCKED_NETWORK_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "host",
  "origin",
  "referer",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "user-agent",
]);

/** 向所有订阅者广播应用事件（供 Widget 监听） */
export function emitWidgetEvent(event: string, payload?: any) {
  const subs = eventSubscribers.get("*");
  subs?.forEach((cb) => cb(event, payload));
  const specific = eventSubscribers.get(event);
  specific?.forEach((cb) => cb(event, payload));
}

/** 注册事件订阅（WidgetFrame 使用） */
export function subscribeWidgetEvent(
  event: string,
  cb: EventSubscriber
): () => void {
  if (!eventSubscribers.has(event)) {
    eventSubscribers.set(event, new Set());
  }
  eventSubscribers.get(event)!.add(cb);
  return () => {
    eventSubscribers.get(event)?.delete(cb);
  };
}

/** 检查 Widget 是否有某个权限 */
function hasPermission(manifest: WidgetManifest, perm: WidgetPermission): boolean {
  return manifest.permissions.includes(perm);
}

/** 构建错误响应 */
function errorResponse(id: string, error: string): WidgetBridgeResponse {
  return { type: "response", id, success: false, error };
}

/** 构建成功响应 */
function successResponse(id: string, data?: any): WidgetBridgeResponse {
  return { type: "response", id, success: true, data };
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function assertAllowedNetworkUrl(input: unknown): URL {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error("Network URL must be a non-empty string");
  }

  const parsed = new URL(input);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Network URL protocol must be http or https");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    BLOCKED_NETWORK_HOSTS.has(hostname) ||
    hostname.endsWith(".local") ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error("Network URL host is not allowed");
  }

  return parsed;
}

function sanitizeNetworkHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return {};
  }

  return Object.entries(headers as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [name, value]) => {
      const normalizedName = name.toLowerCase();
      if (BLOCKED_NETWORK_HEADER_NAMES.has(normalizedName)) {
        return acc;
      }
      if (typeof value === "string") {
        acc[name] = value;
      }
      return acc;
    },
    {}
  );
}

/**
 * 处理来自 Widget iframe 的 Bridge 请求
 * @param request - Widget 发来的请求
 * @param manifest - 该 Widget 的 manifest（用于权限校验）
 * @returns 响应消息
 */
export async function handleBridgeRequest(
  request: WidgetBridgeRequest,
  manifest: WidgetManifest
): Promise<WidgetBridgeResponse> {
  const { id, module, method, args = [] } = request;

  // ── storage（基础能力，所有 Widget 可用）──
  if (module === "storage") {
    try {
      // Widget 存储使用 Tauri invoke 读写独立文件
      switch (method) {
        case "get": {
          const data = await invoke<Record<string, any>>("read_widget_storage", {
            id: manifest.id,
          });
          const value = data?.[args[0]] ?? null;
          return successResponse(id, value);
        }
        case "set": {
          const data = await invoke<Record<string, any>>("read_widget_storage", {
            id: manifest.id,
          });
          data[args[0]] = args[1];
          await invoke("write_widget_storage", { id: manifest.id, data });
          return successResponse(id);
        }
        case "remove": {
          const data = await invoke<Record<string, any>>("read_widget_storage", {
            id: manifest.id,
          });
          delete data[args[0]];
          await invoke("write_widget_storage", { id: manifest.id, data });
          return successResponse(id);
        }
        case "clear": {
          await invoke("write_widget_storage", { id: manifest.id, data: {} });
          return successResponse(id);
        }
        default:
          return errorResponse(id, `Unknown storage method: ${method}`);
      }
    } catch (err: any) {
      return errorResponse(id, `Storage error: ${err?.message || err}`);
    }
  }

  // ── theme（基础能力）──
  if (module === "theme") {
    return successResponse(id, {
      mode: "light", // TODO: 后续支持 dark mode
      colors: {
        primary: "#6366f1",
        background: "rgba(255, 255, 255, 0.9)",
        text: "#1a1a1a",
        muted: "#6b7280",
        border: "rgba(0, 0, 0, 0.1)",
      },
      fonts: {
        body: "'Inter Variable', -apple-system, BlinkMacSystemFont, sans-serif",
      },
    });
  }

  // ── i18n（基础能力）──
  if (module === "i18n") {
    switch (method) {
      case "getLocale":
        return successResponse(id, useLanguageStore.getState().lang);
      default:
        return errorResponse(id, `Unknown i18n method: ${method}`);
    }
  }

  // ── notify（基础能力）──
  if (module === "notify") {
    // TODO: 集成通知窗口
    console.log("[WidgetBridge] notify:", args[0]);
    return successResponse(id);
  }

  // ── settings（Widget 自身的设置，基础能力）──
  if (module === "settings") {
    // Widget 设置由 widgetStore 管理，通过 WidgetFrame 的 props 传入
    // 此处返回空，实际通过 iframe 初始化时注入
    return successResponse(id, {});
  }

  // === 以下模块需要对应权限 ===

  // ── cards [cards] 权限 ──
  if (module === "cards") {
    if (!hasPermission(manifest, "cards")) {
      return errorResponse(id, "Permission denied: cards");
    }
    try {
      const store = useCardStore.getState();
      switch (method) {
        case "list":
          return successResponse(id, store.cards);
        case "create": {
          const card = args[0];
          store.createCard(
            card.title || "",
            card.content || "",
            card.colorIndex ?? 0,
            card.cardType || "note",
            card.reminderEnabled ?? false,
            card.reminderTime ?? null,
            card.x ?? 0,
            card.y ?? 0
          );
          return successResponse(id);
        }
        case "update": {
          const [cardId, patch] = args;
          if (patch.content !== undefined) {
            store.updateContent(cardId, patch.content);
          }
          return successResponse(id);
        }
        case "delete":
          store.closeCard(args[0]);
          return successResponse(id);
        default:
          return errorResponse(id, `Unknown cards method: ${method}`);
      }
    } catch (err: any) {
      return errorResponse(id, `Cards error: ${err?.message || err}`);
    }
  }

  // ── app [app] 权限 ──
  if (module === "app") {
    if (!hasPermission(manifest, "app")) {
      return errorResponse(id, "Permission denied: app");
    }
    switch (method) {
      case "getVersion":
        return successResponse(id, "0.1.0"); // TODO: 从 package.json 读取
      case "getLocale":
        return successResponse(id, useLanguageStore.getState().lang);
      default:
        return errorResponse(id, `Unknown app method: ${method}`);
    }
  }

  // ── ai [ai] 权限 ──
  if (module === "ai") {
    if (!hasPermission(manifest, "ai")) {
      return errorResponse(id, "Permission denied: ai");
    }
    try {
      const settings = await getSettings();
      if (!settings.ai?.enabled || !settings.ai?.apiKey) {
        return errorResponse(id, "AI service not configured");
      }
      // 调用 AI service
      const { generateNoteContent } = await import("./aiService");
      const lang = useLanguageStore.getState().lang;
      const result = await generateNoteContent(settings.ai!, args[0] || "", lang);
      return successResponse(id, result);
    } catch (err: any) {
      return errorResponse(id, `AI error: ${err?.message || err}`);
    }
  }

  // ── system [system] 权限 ──
  if (module === "system") {
    if (!hasPermission(manifest, "system")) {
      return errorResponse(id, "Permission denied: system");
    }
    try {
      const info = await invoke<any>("get_system_info", { category: method });
      return successResponse(id, info);
    } catch (err: any) {
      return errorResponse(id, `System error: ${err?.message || err}`);
    }
  }

  // ── network [network] 权限 ──
  if (module === "network") {
    if (!hasPermission(manifest, "network")) {
      return errorResponse(id, "Permission denied: network");
    }
    try {
      const [url, options] = args;
      if (method !== "get" && method !== "post") {
        return errorResponse(id, `Unknown network method: ${method}`);
      }
      const parsedUrl = assertAllowedNetworkUrl(url);
      const headers = sanitizeNetworkHeaders(options?.headers);
      const fetchOptions: RequestInit = {
        method: method === "post" ? "POST" : "GET",
        headers,
        credentials: "omit",
      };
      if (method === "post" && options?.body) {
        fetchOptions.body =
          typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body);
        (fetchOptions.headers as Record<string, string>)["Content-Type"] ??=
          "application/json";
      }
      const res = await fetch(parsedUrl.toString(), fetchOptions);
      const data = await res.json();
      return successResponse(id, { status: res.status, data });
    } catch (err: any) {
      return errorResponse(id, `Network error: ${err?.message || err}`);
    }
  }

  // ── events [events] 权限 ──
  if (module === "events") {
    if (!hasPermission(manifest, "events")) {
      return errorResponse(id, "Permission denied: events");
    }
    // events 模块的事件推送由 WidgetFrame 单独处理（subscribe 模式）
    // 此处仅处理主动 emit
    if (method === "emit") {
      emitWidgetEvent(args[0], args[1]);
      return successResponse(id);
    }
    return errorResponse(id, `Unknown events method: ${method}`);
  }

  return errorResponse(id, `Unknown module: ${module}`);
}
