import {describe,it,expect,vi,beforeEach} from "vitest";
import {marketRequest,validMarketResult} from "./trustedMarketplace";
import {invoke} from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));
const manifest={id:"org.example.fixture",version:"1.0.0",name:"Fixture",description:"local",author:"Test",entry:"index.html",icon:"icon.svg",type:"community",category:"utility",permissions:["storage"],defaultEnabled:false,defaultSize:{width:240,height:160}};
describe("trusted marketplace host boundary",()=>{
 beforeEach(()=>vi.mocked(invoke).mockReset());
 it("requires the prepared identity, disabled community authority and known permissions",()=>{
  const action={method:"prepare" as const,id:manifest.id,version:manifest.version};const valid={token:"1-ab-2",manifest};expect(validMarketResult(action,valid)).toBe(true);
  for(const change of [{id:"com.pinwall.input-tools"},{version:"2.0.0"},{type:"official"},{defaultEnabled:true},{permissions:["input"]}])expect(validMarketResult(action,{...valid,manifest:{...manifest,...change}})).toBe(false);
  expect(validMarketResult({method:"refresh"},{entries:[{...manifest,publisher:"example",packageUrl:"https://example.com/pkg.pwx",sha256:"a".repeat(64),permissions:["input"]}],revision:1,expiresAt:100})).toBe(false);
 });
 it("rejects malformed IPC replies and forwards cancellation to native state",async()=>{
  vi.mocked(invoke).mockResolvedValueOnce({manifest:{...manifest,defaultEnabled:true}});await expect(marketRequest({method:"install",token:"a"})).rejects.toThrow("market_invalid");
  vi.mocked(invoke).mockResolvedValueOnce({cancelled:true});await marketRequest({method:"cancel"});expect(invoke).toHaveBeenLastCalledWith("marketplace_request",{action:{method:"cancel"}});
 });
});
