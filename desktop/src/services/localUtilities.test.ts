import { describe, expect, it } from "vitest";
import { calculate, cleanLink } from "./localUtilities";
describe("offline utilities", () => {
  it("removes trackers but preserves repeated business parameters, fragments and signed links", () => {
    const result=cleanLink("https://example.com/p?utm_source=x&tag=a&tag=b&fbclid=y&q=测试#part");
    const url=new URL(result.url);expect(url.searchParams.getAll("tag")).toEqual(["a","b"]);expect(url.searchParams.get("q")).toBe("测试");expect(url.hash).toBe("#part");expect(result.removed).toBe(2);
    const signed="https://example.com/p?utm_source=x&X-Amz-Signature=secret";
    expect(cleanLink(signed)).toEqual({url:signed,removed:0,signed:true});
    for(const value of ["javascript:alert(1)","file:///private/data","https://user:pass@example.com/"])expect(()=>cleanLink(value)).toThrow();
  });
  it("evaluates precedence, unary powers, functions and constants without executing code", () => {
    expect(calculate("2+3*4")).toBe(14);expect(calculate("(2+3)*4")).toBe(20);expect(calculate("2^3^2")).toBe(512);expect(calculate("-2^2")).toBe(-4);expect(calculate("2^-3")).toBe(0.125);expect(calculate("sqrt(81)+abs(-3)")).toBe(12);expect(calculate("sin(pi/2)")).toBeCloseTo(1);expect(calculate("1e3 / 4")).toBe(250);
    for(const value of ["1/0","sqrt(-1)","10^99999","globalThis.alert(1)","1;fetch('https://example.com')","2(3)","","2+"])expect(()=>calculate(value)).toThrow();
  });
  it("bounds parser work and rejects excessive nesting", () => {
    expect(()=>calculate("(".repeat(40)+"1"+")".repeat(40))).toThrow();
    expect(()=>calculate("1+".repeat(300)+"1")).toThrow();
    expect(()=>cleanLink("https://example.com/"+"a".repeat(9000))).toThrow();
  });
});
