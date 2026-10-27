import {invoke} from "@tauri-apps/api/core";
import {validateManifest,isValidWidgetId} from "./widgetLoader";
import type {WidgetManifest,WidgetPermission} from "../types";
export interface MarketConfig {enabled:boolean;catalogUrl:string;rootKey:string}
export interface MarketEntry {id:string;version:string;name:string;description:string;publisher:string;permissions:WidgetPermission[];packageUrl:string;sha256:string}
export type MarketAction={method:"config"|"refresh"|"cancel"}|{method:"configure";config:MarketConfig}|{method:"prepare";id:string;version:string}|{method:"install";token:string};
export type MarketResult={config:MarketConfig}|{entries:MarketEntry[];revision:number;expiresAt:number}|{token:string;manifest:WidgetManifest}|{manifest:WidgetManifest}|{cancelled:true};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const text=(v:unknown,max:number):v is string=>typeof v==="string"&&v.length<=max;
const integer=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=1;
const allowed=new Set(["storage","theme","notify","cards","events","app","network","i18n"]);
export function validMarketEntry(v:unknown):v is MarketEntry {return record(v)&&isValidWidgetId(v.id)&&!v.id.startsWith("com.pinwall.")&&text(v.version,64)&&text(v.name,256)&&text(v.description,2048)&&text(v.publisher,80)&&Array.isArray(v.permissions)&&v.permissions.every(p=>typeof p==="string"&&allowed.has(p))&&text(v.packageUrl,8192)&&v.packageUrl.startsWith("https://")&&text(v.sha256,64)&&/^[a-f0-9]{64}$/.test(v.sha256);}
function validConfig(v:unknown):v is MarketConfig{return record(v)&&typeof v.enabled==="boolean"&&text(v.catalogUrl,8192)&&text(v.rootKey,44);}
function community(v:unknown):v is WidgetManifest{return validateManifest(v)&&v.type==="community"&&v.defaultEnabled===false&&!v.id.startsWith("com.pinwall.")&&v.permissions.every(p=>allowed.has(p));}
export function validMarketResult(action:MarketAction,v:unknown):v is MarketResult{
 if(!record(v))return false;
 switch(action.method){case "config":case "configure":return validConfig(v.config);case "cancel":return v.cancelled===true;case "refresh":return Array.isArray(v.entries)&&v.entries.length<=100&&v.entries.every(validMarketEntry)&&integer(v.revision)&&integer(v.expiresAt);case "prepare":return text(v.token,128)&&/^[a-f\d-]+$/.test(v.token)&&community(v.manifest)&&v.manifest.id===action.id&&v.manifest.version===action.version;case "install":return community(v.manifest);}
}
export async function marketRequest(action:MarketAction):Promise<MarketResult>{const value:unknown=await invoke("marketplace_request",{action});if(!validMarketResult(action,value))throw new Error("market_invalid");return value;}
export async function cancelMarket(){await marketRequest({method:"cancel"});}
