import { toolCall } from "./widgetTools";
export interface VideoInfo {token:string;duration:number;width:number;height:number;hasAudio:boolean;bytes:number}
export type VideoAction={method:"select"|"status"|"cancel"|"stopRecording"}|{method:"record";seconds:number}|{method:"saveRecording";token:string}|{method:"export";token:string;start:number;end:number;resolution:480|720|1080;muted:boolean;format:"mp4"|"mov"};
export type VideoResult={kind:"selected";video:VideoInfo}|{kind:"exported";bytes:number}|{kind:"cancelled"|"stopping"}|{kind:"status";recording:boolean;busy:boolean;progress:number};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const number=(v:unknown,min:number,max:number):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
export function validVideo(v:unknown):v is VideoInfo{return object(v)&&typeof v.token==="string"&&/^\d+-\d+$/.test(v.token)&&v.token.length<=64&&number(v.duration,0.001,1800)&&number(v.width,1,4096)&&Number.isInteger(v.width)&&number(v.height,1,4096)&&Number.isInteger(v.height)&&v.width*v.height<=16_000_000&&typeof v.hasAudio==="boolean"&&number(v.bytes,1,512*1024*1024)&&Number.isSafeInteger(v.bytes);}
export function validVideoResult(v:unknown):v is VideoResult{
 if(!object(v))return false;
 switch(v.kind){case "selected":return validVideo(v.video);case "exported":return number(v.bytes,1,512*1024*1024)&&Number.isSafeInteger(v.bytes);case "cancelled":case "stopping":return true;case "status":return typeof v.recording==="boolean"&&typeof v.busy==="boolean"&&number(v.progress,0,1);default:return false;}
}
export const videoRequest=(action:VideoAction,signal:AbortSignal)=>toolCall("widget_video_request",{action},signal,validVideoResult);
