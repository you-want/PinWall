import { toolCall } from "./widgetTools";
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value);
const uint=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0&&v<=0xffffffff;
const text=(v:unknown,max:number):v is string=>typeof v==="string"&&v.length<=max;
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
export type Direction="input"|"output";
export interface AudioDevice {id:number;name:string;direction:Direction;isDefault:boolean;volume:number|null;muted:boolean|null;canVolume:boolean;canMute:boolean}
export type AudioAction={method:"list"}|{method:"default";device:number;direction:Direction}|{method:"volume";device:number;direction:Direction;value:number}|{method:"mute";device:number;direction:Direction;muted:boolean};
export function validDevices(v:unknown):v is {devices:AudioDevice[]}{
  return object(v)&&Array.isArray(v.devices)&&v.devices.length<=128&&v.devices.every(d=>object(d)&&uint(d.id)&&text(d.name,256)&&["input","output"].includes(String(d.direction))&&typeof d.isDefault==="boolean"&&(d.volume===null||finite(d.volume)&&d.volume>=0&&d.volume<=1)&&(d.muted===null||typeof d.muted==="boolean")&&typeof d.canVolume==="boolean"&&typeof d.canMute==="boolean");
}
export const audioRequest=(action:AudioAction,signal:AbortSignal)=>toolCall("widget_audio_request",{action},signal,validDevices);
export type Player="com.apple.Music"|"com.spotify.client";
export const players=["com.apple.Music","com.spotify.client"] as const;
export interface MediaInfo {trackName:string;artistName:string;albumName:string;isPlaying:boolean;position:number;duration:number}
export function mediaPlayers(signal:AbortSignal){return toolCall("widget_media_request",{action:{method:"players"}},signal,(v):v is {players:Player[]}=>object(v)&&Array.isArray(v.players)&&v.players.length<=2&&v.players.every(p=>players.includes(p)));}
export function mediaInfo(player:Player,signal:AbortSignal){return toolCall("widget_media_request",{action:{method:"info",player}},signal,(v):v is MediaInfo=>object(v)&&text(v.trackName,512)&&text(v.artistName,512)&&text(v.albumName,512)&&typeof v.isPlaying==="boolean"&&finite(v.position)&&v.position>=0&&finite(v.duration)&&v.duration>=0);}
export type MediaControl="play"|"pause"|"toggle"|"next"|"previous";
const validOk=(v:unknown):v is {ok:true;clamped?:boolean}=>object(v)&&v.ok===true&&(v.clamped===undefined||typeof v.clamped==="boolean");
export function mediaControl(player:Player,action:MediaControl,signal:AbortSignal){return toolCall("widget_media_request",{action:{method:"control",player,action}},signal,validOk);}
export interface AppWindow {token:string;app:string;title:string;minimized:boolean;canPreview:boolean}
export interface WindowScreen {id:number;name:string;x:number;y:number;width:number;height:number}
export interface WindowSnapshot {permitted:boolean;windows:AppWindow[];screens:WindowScreen[]}
export const layouts=["left","right","top","bottom","quarterTopLeft","quarterTopRight","quarterBottomLeft","quarterBottomRight","maximize","center"] as const;
export type Layout=typeof layouts[number];
export type WindowAction={method:"permission"|"release"}|{method:"focus"|"preview"|"restore";token:string}|{method:"layout";token:string;screen:number;layout:Layout};
export function validWindows(v:unknown):v is WindowSnapshot{
  return object(v)&&typeof v.permitted==="boolean"&&Array.isArray(v.windows)&&v.windows.length<=128&&v.windows.every(w=>object(w)&&text(w.token,36)&&/^[a-f\d-]{36}$/i.test(w.token)&&text(w.app,128)&&text(w.title,512)&&typeof w.minimized==="boolean"&&typeof w.canPreview==="boolean")&&Array.isArray(v.screens)&&v.screens.length<=32&&v.screens.every(s=>object(s)&&uint(s.id)&&text(s.name,128)&&finite(s.x)&&finite(s.y)&&finite(s.width)&&s.width>0&&finite(s.height)&&s.height>0);
}
export const windowList=(signal:AbortSignal)=>toolCall("widget_window_request",{action:{method:"list"}},signal,validWindows);
export const windowAction=(action:Exclude<WindowAction,{method:"preview";token:string}>,signal:AbortSignal)=>toolCall("widget_window_request",{action},signal,validOk);
export const windowPreview=(token:string,signal:AbortSignal)=>toolCall("widget_window_request",{action:{method:"preview",token}},signal,(v):v is {preview:string}=>object(v)&&text(v.preview,1024*1024)&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.preview));
export interface AudioProcess {id:number;pid:number;name:string}
export interface AudioRoute {token:string;name:string;process:number;device:number;gain:number;callbacks:number;dropped:number;missing:number}
export interface RouteSnapshot {supported:boolean;processes:AudioProcess[];routes:AudioRoute[];lastError:string|null}
export type RouteAction={method:"list"|"stopAll"}|{method:"start";process:number;pid:number;device:number;gain:number}|{method:"stop";token:string}|{method:"gain";token:string;gain:number};
export function validRoutes(v:unknown):v is RouteSnapshot{
  const count=(n:unknown)=>finite(n)&&Number.isSafeInteger(n)&&n>=0;
  return object(v)&&typeof v.supported==="boolean"&&(v.lastError===null||text(v.lastError,64))&&Array.isArray(v.processes)&&v.processes.length<=128&&v.processes.every(p=>object(p)&&uint(p.id)&&uint(p.pid)&&text(p.name,128))&&Array.isArray(v.routes)&&v.routes.length<=4&&v.routes.every(r=>object(r)&&text(r.token,36)&&/^[a-f\d-]{36}$/i.test(r.token)&&text(r.name,128)&&uint(r.process)&&uint(r.device)&&finite(r.gain)&&r.gain>=0&&r.gain<=1&&count(r.callbacks)&&count(r.dropped)&&count(r.missing));
}
export const routeRequest=(action:RouteAction,signal:AbortSignal)=>toolCall("widget_audio_route_request",{action},signal,validRoutes);

export interface DockStatus {active:boolean;lastError:string|null}
export const dockAction=(method:"dockStart"|"dockStop"|"dockStatus",signal:AbortSignal)=>toolCall("widget_window_request",{action:{method}},signal,(v):v is DockStatus=>object(v)&&typeof v.active==="boolean"&&(v.lastError===null||text(v.lastError,64)));
