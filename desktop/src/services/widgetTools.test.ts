import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { recognizeImage, selectImage, historyRequest, clearNativeTool } from "./widgetTools";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => { vi.mocked(invoke).mockReset(); });
describe("host native tools boundary", () => {
  it("accepts chooser cancellation and recognized text, without passing file paths", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(null).mockResolvedValueOnce("识别\nLocal text");
    await expect(recognizeImage(new AbortController().signal)).resolves.toBeNull();
    await expect(recognizeImage(new AbortController().signal)).resolves.toBe("识别\nLocal text");
    expect(invoke).toHaveBeenCalledWith("recognize_widget_image", {});
  });
  it("discards cancelled and malformed native results", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const pending = recognizeImage(controller.signal);
    const check = expect(pending).rejects.toThrow("tool_cancelled");
    controller.abort(); await check; finish("late text");
    vi.mocked(invoke).mockResolvedValue({ token: "x", width: 0, height: 10, preview: "file:///private/image.png" });
    await expect(selectImage(new AbortController().signal)).rejects.toThrow("tool_invalid_response");
  });
  it("validates every history item and never exposes raw native errors", async () => {
    vi.mocked(invoke).mockResolvedValue({ recording: false, stopping: false, entries: [{ id: "1", text: "safe fixture", createdAt: 1 }], skipped: 0, failed: false });
    await expect(historyRequest({ method: "status" }, new AbortController().signal)).resolves.toHaveProperty("entries.0.text", "safe fixture");
    vi.mocked(invoke).mockResolvedValue({ recording: true, entries: [{ id: "1", text: 123 }] });
    await expect(historyRequest({ method: "status" }, new AbortController().signal)).rejects.toThrow("tool_invalid_response");
    vi.mocked(invoke).mockRejectedValue("secret native path");
    await expect(recognizeImage(new AbortController().signal)).rejects.toThrow("tool_unavailable");
  });
  it("cleanup only targets declared tools", async () => {
    await clearNativeTool("com.pinwall.clock"); expect(invoke).not.toHaveBeenCalled();
    vi.mocked(invoke).mockResolvedValue(null);
    await clearNativeTool("com.pinwall.clipboard-history");
    expect(invoke).toHaveBeenCalledExactlyOnceWith("revoke_widget_tool", { widgetId: "com.pinwall.clipboard-history" });
  });
});
