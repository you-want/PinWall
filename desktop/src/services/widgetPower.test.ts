import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createWidgetPowerSession } from "./widgetPower";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const manifest = { id: "com.pinwall.keep-awake", permissions: ["power"] } as const;

describe("widget power session", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async command => command === "open_widget_power_session" ? "host-only-token" : { supported: true, active: false, endsAt: null });
  });

  it("opens lazily, reuses a session and never puts the token in widget data", async () => {
    const session = createWidgetPowerSession(manifest);
    expect(invoke).not.toHaveBeenCalled();
    const status = await session.request({ method: "status" });
    await session.request({ method: "start", minutes: 25 });
    expect(vi.mocked(invoke).mock.calls.filter(([c]) => c === "open_widget_power_session")).toHaveLength(1);
    expect(invoke).toHaveBeenCalledWith("widget_power_request", { token: "host-only-token", action: { method: "start", minutes: 25 } });
    expect(status).not.toHaveProperty("token");
    await session.dispose();
    await expect(session.request({ method: "status" })).rejects.toThrow("power_session_closed");
  });

  it("denies a copied official label or missing permission before invoking native code", async () => {
    await expect(createWidgetPowerSession({ ...manifest, id: "com.other.tool" }).request({ method: "start", minutes: 25 })).rejects.toThrow("power_permission_denied");
    await expect(createWidgetPowerSession({ ...manifest, permissions: [] }).request({ method: "status" })).rejects.toThrow("power_permission_denied");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("revokes a session that opens after its frame has unmounted", async () => {
    let resolveOpen!: (token: string) => void;
    vi.mocked(invoke).mockImplementation(command => command === "open_widget_power_session"
      ? new Promise<string>(resolve => { resolveOpen = resolve; }) : Promise.resolve(null));
    const session = createWidgetPowerSession(manifest);
    const pending = session.request({ method: "start", minutes: 25 });
    const rejected = expect(pending).rejects.toThrow("power_session_closed");
    const disposing = session.dispose();
    resolveOpen("late-token");
    await rejected; await disposing;
    expect(invoke).toHaveBeenCalledWith("close_widget_power_session", { token: "late-token" });
    expect(vi.mocked(invoke).mock.calls.some(([c]) => c === "widget_power_request")).toBe(false);
  });

  it("can retry after an opening failure and disposes only once", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("power_unavailable"));
    const session = createWidgetPowerSession(manifest);
    await expect(session.request({ method: "status" })).rejects.toThrow();
    await session.request({ method: "status" });
    await session.dispose(); await session.dispose();
    expect(vi.mocked(invoke).mock.calls.filter(([c]) => c === "close_widget_power_session")).toHaveLength(1);
  });
});
