import { invoke } from "@tauri-apps/api/core";
import type { WidgetMetrics } from "../types";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function reading(value: unknown, valid: (data: unknown) => boolean): boolean {
  if (!record(value)) return false;
  if (value.status === "ok") return valid(value.value);
  return ["warmingUp", "notPresent", "unavailable", "unsupported"].includes(String(value.status));
}

function validSnapshot(value: unknown): value is WidgetMetrics {
  return record(value) && number(value.sampledAt) && value.sampledAt >= 0
    && reading(value.cpu, data => number(data) && data >= 0 && data <= 100)
    && reading(value.memory, data => record(data) && number(data.total) && data.total > 0 && number(data.inUse) && data.inUse >= 0 && data.inUse <= data.total)
    && reading(value.battery, data => record(data) && number(data.level) && data.level >= 0 && data.level <= 1 && typeof data.charging === "boolean" && typeof data.onAc === "boolean");
}

/** Native service caches across all callers; no sampling occurs without visible requests. */
export async function readWidgetMetrics(): Promise<WidgetMetrics> {
  let result: unknown;
  try {
    result = await invoke<unknown>("get_system_info", { category: "getMetrics" });
  } catch {
    console.warn("[WidgetMetrics] Native metrics request failed");
    throw new Error("metrics_unavailable");
  }
  if (!validSnapshot(result)) throw new Error("metrics_invalid_response");
  return result;
}
