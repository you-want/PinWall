import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { widgetNetwork } from "./widgetNetwork";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
beforeEach(() => { vi.mocked(invoke).mockReset(); });
it("bounds UTF-8 request bodies before IO and validates native responses", async () => {
  await expect(widgetNetwork("com.test.tool", "post", "https://example.com", { body: "汉".repeat(400000) })).rejects.toThrow("widget_network_limit");
  expect(invoke).not.toHaveBeenCalled();
  vi.mocked(invoke).mockResolvedValue({ status: 200.5, data: {} });
  await expect(widgetNetwork("com.test.tool", "get", "https://example.com", {})).rejects.toThrow("widget_network_invalid");
});
it("cancels the native operation and never returns late results", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(invoke).mockImplementation(command => command === "widget_network_request" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(null));
  const controller = new AbortController();
  const pending = widgetNetwork("com.test.tool", "get", "https://example.com", {}, controller.signal);
  const assertion = expect(pending).rejects.toThrow("widget_network_cancelled"); controller.abort(); await assertion;
  expect(invoke).toHaveBeenCalledWith("cancel_widget_network", { requestId: expect.any(String) });
  finish({status:200,data:{late:true}});
});
it("sanitizes native errors without exposing URLs or credentials", async () => {
  vi.mocked(invoke).mockRejectedValue("private provider error");
  await expect(widgetNetwork("com.test.tool", "get", "https://example.com", {})).rejects.toThrow("widget_network_unavailable");
  vi.mocked(invoke).mockRejectedValue("widget_network_denied");
  await expect(widgetNetwork("com.test.tool", "get", "https://example.com", {})).rejects.toThrow("widget_network_denied");
});
