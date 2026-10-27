import {toolCall} from "./widgetTools";
export interface HardwareFan{id:number;minimum:number;maximum:number;current:number;controllable:boolean;manual:boolean}
export interface HardwareStatus{fans:HardwareFan[];temperature:number|null;onAc:boolean;hasLid:boolean;lidDisabled:boolean;fanActive:number;lidActive:boolean;recoveryRequired:boolean;remaining:number}
export type HardwareAction={method:"service"|"unregister"|"status"|"stop"}|{method:"register";confirmed:boolean}|{method:"fan";fan:number;rpm:number;seconds:number;confirmed:boolean}|{method:"lid";seconds:number;confirmed:boolean};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const number=(v:unknown,min:number,max:number):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
export function validHardware(v:unknown):v is {service:number}|HardwareStatus{
 if(!record(v))return false;if(number(v.service,0,3)&&Number.isInteger(v.service))return true;
 return Array.isArray(v.fans)&&v.fans.length<=4&&v.fans.every(f=>record(f)&&number(f.id,0,3)&&Number.isInteger(f.id)&&number(f.minimum,0,12000)&&number(f.maximum,1,12000)&&f.maximum>f.minimum&&number(f.current,0,f.maximum)&&typeof f.controllable==="boolean"&&typeof f.manual==="boolean")&&(v.temperature===null||number(v.temperature,0,125))&&typeof v.onAc==="boolean"&&typeof v.hasLid==="boolean"&&typeof v.lidDisabled==="boolean"&&number(v.fanActive,-1,3)&&Number.isInteger(v.fanActive)&&typeof v.lidActive==="boolean"&&typeof v.recoveryRequired==="boolean"&&number(v.remaining,0,300);
}
export const hardwareRequest=(action:HardwareAction,signal:AbortSignal)=>toolCall("widget_hardware_request",{action},signal,(value):value is {service:number}|HardwareStatus=>validHardware(value)&&(["service","register","unregister"].includes(action.method)?"service" in value:!("service" in value)));
