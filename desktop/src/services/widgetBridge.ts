import { widgetNetwork } from "./widgetNetwork";
import { invoke } from "@tauri-apps/api/core";
import type {
  WidgetManifest,
  WidgetPermission,
  WidgetBridgeRequest,
  WidgetBridgeResponse,
  WidgetPowerAction,
} from "../types";
import { useCardStore } from "../stores/cardStore";
import { useLanguageStore } from "../stores/languageStore";
import { getSettings } from "./storage";
import { generateNoteContent } from "./aiService";
import { version as appVersion } from "../../package.json";
import { parseWidgetRequest, validWidgetArguments } from "./widgetProtocol";
import type { createWidgetPowerSession } from "./widgetPower";
import { readWidgetMetrics } from "./widgetMetrics";
import { CLIPBOARD_WIDGET_ID, type ClipboardNoteResult } from "./widgetClipboard";
import { NATIVE_TOOLS, historyStatus, type NativeTool, type ToolResult } from "./widgetTools";

/**
 * Widget Host API Bridge
 *
 * 处理 Widget iframe 通过 postMessage 发送的请求，
 * 路由到 PinWall 宿主内部能力，并根据 manifest.permissions 做权限校验。
 */

/** 事件订阅器 */
type EventSubscriber = (event: string, payload: unknown) => void;
const eventSubscribers = new Map<string, Set<EventSubscriber>>();

