import { describe,it,expect,vi,beforeEach } from "vitest";
import { audioRequest,validDevices,validWindows,mediaControl,windowPreview } from "./widgetDesktop";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));
const signal=()=>new AbortController().signal;
describe("desktop tool boundaries",()=>{
  beforeEach(()=>{vi.mocked(invoke).mockReset();});
  it("validates hardware capabilities and refuses malformed native snapshots",async()=>{
    const valid={devices:[{id:1,name:"USB",direction:"output",isDefault:true,volume:null,muted:null,canVolume:false,canMute:false}]};
    expect(validDevices(valid)).toBe(true);expect(validDevices({devices:[{...valid.devices[0],volume:1.1}]})).toBe(false);expect(validDevices({devices:Array(129).fill(valid.devices[0])})).toBe(false);
    vi.mocked(invoke).mockResolvedValueOnce(valid);expect(await audioRequest({method:"list"},signal())).toEqual(valid);
    vi.mocked(invoke).mockResolvedValueOnce({devices:[{...valid.devices[0],id:-1}]});await expect(audioRequest({method:"list"},signal())).rejects.toThrow("tool_invalid_response");
  });
  it("preserves permission errors and sends fixed media action DTOs",async()=>{
    vi.mocked(invoke).mockRejectedValueOnce("desktop_automation_denied");await expect(mediaControl("com.apple.Music","next",signal())).rejects.toThrow("desktop_automation_denied");
    expect(invoke).toHaveBeenCalledWith("widget_media_request",{action:{method:"control",player:"com.apple.Music",action:"next"}});
    vi.mocked(invoke).mockRejectedValueOnce("private path /somewhere");await expect(windowPreview("token",signal())).rejects.toThrow("tool_unavailable");
  });
  it("accepts negative monitor coordinates but rejects invalid window handles and unsafe preview sources",async()=>{
    const value={permitted:true,windows:[{token:"00000000-0000-4000-8000-000000000001",app:"Editor",title:"Document",minimized:false,canPreview:true}],screens:[{id:1,name:"Left",x:-1920,y:-200,width:1920,height:1080}]};
    expect(validWindows(value)).toBe(true);expect(validWindows({...value,windows:[{...value.windows[0],token:"../x"}]})).toBe(false);
    vi.mocked(invoke).mockResolvedValueOnce({preview:"https://example.com/private.png"});await expect(windowPreview(value.windows[0].token,signal())).rejects.toThrow("tool_invalid_response");
  });
});
