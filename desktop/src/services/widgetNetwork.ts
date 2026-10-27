import { invoke } from "@tauri-apps/api/core";
const errors = new Set(["widget_network_denied", "widget_network_invalid", "widget_network_timeout", "widget_network_limit", "widget_network_busy", "widget_network_redirect", "widget_network_not_json", "widget_network_cancelled"]);
export async function widgetNetwork(widgetId: string, method: "get" | "post", url: string, options: unknown, signal?: AbortSignal): Promise<{ status: number; data: unknown }> {
  if (signal?.aborted) throw new Error("widget_network_cancelled");
  const value = options && typeof options === "object" && !Array.isArray(options) ? options as Record<string, unknown> : {};
  const inputHeaders = value.headers && typeof value.headers === "object" && !Array.isArray(value.headers) ? value.headers as Record<string, unknown> : {};
  const headers = Object.fromEntries(Object.entries(inputHeaders).filter((item): item is [string, string] => typeof item[1] === "string"));
  const body = method === "post" && value.body !== undefined ? typeof value.body === "string" ? value.body : JSON.stringify(value.body) : null;
  if (body !== null && new TextEncoder().encode(body).length > 1024 * 1024) throw new Error("widget_network_limit");
  const requestId = crypto.randomUUID();
  let abort = () => {};
  try {
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => {
        void invoke("cancel_widget_network", { requestId }).catch(() => console.warn("[WidgetNetwork] Cancellation delivery failed"));
        reject(new Error("widget_network_cancelled"));
      };
      signal?.addEventListener("abort", abort, { once: true });
    });
    const result: unknown = await Promise.race([invoke("widget_network_request", { request: { requestId, widgetId, method, url, headers, body } }), cancelled]);
    if (signal?.aborted) throw new Error("widget_network_cancelled");
    if (!result || typeof result !== "object" || !("status" in result) || typeof result.status !== "number" || !Number.isInteger(result.status) || result.status < 100 || result.status > 599 || !("data" in result)) throw new Error("widget_network_invalid");
    return { status: result.status, data: result.data };
  } catch (failure: unknown) {
    const code = typeof failure === "string" ? failure : failure instanceof Error ? failure.message : "";
    throw new Error(errors.has(code) ? code : "widget_network_unavailable");
  } finally { signal?.removeEventListener("abort", abort); }
}
