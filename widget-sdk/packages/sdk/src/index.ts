/**
 * @pinwall/widget-sdk
 *
 * PinWall Widget SDK - 在 Widget iframe 内运行，
 * 通过 postMessage 与 PinWall 宿主通信。
 */

// ─── 类型定义 ────────────────────────────────────────────

export type WidgetPermission =
  | "storage" | "theme" | "notify" | "cards"
  | "events" | "app" | "ai" | "system"
  | "network" | "i18n";

export interface WidgetSize {
  width: number;
  height: number;
}

export interface WidgetConfig {
  widgetId: string;
  settings: Record<string, any>;
  locale: string;
}

export interface ThemeColors {
  primary: string;
  background: string;
  text: string;
  muted: string;
  border: string;
}

export interface ThemeFonts {
  body: string;
}

export interface Theme {
  mode: "light" | "dark";
  colors: ThemeColors;
  fonts: ThemeFonts;
}

export interface CardData {
  id: string;
  title: string;
  content: string;
  x: number;
  y: number;
  colorIndex: number;
  cardType: string;
  collapsed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BatteryInfo {
  level: number;
  charging: boolean;
}

export interface MemoryInfo {
  total: number;
  used: number;
  free: number;
}

// ─── Bridge 消息协议 ─────────────────────────────────────

interface BridgeRequest {
  type: "request";
  id: string;
  module: string;
  method: string;
  args?: any[];
}

interface BridgeResponse {
  type: "response";
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

interface BridgeEvent {
  type: "event";
  event: string;
  payload?: any;
}

type BridgeMessage = BridgeResponse | BridgeEvent;

// ─── 内部工具 ────────────────────────────────────────────

let _requestId = 0;
const _pendingRequests = new Map<string, {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}>();
const _eventHandlers = new Map<string, Set<(payload: any) => void>>();

function generateRequestId(): string {
  return `req_${++_requestId}_${Date.now()}`;
}

/** 向宿主发送请求并等待响应 */
function sendRequest(module: string, method: string, args?: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = generateRequestId();
    _pendingRequests.set(id, { resolve, reject });

    const msg: BridgeRequest = { type: "request", id, module, method, args };
    window.parent.postMessage(msg, "*");

    // 超时处理
    setTimeout(() => {
      if (_pendingRequests.has(id)) {
        _pendingRequests.delete(id);
        reject(new Error(`Bridge request timeout: ${module}.${method}`));
      }
    }, 10000);
  });
}

/** 监听来自宿主的消息 */
function setupMessageListener() {
  window.addEventListener("message", (e: MessageEvent<BridgeMessage>) => {
    const msg = e.data;
    if (!msg) return;

    if (msg.type === "response") {
      const pending = _pendingRequests.get(msg.id);
      if (pending) {
        _pendingRequests.delete(msg.id);
        if (msg.success) {
          pending.resolve(msg.data);
        } else {
          pending.reject(new Error(msg.error || "Unknown error"));
        }
      }
    } else if (msg.type === "event") {
      const handlers = _eventHandlers.get(msg.event);
      handlers?.forEach((cb) => cb(msg.payload));
      // 通配符
      const wildcardHandlers = _eventHandlers.get("*");
      wildcardHandlers?.forEach((cb) => cb({ event: msg.event, payload: msg.payload }));
    }
  });
}

// ─── 公共 API ────────────────────────────────────────────

type Unsubscribe = () => void;

/** 生命周期：Widget 就绪 */
function onReady(cb: (config: WidgetConfig) => void): Unsubscribe {
  const handler = (payload: any) => cb(payload as WidgetConfig);
  if (!_eventHandlers.has("pinwall:ready")) {
    _eventHandlers.set("pinwall:ready", new Set());
  }
  _eventHandlers.get("pinwall:ready")!.add(handler);
  return () => { _eventHandlers.get("pinwall:ready")?.delete(handler); };
}

/** 生命周期：Widget 销毁 */
function onDestroy(cb: () => void): Unsubscribe {
  const handler = () => cb();
  if (!_eventHandlers.has("pinwall:destroy")) {
    _eventHandlers.set("pinwall:destroy", new Set());
  }
  _eventHandlers.get("pinwall:destroy")!.add(handler);
  return () => { _eventHandlers.get("pinwall:destroy")?.delete(handler); };
}

// -- Storage --
const storage = {
  get: <T = any>(key: string) => sendRequest("storage", "get", [key]) as Promise<T | null>,
  set: (key: string, value: any) => sendRequest("storage", "set", [key, value]) as Promise<void>,
  remove: (key: string) => sendRequest("storage", "remove", [key]) as Promise<void>,
  clear: () => sendRequest("storage", "clear") as Promise<void>,
};

