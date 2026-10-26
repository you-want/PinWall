import { describe, expect, it } from "vitest";
import { parseWidgetRequest, prepareWidgetHtml } from "./widgetProtocol";

describe("widget protocol boundary", () => {
  const request = { type: "request", id: "r1", module: "power", method: "start", args: [25] };

  it("accepts legacy envelopes and protocol version 1", () => {
    expect(parseWidgetRequest(request)).toEqual(request);
    expect(parseWidgetRequest({ ...request, version: 1 })).not.toBeNull();
  });

  it.each([
    null, [], { ...request, id: "" }, { ...request, version: 2 },
    { ...request, args: "25" }, { ...request, args: [() => undefined] },
    { ...request, args: [JSON.parse('{"__proto__":{"polluted":true}}')] },
    { ...request, args: ["x".repeat(1024 * 1024)] },
  ])("rejects malformed, unsupported and oversized input", (value) => {
    expect(parseWidgetRequest(value)).toBeNull();
  });

  it("handles cycles without throwing", () => {
    const args: unknown[] = []; args.push(args);
    expect(parseWidgetRequest({ ...request, args })).toBeNull();
  });

  it("puts the host policy before widget content", () => {
    const html = prepareWidgetHtml('<meta http-equiv="Content-Security-Policy" content="default-src *"><script>hello()</script>');
    expect(html.indexOf("connect-src 'none'")).toBeLessThan(html.indexOf("default-src *"));
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain("form-action 'none'");
    expect(html).toContain("<script>hello()</script>");
  });
});
