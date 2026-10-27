import {toolCall} from "./widgetTools";
export type MaintenanceTab="apps"|"caches"|"processes"|"brewList";
export interface MaintenanceItem{token?:string;name:string;bundle?:string;location?:string;pid?:number;version?:string}
export type MaintenanceAction={method:MaintenanceTab|"restore"}|{method:"prepare";token:string;caches:boolean;preferences:boolean}|{method:"prepareProcess";token:string;force:boolean}|{method:"execute"|"signal"|"brewExecute";plan:string}|{method:"brewPrepare";name:string};
export type MaintenancePlan={kind:"trash";plan:string;targets:{name:string;bytes:number;complete:boolean}[]}|{kind:"signal";plan:string;pid:number;name:string;force:boolean}|{kind:"brew";plan:string;name:string;version:string};
export type MaintenanceResult={items:MaintenanceItem[];truncated?:boolean;canRestore?:boolean}|MaintenancePlan|{kind:"moved";moved:number;partial:boolean;canRestore:boolean}|{kind:"restored";restored:number;remaining:number;canRestore:boolean}|{kind:"signalled";pid:number}|{kind:"brewRemoved";name:string};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const text=(v:unknown,max=256):v is string=>typeof v==="string"&&v.length<=max;
const count=(v:unknown,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=max;
const token=(v:unknown):v is string=>text(v,64)&&/^[a-f\d-]+$/i.test(v);
export function validMaintenance(v:unknown):v is MaintenanceResult{
 if(!object(v))return false;
 if(Array.isArray(v.items))return v.items.length<=1000&&(v.truncated===undefined||typeof v.truncated==="boolean")&&(v.canRestore===undefined||typeof v.canRestore==="boolean")&&v.items.every(i=>object(i)&&text(i.name,256)&&(i.token===undefined||token(i.token))&&(i.bundle===undefined||text(i.bundle,128))&&(i.location===undefined||text(i.location,256))&&(i.pid===undefined||count(i.pid,0x7fffffff)&&i.pid>1)&&(i.version===undefined||text(i.version,256)));
 switch(v.kind){case "trash":return token(v.plan)&&Array.isArray(v.targets)&&v.targets.length>=1&&v.targets.length<=3&&v.targets.every(i=>object(i)&&text(i.name)&&count(i.bytes)&&typeof i.complete==="boolean");case "signal":return token(v.plan)&&count(v.pid,0x7fffffff)&&v.pid>1&&text(v.name)&&typeof v.force==="boolean";case "brew":return token(v.plan)&&text(v.name,128)&&text(v.version);case "moved":return count(v.moved,3)&&typeof v.partial==="boolean"&&typeof v.canRestore==="boolean";case "restored":return count(v.restored,3)&&count(v.remaining,3)&&typeof v.canRestore==="boolean";case "signalled":return count(v.pid,0x7fffffff)&&v.pid>1;case "brewRemoved":return text(v.name,128);default:return false;}
}
export const maintenanceRequest=(action:MaintenanceAction,signal:AbortSignal)=>toolCall("widget_maintenance_request",{action},signal,(value):value is MaintenanceResult=>{
 if(!validMaintenance(value))return false;
 if("items" in value)return value.items.every(item=>action.method==="brewList"?typeof item.version==="string":typeof item.token==="string");
 return true;
});
