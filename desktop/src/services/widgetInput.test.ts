import { describe,it,expect,vi,beforeEach } from "vitest";
import { validInputProfile,inputAction,saveInput,type InputProfile } from "./widgetInput";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));
const profile=():InputProfile=>({reverseVertical:false,reverseHorizontal:false,discreteOnly:true,arrowNavigation:false,textExpansion:true,excludedApps:["com.apple.Terminal"],snippets:[{id:"abc-123",trigger:";sig",text:"中文\nText"}]});
describe("input tool boundaries",()=>{
 beforeEach(()=>{vi.mocked(invoke).mockReset();});
 it("enforces explicit trigger, text and application limits including duplicate rules",()=>{
  expect(validInputProfile(profile())).toBe(true);
  for(const value of [{...profile(),snippets:[{...profile().snippets[0],trigger:"normal"}]},{...profile(),snippets:[profile().snippets[0],{...profile().snippets[0],id:"def"}]},{...profile(),excludedApps:["../app"]},{...profile(),snippets:[{...profile().snippets[0],text:"🙂".repeat(129)}]}])expect(validInputProfile(value)).toBe(false);
 });
 it("sends explicit start only and exposes permission failures without raw native details",async()=>{
  vi.mocked(invoke).mockRejectedValueOnce("input_permission_denied");await expect(inputAction("start",new AbortController().signal)).rejects.toThrow("input_permission_denied");
  expect(invoke).toHaveBeenCalledExactlyOnceWith("widget_input_request",{action:{method:"start"}});
  vi.mocked(invoke).mockRejectedValueOnce("private details /path");await expect(inputAction("status",new AbortController().signal)).rejects.toThrow("tool_unavailable");
 });
 it("rejects malformed stored profiles and keeps observed-input fields out of status DTOs",async()=>{
  vi.mocked(invoke).mockResolvedValueOnce({profile:{...profile(),snippets:[{...profile().snippets[0],text:"\u001b"}]}});await expect(saveInput(profile(),new AbortController().signal)).rejects.toThrow("tool_invalid_response");
  vi.mocked(invoke).mockResolvedValueOnce({active:true,accessibility:true,inputMonitoring:true,suspended:false,expanded:-1,lastError:null});await expect(inputAction("status",new AbortController().signal)).rejects.toThrow("tool_invalid_response");
 });
});