// -- Settings --
const settings = {
  getAll: () => sendRequest("settings", "getAll") as Promise<Record<string, any>>,
  get: <T = any>(key: string) => sendRequest("settings", "get", [key]) as Promise<T>,
  onChange: (cb: (key: string, newVal: any, oldVal: any) => void): Unsubscribe => {
    const handler = (payload: any) => cb(payload.key, payload.newVal, payload.oldVal);
    if (!_eventHandlers.has("settings:changed")) {
      _eventHandlers.set("settings:changed", new Set());
    }
    _eventHandlers.get("settings:changed")!.add(handler);
    return () => { _eventHandlers.get("settings:changed")?.delete(handler); };
  },
};

// -- Theme --
const theme = {
  get: () => sendRequest("theme", "get") as Promise<Theme>,
  onChange: (cb: (theme: Theme) => void): Unsubscribe => {
    const handler = (payload: any) => cb(payload as Theme);
    if (!_eventHandlers.has("theme:changed")) {
      _eventHandlers.set("theme:changed", new Set());
    }
    _eventHandlers.get("theme:changed")!.add(handler);
    return () => { _eventHandlers.get("theme:changed")?.delete(handler); };
  },
};

// -- i18n --
const _messages: Record<string, Record<string, string>> = {};
let _currentLocale = "zh";

const i18n = {
  getLocale: () => _currentLocale,
  t: (key: string, params?: Record<string, string>): string => {
    let text = _messages[_currentLocale]?.[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, v);
      }
    }
    return text;
  },
  setMessages: (locale: string, messages: Record<string, string>) => {
    _messages[locale] = { ..._messages[locale], ...messages };
  },
  onLocaleChange: (cb: (locale: string) => void): Unsubscribe => {
    const handler = (payload: any) => {
      _currentLocale = payload.locale || payload;
      cb(_currentLocale);
    };
    if (!_eventHandlers.has("locale:changed")) {
      _eventHandlers.set("locale:changed", new Set());
    }
    _eventHandlers.get("locale:changed")!.add(handler);
    return () => { _eventHandlers.get("locale:changed")?.delete(handler); };
  },
};

// -- Notify --
function notify(opts: { title: string; body: string; icon?: string }): Promise<void> {
  return sendRequest("notify", "send", [opts]);
}

// -- Cards (需要 cards 权限) --
const cards = {
  list: (filter?: any) => sendRequest("cards", "list", [filter]) as Promise<CardData[]>,
  create: (card: Partial<CardData>) => sendRequest("cards", "create", [card]) as Promise<CardData>,
  update: (id: string, patch: Partial<CardData>) => sendRequest("cards", "update", [id, patch]) as Promise<CardData>,
  delete: (id: string) => sendRequest("cards", "delete", [id]) as Promise<void>,
  onCardChange: (cb: (event: string, card: CardData) => void): Unsubscribe => {
    const handler = (payload: any) => cb(payload.event, payload.card);
    if (!_eventHandlers.has("card:changed")) {
      _eventHandlers.set("card:changed", new Set());
    }
    _eventHandlers.get("card:changed")!.add(handler);
    return () => { _eventHandlers.get("card:changed")?.delete(handler); };
  },
};

// -- Events (需要 events 权限) --
const events = {
  on: (event: string, cb: (payload?: any) => void): Unsubscribe => {
    if (!_eventHandlers.has(event)) {
      _eventHandlers.set(event, new Set());
    }
    _eventHandlers.get(event)!.add(cb);
    return () => { _eventHandlers.get(event)?.delete(cb); };
  },
  emit: (event: string, payload?: any) => sendRequest("events", "emit", [event, payload]),
};

// -- App (需要 app 权限) --
const app = {
  openNewCardModal: () => sendRequest("app", "openNewCardModal"),
  arrangeCards: () => sendRequest("app", "arrangeCards"),
  getVersion: () => sendRequest("app", "getVersion") as Promise<string>,
  getLocale: () => sendRequest("app", "getLocale") as Promise<string>,
};

// -- AI (需要 ai 权限) --
const ai = {
  chat: (messages: { role: string; content: string }[]) =>
    sendRequest("ai", "chat", [messages]) as Promise<string>,
  generate: (prompt: string) =>
    sendRequest("ai", "generate", [prompt]) as Promise<string>,
};

// -- System (需要 system 权限) --
const system = {
  getBattery: () => sendRequest("system", "getBattery") as Promise<BatteryInfo>,
  getCPUUsage: () => sendRequest("system", "getCPUUsage") as Promise<number>,
  getMemoryInfo: () => sendRequest("system", "getMemoryInfo") as Promise<MemoryInfo>,
  getDiskUsage: () => sendRequest("system", "getDiskUsage") as Promise<any>,
};

// -- Network (需要 network 权限) --
const network = {
  get: (url: string, options?: any) => sendRequest("network", "get", [url, options]),
  post: (url: string, body: any, options?: any) => sendRequest("network", "post", [url, { ...options, body }]),
};

// ─── 导出 ────────────────────────────────────────────────

export const PinWall = {
  onReady,
  onDestroy,
  storage,
  settings,
  theme,
  i18n,
  notify,
  cards,
  events,
  app,
  ai,
  system,
  network,
};

// 自动初始化消息监听
setupMessageListener();

export default PinWall;
