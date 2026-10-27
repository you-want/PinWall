import { toolCall } from "./widgetTools";
export interface Snippet { id:string; title:string; text:string }
export type UtilityAction={method:"list"|"clear"}|{method:"save";id:string;title:string;text:string}|{method:"remove";id:string}|{method:"copy";text:string};
export function utilityRequest(action:UtilityAction,signal:AbortSignal){
  return toolCall("widget_utilities_request",{action},signal,(value):value is Snippet[]=>{
    if(!Array.isArray(value)||value.length>100)return false;const ids=new Set<string>();let bytes=0;
    return value.every((v:unknown)=>{
      if(!v||typeof v!=="object"||!("id"in v)||!("title"in v)||!("text"in v)||typeof v.id!=="string"||!/^[0-9a-f-]{1,64}$/i.test(v.id)||ids.has(v.id)||typeof v.title!=="string"||!v.title.trim()||new TextEncoder().encode(v.title).length>256||typeof v.text!=="string"||!v.text||new TextEncoder().encode(v.text).length>65536)return false;
      ids.add(v.id);bytes+=new TextEncoder().encode(v.title+v.text).length;return bytes<=1024*1024;
    });
  });
}
