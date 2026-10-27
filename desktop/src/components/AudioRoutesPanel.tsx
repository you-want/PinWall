import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { useToolController } from "./NativeToolDialog";
import { clearNativeTool, toolError } from "../services/widgetTools";
import { routeRequest, type AudioDevice, type RouteSnapshot, type RouteAction } from "../services/widgetDesktop";
export function AudioRoutesPanel({devices}:{devices:AudioDevice[]}) {
  const {t}=useI18n(),controller=useToolController(),running=useRef(false),cleanupTimer=useRef<number|null>(null);
  const [snapshot,setSnapshot]=useState<RouteSnapshot|null>(null),[process,setProcess]=useState(0),[device,setDevice]=useState(0),[gain,setGain]=useState("50");
  const [busy,setBusy]=useState(true),[error,setError]=useState("");
  const [levels,setLevels]=useState<Record<string,string>>({});
  const apply=(value:RouteSnapshot)=>{setSnapshot(value);setProcess(current=>value.processes.some(p=>p.id===current)?current:value.processes[0]?.id??0);setLevels(current=>Object.fromEntries(value.routes.map(r=>[r.token,current[r.token]??String(Math.round(r.gain*100))])));};
  useEffect(()=>{setDevice(current=>devices.some(d=>d.id===current&&d.direction==="output")?current:devices.find(d=>d.direction==="output"&&d.isDefault)?.id??devices.find(d=>d.direction==="output")?.id??0);},[devices]);
  useEffect(()=>{const signal=controller.current?.signal;if(!signal)return;void routeRequest({method:"list"},signal).then(value=>{if(!signal.aborted)apply(value);}).catch(failure=>{if(!signal.aborted)setError(toolError(failure,t));}).finally(()=>{if(!signal.aborted)setBusy(false);});},[controller,t]);
  useEffect(()=>{if(cleanupTimer.current!==null)window.clearTimeout(cleanupTimer.current);return()=>{cleanupTimer.current=window.setTimeout(()=>{void clearNativeTool("com.pinwall.music").catch(()=>console.warn("[AudioTools] Route cleanup failed"));},0);};},[]);
  const run=async(action:RouteAction)=>{const signal=controller.current?.signal;if(!signal||signal.aborted||running.current)return;running.current=true;setBusy(true);setError("");try{const value=await routeRequest(action,signal);if(!signal.aborted)apply(value);}catch(failure){if(!signal.aborted)setError(toolError(failure,t));}finally{running.current=false;if(!signal.aborted)setBusy(false);}};
  const active=(snapshot?.routes.length??0)>0;
  useEffect(()=>{
    if(!active)return;const timer=window.setInterval(()=>{if(!document.hidden&&!running.current)void run({method:"list"});},2000);
    const hidden=()=>{if(document.hidden)void clearNativeTool("com.pinwall.music").catch(()=>console.warn("[AudioTools] Hidden route cleanup failed"));};
    document.addEventListener("visibilitychange",hidden);return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",hidden);};
  },[active,controller,t]);
  const selected=snapshot?.processes.find(p=>p.id===process),outputs=devices.filter(d=>d.direction==="output"),percent=Number(gain);
  const validPercent=(value:string)=>value.trim()!==""&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=100;
  return <section className="mt-5" aria-label={t.audio_routes}>
    <h3 className="font-medium">{t.audio_routes}</h3><p className="my-2 text-sm text-gray-600">{t.audio_routes_hint}</p>
    <button className="btn-v2 btn-v2-secondary mb-3" disabled={busy} onClick={()=>void run({method:"list"})}>{t.audio_refresh_processes}</button>
    {snapshot&&!snapshot.supported?<p className="text-sm">{t.audio_routes_unsupported}</p>:<>
      <label className="block text-sm">{t.audio_process}<select className="form-input" aria-label={t.audio_process} disabled={busy} value={process} onChange={e=>setProcess(Number(e.target.value))}>{snapshot?.processes.map(p=><option key={p.id} value={p.id}>{p.name} (PID {p.pid})</option>)}</select></label>
      <label className="mt-2 block text-sm">{t.audio_route_output}<select className="form-input" aria-label={t.audio_route_output} disabled={busy} value={device} onChange={e=>setDevice(Number(e.target.value))}>{outputs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label className="mt-2 block text-sm">{t.audio_route_gain}<input className="form-input max-w-28" type="number" min={0} max={100} value={gain} disabled={busy} onChange={e=>setGain(e.target.value)}/></label>
      <div className="my-3 flex flex-wrap gap-2"><button className="btn-v2 btn-v2-primary" disabled={busy||!selected||!device||!validPercent(gain)||(snapshot?.routes.length??0)>=4||snapshot?.routes.some(r=>r.process===process)} onClick={()=>{if(selected)void run({method:"start",process:selected.id,pid:selected.pid,device,gain:percent/100});}}>{t.audio_route_start}</button><button className="btn-v2 btn-v2-secondary" disabled={busy||!active} onClick={()=>void run({method:"stopAll"})}>{t.audio_route_stop_all}</button></div>
      {!busy&&!snapshot?.processes.length&&<p className="text-sm">{t.audio_no_processes}</p>}
      <ul className="space-y-2" aria-label={t.audio_active_routes}>{snapshot?.routes.map(route=><li className="rounded border p-2" key={route.token}><p className="break-all font-medium">{route.name} → {outputs.find(d=>d.id===route.device)?.name??t.audio_output}</p>
        <label className="block text-sm">{t.audio_route_gain} ({route.name})<input className="form-input max-w-28" type="number" min={0} max={100} disabled={busy} value={levels[route.token]??""} onChange={e=>setLevels({...levels,[route.token]:e.target.value})}/></label>
        <div className="mt-2 flex flex-wrap gap-2"><button className="btn-v2 btn-v2-secondary" disabled={busy||!validPercent(levels[route.token]??"")} onClick={()=>void run({method:"gain",token:route.token,gain:Number(levels[route.token])/100})}>{t.audio_apply_gain}</button><button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={()=>void run({method:"stop",token:route.token})}>{t.audio_route_stop}</button></div>
        <p className="mt-2 text-xs text-gray-600">{t.audio_route_diagnostics}: {route.callbacks} / {route.dropped} / {route.missing}</p>
      </li>)}</ul>
    </>}
    {snapshot?.lastError&&<p className="mt-3 text-sm text-red-700" role="status">{toolError(new Error(snapshot.lastError),t)}</p>}
    {error&&<p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
  </section>;
}
