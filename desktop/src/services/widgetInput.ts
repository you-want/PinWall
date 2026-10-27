import { toolCall } from "./widgetTools";
export interface Expansion {id:string;trigger:string;text:string}
export interface InputProfile {reverseVertical:boolean;reverseHorizontal:boolean;discreteOnly:boolean;arrowNavigation:boolean;textExpansion:boolean;excludedApps:string[];snippets:Expansion[]}
export interface InputStatus {active:boolean;accessibility:boolean;inputMonitoring:boolean;suspended:boolean;expanded:number;lastError:string|null}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
export function validInputProfile(v:unknown):v is InputProfile{
  if(!record(v)||!["reverseVertical","reverseHorizontal","discreteOnly","arrowNavigation","textExpansion"].every(k=>typeof v[k]==="boolean")||!Array.isArray(v.excludedApps)||v.excludedApps.length>100||!v.excludedApps.every(app=>typeof app==="string"&&app.length<=128&&/^[A-Za-z\d_-]+(?:\.[A-Za-z\d_-]+)+$/.test(app))||!Array.isArray(v.snippets)||v.snippets.length>50)return false;
  const ids=new Set<string>(),triggers=new Set<string>();
  return v.snippets.every(s=>{if(!record(s)||typeof s.id!=="string"||!/^[a-f\d-]{1,64}$/i.test(s.id)||ids.has(s.id)||typeof s.trigger!=="string"||!/^;[A-Za-z\d_-]{1,23}$/.test(s.trigger)||triggers.has(s.trigger)||typeof s.text!=="string"||s.text.length<1||s.text.length>256||/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(s.text))return false;ids.add(s.id);triggers.add(s.trigger);return true;});
}
export const loadInput=(signal:AbortSignal)=>toolCall("widget_input_request",{action:{method:"load"}},signal,(v):v is {profile:InputProfile}=>record(v)&&validInputProfile(v.profile));
export const saveInput=(profile:InputProfile,signal:AbortSignal)=>toolCall("widget_input_request",{action:{method:"save",profile}},signal,(v):v is {profile:InputProfile}=>record(v)&&validInputProfile(v.profile));
export const inputAction=(method:"status"|"start"|"stop"|"permission",signal:AbortSignal)=>toolCall("widget_input_request",{action:{method}},signal,(v):v is InputStatus=>record(v)&&["active","accessibility","inputMonitoring","suspended"].every(k=>typeof v[k]==="boolean")&&typeof v.expanded==="number"&&Number.isSafeInteger(v.expanded)&&v.expanded>=0&&(v.lastError===null||typeof v.lastError==="string"&&v.lastError.length<=64));