/** 向所有订阅者广播应用事件（供 Widget 监听） */
export function emitWidgetEvent(event: string, payload?: unknown) {
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
function successResponse(id: string, data?: unknown): WidgetBridgeResponse {
  return { type: "response", id, success: true, data };
}

/**
 * 处理来自 Widget iframe 的 Bridge 请求
 * @param request - Widget 发来的请求
 * @param manifest - 该 Widget 的 manifest（用于权限校验）
 * @returns 响应消息
 */
export async function handleBridgeRequest(
  request: WidgetBridgeRequest,
  manifest: WidgetManifest,
  context?: { settings?: () => Record<string, unknown>; signal?: AbortSignal; power?: ReturnType<typeof createWidgetPowerSession>; clipboard?: () => Promise<ClipboardNoteResult>; tools?: (kind: NativeTool) => Promise<ToolResult> }
): Promise<WidgetBridgeResponse> {
  if (!parseWidgetRequest(request) || !validWidgetArguments(request)) {
    return errorResponse(typeof request?.id === "string" ? request.id.slice(0, 128) : "invalid", "Invalid widget request");
  }
  const { id, module, method, args = [] } = request;

  if (context?.signal?.aborted) return errorResponse(id, "Widget session closed");
  if (Object.prototype.hasOwnProperty.call(NATIVE_TOOLS, module)) {
    const kind = module as NativeTool; const tool = NATIVE_TOOLS[kind];
    if (manifest.id !== tool.id || !hasPermission(manifest, tool.permission)) return errorResponse(id, "Permission denied: native tool");
    try {
      if (kind === "clipboardHistory" && method === "status" && context?.signal) return successResponse(id, await historyStatus(context.signal));
      if (method !== "open" || !context?.tools) return errorResponse(id, "Unknown native tool method");
      return successResponse(id, await context.tools(kind));
    } catch { return errorResponse(id, "tool_unavailable"); }
  }
  if (module === "clipboard") {
    if (manifest.id !== CLIPBOARD_WIDGET_ID || !hasPermission(manifest, "clipboard") || !context?.clipboard) return errorResponse(id, "Permission denied: clipboard");
    if (method !== "openImport") return errorResponse(id, "Unknown clipboard method");
    try { return successResponse(id, await context.clipboard()); }
    catch { return errorResponse(id, "clipboard_unavailable"); }
  }
  if (["storage", "theme", "i18n", "notify"].includes(module) && !hasPermission(manifest, module as WidgetPermission)) {
    return errorResponse(id, `Permission denied: ${module}`);
  }
  if (module === "power") {
    if (!hasPermission(manifest, "power") || !context?.power) return errorResponse(id, "Permission denied: power");
    if (method !== "start" && method !== "stop" && method !== "status") return errorResponse(id, "Unknown power method");
    try {
      const action: WidgetPowerAction = method === "start" ? { method, minutes: args[0] as number } : { method };
      return successResponse(id, await context.power.request(action));
    } catch (error: unknown) {
      console.warn("[WidgetBridge] Power request failed", { method });
      const code = typeof error === "string" ? error : error instanceof Error ? error.message : "";
      return errorResponse(id, code === "power_unsupported" ? code : code === "power_untrusted_widget" ? "power_reinstall_required" : "power_request_failed");
    }
  }

  // ── storage（需声明权限，仅访问当前 Widget 数据）──
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
        case "set":
          await invoke("mutate_widget_storage", { id: manifest.id, mutation: { method: "set", key: args[0], value: args[1] ?? null } });
          return successResponse(id);
        case "remove":
          await invoke("mutate_widget_storage", { id: manifest.id, mutation: { method: "remove", key: args[0] } });
          return successResponse(id);
        case "clear":
          await invoke("mutate_widget_storage", { id: manifest.id, mutation: { method: "clear" } });
          return successResponse(id);
        default:
          return errorResponse(id, `Unknown storage method: ${method}`);
      }
    } catch (err: any) {
      return errorResponse(id, "widget_storage_failed");
    }
  }

  // ── theme（基础能力）──
  if (module === "theme") {
    if (method !== "get") return errorResponse(id, "Unknown theme method");
    try {
      await getSettings(); // Ensure settings are loaded
      return successResponse(id, {
        mode: "light",
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
    } catch (err: any) {
      return errorResponse(id, "widget_theme_failed");
    }
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
    if (method !== "send") return errorResponse(id, "Unknown notify method");
    try {
      const result=await invoke<unknown>("widget_notification_request",{widgetId:manifest.id,title:args[0].title,body:args[0].body});
      if (!result || typeof result!=="object" || !("submitted" in result) || result.submitted!==true) return errorResponse(id,"widget_notification_failed");
      return successResponse(id,{submitted:true});
    } catch (failure: unknown) {
      const code=typeof failure==="string"?failure:"";
      return errorResponse(id,["widget_notification_denied","widget_notification_limit","widget_notification_timeout","desktop_unsupported"].includes(code)?code:"widget_notification_failed");
    }
  }

  // ── settings（Widget 自身的设置，基础能力）──
  if (module === "settings") {
    if (method !== "get" && method !== "getAll") return errorResponse(id, "Unknown settings method");
    const settings = context?.settings?.() ?? {};
    return successResponse(id, method === "getAll" ? settings : Object.prototype.hasOwnProperty.call(settings,args[0]) ? settings[args[0]] : null);
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
          const cardId = store.createCard(
            card.title || "",
            card.content || "",
            card.colorIndex ?? 0,
            card.cardType || "note",
            card.reminderEnabled ?? false,
            card.reminderTime ?? null,
            card.x ?? 0,
            card.y ?? 0
          );
          return successResponse(id, { cardId });
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
      return errorResponse(id, "widget_cards_failed");
    }
  }

  // ── app [app] 权限 ──
  if (module === "app") {
    if (!hasPermission(manifest, "app")) {
      return errorResponse(id, "Permission denied: app");
    }
    switch (method) {
      case "getVersion":
        try {
          const version = await invoke<string>("get_app_version");
          return successResponse(id, version);
        } catch {
          // Fallback when running outside Tauri (e.g., tests)
          return successResponse(id, appVersion);
        }
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
    if (method !== "generate") return errorResponse(id, "Unknown AI method");
    try {
      const settings = await getSettings();
      if (!settings.ai?.enabled || !settings.ai?.apiKey) {
        return errorResponse(id, "AI service not configured");
      }
      // 调用 AI service (statically imported to avoid Rollup chunk conflict)
      const lang = useLanguageStore.getState().lang;
      const result = await generateNoteContent(settings.ai!, args[0] || "", lang);
      return successResponse(id, result);
    } catch (err: any) {
      return errorResponse(id, "widget_ai_failed");
    }
  }

  // ── system [system] 权限 ──
  if (module === "system") {
    if (!hasPermission(manifest, "system")) {
      return errorResponse(id, "Permission denied: system");
    }
    if (!["getMetrics", "getCPUUsage", "getBattery", "getMemoryInfo", "getMediaInfo", "mediaControl"].includes(method)) return errorResponse(id, "Unknown system method");
    if (method === "getMediaInfo" || method === "mediaControl") return errorResponse(id, "media_use_audio_tool");
    if (method === "getMetrics") {
      try { return successResponse(id, await readWidgetMetrics()); }
      catch { return errorResponse(id, "metrics_unavailable"); }
    }
    try {
      const info = await invoke<any>("get_system_info", { category: method });
      return successResponse(id, info);
    } catch (err: any) {
      return errorResponse(id, "metrics_unavailable");
    }
  }

  // ── network [network] 权限 ──
  if (module === "network") {
    if (!hasPermission(manifest, "network")) {
      return errorResponse(id, "Permission denied: network");
    }
    try {
      if (method !== "get" && method !== "post") return errorResponse(id, "Unknown network method");
      return successResponse(id, await widgetNetwork(manifest.id, method, args[0], args[1], context?.signal));
    } catch (error: unknown) {
      return errorResponse(id, error instanceof Error ? error.message : "widget_network_unavailable");
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
      const event=args[0] as string;
      if (!event.startsWith(`widget:${manifest.id}:`) || !/^[a-zA-Z0-9:._-]{1,256}$/.test(event)) return errorResponse(id,"Widget events must use their own namespace");
      emitWidgetEvent(event, args[1]);
      return successResponse(id);
    }
    return errorResponse(id, `Unknown events method: ${method}`);
  }

  return errorResponse(id, `Unknown module: ${module}`);
}
