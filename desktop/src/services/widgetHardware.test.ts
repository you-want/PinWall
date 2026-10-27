import {describe,it,expect,vi} from "vitest";
import {invoke} from "@tauri-apps/api/core";
import {hardwareRequest,validHardware} from "./widgetHardware";
vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));
const status={fans:[{id:0,minimum:1200,maximum:6000,current:3000,controllable:true,manual:false}],temperature:45,onAc:true,hasLid:true,lidDisabled:false,fanActive:-1,lidActive:false,recoveryRequired:false,remaining:0};
describe("hardware helper host boundary",()=>{
 it("rejects impossible telemetry and service replies",()=>{expect(validHardware(status)).toBe(true);for(const change of [{temperature:NaN},{remaining:301},{fanActive:4},{onAc:1},{fans:[{...status.fans[0],current:7000}]}])expect(validHardware({...status,...change})).toBe(false);expect(validHardware({service:4})).toBe(false);});
 it("preserves signing and recovery failures, checks reply method and sends fixed actions",async()=>{const signal=new AbortController().signal;vi.mocked(invoke).mockRejectedValueOnce("hardware_signing_required");await expect(hardwareRequest({method:"service"},signal)).rejects.toThrow("hardware_signing_required");vi.mocked(invoke).mockResolvedValueOnce({service:1});await expect(hardwareRequest({method:"fan",fan:0,rpm:4000,seconds:60,confirmed:true},signal)).rejects.toThrow("tool_invalid_response");expect(invoke).toHaveBeenLastCalledWith("widget_hardware_request",{action:{method:"fan",fan:0,rpm:4000,seconds:60,confirmed:true}});});
});
