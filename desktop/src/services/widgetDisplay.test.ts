import {describe,it,expect,vi} from "vitest";
import {invoke} from "@tauri-apps/api/core";
import {displayRequest,validDisplay} from "./widgetDisplay";
vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));
describe("EDR host boundary",()=>{
 it("rejects impossible display IDs, headroom and active states",()=>{
  const item={id:1,name:"HDR",potential:2,current:1.5};expect(validDisplay({displays:[item]})).toBe(true);for(const change of [{id:0},{potential:Infinity},{current:0},{id:0.5}])expect(validDisplay({displays:[{...item,...change}]})).toBe(false);
  expect(validDisplay({active:true,starting:false,display:0,gain:1.2,remaining:30,lastError:null})).toBe(false);
 });
 it("retains permission failures and rejects wrong-method results",async()=>{
  const signal=new AbortController().signal;vi.mocked(invoke).mockRejectedValueOnce("desktop_screen_denied");await expect(displayRequest({method:"start",display:1,gain:1.2,seconds:60},signal)).rejects.toThrow("desktop_screen_denied");
  vi.mocked(invoke).mockResolvedValueOnce({displays:[]});await expect(displayRequest({method:"status"},signal)).rejects.toThrow("tool_invalid_response");
 });
});
