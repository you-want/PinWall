import {toolCall} from "./widgetTools";
export interface DisplayItem{id:number;name:string;potential:number;current:number}
export interface DisplayStatus{active:boolean;starting:boolean;display:number;gain:number;remaining:number;lastError:string|null}
export type DisplayAction={method:"list"|"status"|"stop"}|{method:"start";display:number;gain:number;seconds:number};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const number=(v:unknown,min:number,max:number):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
export function validDisplay(v:unknown):v is {displays:DisplayItem[]}|DisplayStatus{
 if(!record(v))return false;
 if(Array.isArray(v.displays))return v.displays.length<=16&&v.displays.every(d=>record(d)&&number(d.id,1,0xffffffff)&&Number.isInteger(d.id)&&typeof d.name==="string"&&d.name.length<=256&&number(d.potential,1,10)&&number(d.current,1,10));
 return typeof v.active==="boolean"&&typeof v.starting==="boolean"&&(v.lastError===null||v.lastError==="display_cleanup")&&number(v.display,0,0xffffffff)&&Number.isInteger(v.display)&&number(v.gain,1,2)&&number(v.remaining,0,300)&&(!v.active||v.display>0);
}
export const displayRequest=(action:DisplayAction,signal:AbortSignal)=>toolCall("widget_display_request",{action},signal,(value):value is {displays:DisplayItem[]}|DisplayStatus=>validDisplay(value)&&(action.method==="list"?"displays" in value:!("displays" in value)));
