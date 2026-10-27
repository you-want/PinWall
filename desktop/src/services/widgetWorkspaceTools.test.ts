import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { originalPixel, screenRequest, shelfRequest } from "./widgetWorkspaceTools";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => vi.mocked(invoke).mockReset());
const signal = () => new AbortController().signal;
describe("file shelf and screen host boundary", () => {
  it("rejects malformed and unbounded shelf references", async () => {
    const entry = { id: "1-2-3", name: "fixture.txt", bytes: 10, addedAt: 1000, expiresAt: 1000 + 7 * 86400000, available: true };
    vi.mocked(invoke).mockResolvedValue({ entries: [entry], added: 1, skipped: 0 });
    await expect(shelfRequest({ method: "activate" }, signal())).resolves.toHaveProperty("entries.0.name", "fixture.txt");
    for (const entries of [[entry, entry], [{ ...entry, bytes: 101 * 1024 * 1024 }], [{ ...entry, expiresAt: 0 }]]) {
      vi.mocked(invoke).mockResolvedValue({ entries, added: 0, skipped: 0 });
      await expect(shelfRequest({ method: "status" }, signal())).rejects.toThrow("tool_invalid_response");
    }
  });
  it("checks colors, OCR, cancellation and screenshot pixel budgets", async () => {
    for (const value of [{ kind: "cancelled" }, { kind: "text", text: "本地屏幕文字" }, { kind: "color", hex: "#0C2238", r: 12, g: 34, b: 56, copied: false }]) {
      vi.mocked(invoke).mockResolvedValue(value);
      await expect(screenRequest({ method: "capture" }, signal())).resolves.toEqual(value);
    }
    for (const value of [{ kind: "color", hex: "#FFFFFF", r: 0, g: 0, b: 0, copied: false }, { kind: "capture", image: { token: "x", width: 8192, height: 8192, preview: "data:image/png;base64,AAAA" } }, { kind: "text", text: "x".repeat(65537) }]) {
      vi.mocked(invoke).mockResolvedValue(value);
      await expect(screenRequest({ method: "capture" }, signal())).rejects.toThrow("tool_invalid_response");
    }
  });
  it("discards late capture replies and preserves a stable permission failure", async () => {
    let finish!: (v: unknown) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController(); const pending = screenRequest({ method: "capture" }, controller.signal);
    const check = expect(pending).rejects.toThrow("tool_cancelled"); controller.abort(); await check; finish({ kind: "text", text: "late" });
    vi.mocked(invoke).mockRejectedValue("screen_permission_denied");
    await expect(screenRequest({ method: "capture" }, signal())).rejects.toThrow("screen_permission_denied");
  });
  it("maps displayed edges and midpoints to valid original pixel coordinates", () => {
    expect(originalPixel(0, 800)).toBe(0); expect(originalPixel(0.5, 800)).toBe(400);
    expect(originalPixel(1, 800)).toBe(799); expect(originalPixel(-0.5, 800)).toBe(0); expect(originalPixel(1.5, 800)).toBe(799);
  });
});
