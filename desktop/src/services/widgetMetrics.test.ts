import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { readWidgetMetrics } from "./widgetMetrics";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const snapshot = {
  sampledAt: 1234,
  cpu: { status: "ok", value: 37.5 },
  memory: { status: "ok", value: { total: 8192, inUse: 4096 } },
  battery: { status: "ok", value: { level: 0.85, charging: false, onAc: true } },
};

describe("widget metrics boundary", () => {
  beforeEach(() => { vi.mocked(invoke).mockReset(); });

  it("reads one typed snapshot instead of independently sampling each metric", async () => {
    vi.mocked(invoke).mockResolvedValue(snapshot);
    await expect(readWidgetMetrics()).resolves.toEqual(snapshot);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("get_system_info", { category: "getMetrics" });
  });

  it("retains independent unsupported, failed and absent states without fake zero values", async () => {
    const data = { sampledAt: 1234, cpu: { status: "warmingUp" }, memory: { status: "unavailable" }, battery: { status: "notPresent" } };
    vi.mocked(invoke).mockResolvedValue(data);
    await expect(readWidgetMetrics()).resolves.toEqual(data);
    vi.mocked(invoke).mockResolvedValue({ ...data, cpu: { status: "unsupported" } });
    await expect(readWidgetMetrics()).resolves.toHaveProperty("cpu.status", "unsupported");
  });

  it.each([
    null,
    { ...snapshot, cpu: { status: "ok", value: 101 } },
    { ...snapshot, cpu: { status: "ok", value: Number.NaN } },
    { ...snapshot, memory: { status: "ok", value: { total: 10, inUse: 11 } } },
    { ...snapshot, battery: { status: "ok", value: { level: -1, charging: false, onAc: true } } },
    { ...snapshot, battery: { status: "unknown" } },
    { ...snapshot, sampledAt: "now" },
  ])("rejects malformed native responses", async data => {
    vi.mocked(invoke).mockResolvedValue(data);
    await expect(readWidgetMetrics()).rejects.toThrow("metrics_invalid_response");
  });

  it("returns a stable failure without leaking native details", async () => {
    vi.mocked(invoke).mockRejectedValue("private filesystem or native error details");
    await expect(readWidgetMetrics()).rejects.toThrow("metrics_unavailable");
  });
});
