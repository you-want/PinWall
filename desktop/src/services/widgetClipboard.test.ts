import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { readClipboardText } from "./widgetClipboard";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("one-shot clipboard read", () => {
  beforeEach(() => { vi.mocked(invoke).mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it("reads only when explicitly invoked and preserves text", async () => {
    expect(invoke).not.toHaveBeenCalled();
    vi.mocked(invoke).mockResolvedValue("Hello\n你好");
    await expect(readClipboardText(new AbortController().signal)).resolves.toBe("Hello\n你好");
    expect(invoke).toHaveBeenCalledExactlyOnceWith("read_widget_clipboard_text", { widgetId: "com.pinwall.clipboard-note" });
  });

  it.each([null, "   ", "x".repeat(65537)])("rejects invalid text before it reaches notes", async text => {
    vi.mocked(invoke).mockResolvedValue(text);
    await expect(readClipboardText(new AbortController().signal)).rejects.toThrow("clipboard_invalid");
  });

  it("cancels on close and discards a late result", async () => {
    let finish!: (text: string) => void;
    vi.mocked(invoke).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const pending = readClipboardText(controller.signal);
    const assertion = expect(pending).rejects.toThrow("clipboard_cancelled");
    controller.abort(); await assertion;
    finish("private text");
  });

  it("times out without surfacing raw native errors or keeping a timer", async () => {
    vi.useFakeTimers();
    vi.mocked(invoke).mockImplementation(() => new Promise(() => {}));
    const pending = readClipboardText(new AbortController().signal);
    const assertion = expect(pending).rejects.toThrow("clipboard_unavailable");
    await vi.advanceTimersByTimeAsync(8000); await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves only known public error codes", async () => {
    vi.mocked(invoke).mockRejectedValue("clipboard_sensitive");
    await expect(readClipboardText(new AbortController().signal)).rejects.toThrow("clipboard_sensitive");
    vi.mocked(invoke).mockRejectedValue("private native path");
    await expect(readClipboardText(new AbortController().signal)).rejects.toThrow("clipboard_unavailable");
    const controller = new AbortController(); controller.abort();
    vi.mocked(invoke).mockClear();
    await expect(readClipboardText(controller.signal)).rejects.toThrow("clipboard_cancelled");
    expect(invoke).not.toHaveBeenCalled();
  });
});
