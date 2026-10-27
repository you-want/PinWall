import { useEffect, useRef, useState } from "react";
import { NativeToolDialog, useToolController } from "./NativeToolDialog";
import { useI18n } from "../i18n";
import { dockAction, type DockStatus, windowList, windowAction, windowPreview, layouts, type Layout, type WindowAction, type WindowSnapshot } from "../services/widgetDesktop";
import { toolError } from "../services/widgetTools";
export function WindowToolsDialog({onClose}:{onClose:()=>void}) {
  const {t}=useI18n(),controller=useToolController(),running=useRef(false),cleanupTimer=useRef<number|null>(null);
  const [snapshot,setSnapshot]=useState<WindowSnapshot|null>(null),[selected,setSelected]=useState(""),[search,setSearch]=useState("");
  const [screen,setScreen]=useState(0),[layout,setLayout]=useState<Layout>("left"),[preview,setPreview]=useState<string|null>(null),[undo,setUndo]=useState<Set<string>>(new Set());
  const [dock,setDock]=useState<DockStatus|null>(null);
  const [busy,setBusy]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const apply=(value:WindowSnapshot)=>{setSnapshot(value);setSelected(current=>value.windows.some(w=>w.token===current)?current:value.windows[0]?.token??"");setScreen(current=>value.screens.some(s=>s.id===current)?current:value.screens[0]?.id??0);setPreview(null);};
  useEffect(()=>{const signal=controller.current?.signal;if(!signal)return;setBusy(true);void windowList(signal).then(value=>{if(!signal.aborted)apply(value);}).catch(failure=>{if(!signal.aborted)setError(toolError(failure,t));}).finally(()=>{if(!signal.aborted)setBusy(false);});},[controller,t]);
  useEffect(()=>{if(cleanupTimer.current!==null)window.clearTimeout(cleanupTimer.current);return()=>{cleanupTimer.current=window.setTimeout(()=>{void windowAction({method:"release"},new AbortController().signal).catch(()=>console.warn("[WindowTools] Session cleanup failed"));},0);};},[]);
  const run=async(task:(signal:AbortSignal)=>Promise<void>)=>{const signal=controller.current?.signal;if(!signal||signal.aborted||running.current)return;running.current=true;setBusy(true);setError("");setMessage("");try{await task(signal);}catch(failure){if(!signal.aborted)setError(toolError(failure,t));}finally{running.current=false;if(!signal.aborted)setBusy(false);}};
  const action=(value:WindowAction)=>void run(async signal=>{if(value.method==="preview"){const result=await windowPreview(value.token,signal);if(!signal.aborted)setPreview(result.preview);return;}if(value.method==="layout")setUndo(current=>new Set(current).add(value.token));const result=await windowAction(value,signal);if(signal.aborted)return;
    if(value.method==="layout"){setUndo(current=>new Set(current).add(value.token));setMessage(result.clamped?t.windows_clamped:t.windows_applied);}if(value.method==="restore"){setUndo(current=>{const next=new Set(current);next.delete(value.token);return next;});setMessage(t.windows_restored);}
    if(value.method==="permission")setMessage(t.windows_permission_hint);
  });
  useEffect(()=>{const signal=controller.current?.signal;if(signal)void dockAction("dockStatus",signal).then(setDock).catch(()=>{});},[controller]);
  useEffect(()=>{if(!dock?.active)return;const timer=window.setInterval(()=>{const signal=controller.current?.signal;if(signal&&!document.hidden)void dockAction("dockStatus",signal).then(value=>{if(!signal.aborted)setDock(value);}).catch(()=>{});},2000);return()=>window.clearInterval(timer);},[dock?.active,controller]);
  const current=snapshot?.windows.find(w=>w.token===selected);
  return <NativeToolDialog title={t.windows_title} description={t.windows_description} onClose={onClose}>
    <section className="my-3 rounded border p-3"><p className="text-sm">{t.dock_description}</p><button className="btn-v2 btn-v2-secondary mt-2" disabled={busy} onClick={()=>void run(async signal=>{const result=await dockAction(dock?.active?"dockStop":"dockStart",signal);if(!signal.aborted)setDock(result);})}>{dock?.active?t.dock_stop:t.dock_start}</button>{dock?.lastError&&<p className="mt-2 text-sm text-red-700" role="alert">{toolError(new Error(dock.lastError),t)}</p>}</section>
    <div className="my-3 flex flex-wrap gap-2"><button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={()=>void run(async signal=>{const result=await windowList(signal);if(!signal.aborted)apply(result);})}>{t.desktop_refresh}</button>{snapshot&&!snapshot.permitted&&<button className="btn-v2 btn-v2-primary" disabled={busy} onClick={()=>action({method:"permission"})}>{t.windows_grant}</button>}</div>
    {snapshot&&!snapshot.permitted?<p role="status" className="text-sm">{t.windows_permission_hint}</p>:<>
      <label className="block text-sm">{t.windows_search}<input className="form-input" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <label className="mt-3 block text-sm">{t.windows_select}<select className="form-input" aria-label={t.windows_select} size={5} disabled={busy} value={selected} onChange={e=>{setSelected(e.target.value);setPreview(null);setMessage("");}}>{snapshot?.windows.filter(w=>(w.app+" "+w.title).toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(w=><option key={w.token} value={w.token}>{w.app} · {w.title||t.windows_untitled}{w.minimized?` · ${t.windows_minimized}`:""}</option>)}</select></label>
      {current&&<><div className="my-3 flex flex-wrap gap-2"><button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={()=>action({method:"focus",token:selected})}>{t.windows_focus}</button><button className="btn-v2 btn-v2-secondary" disabled={busy||!current.canPreview} onClick={()=>action({method:"preview",token:selected})}>{t.windows_preview}</button><button className="btn-v2 btn-v2-secondary" disabled={busy||!undo.has(selected)} onClick={()=>action({method:"restore",token:selected})}>{t.windows_restore}</button></div>
        <label className="block text-sm">{t.windows_display}<select className="form-input" aria-label={t.windows_display} value={screen} disabled={busy} onChange={e=>setScreen(Number(e.target.value))}>{snapshot?.screens.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="mt-3 block text-sm">{t.windows_layout}<select className="form-input" aria-label={t.windows_layout} value={layout} disabled={busy} onChange={e=>setLayout(e.target.value as Layout)}>{layouts.map(value=><option key={value} value={value}>{t[`windows_${value}`]}</option>)}</select></label>
        <button className="btn-v2 btn-v2-primary mt-3" disabled={busy||!screen} onClick={()=>action({method:"layout",token:selected,screen,layout})}>{t.windows_apply}</button>
      </>}
      {!busy&&snapshot&&!snapshot.windows.length&&<p className="mt-3 text-sm">{t.windows_none}</p>}
    </>}
    {preview&&<img className="mt-3 max-h-72 max-w-full rounded border" src={preview} alt={t.windows_preview_alt}/>}
    {message&&<p className="mt-3 text-sm" role="status">{message}</p>}{error&&<p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
  </NativeToolDialog>;
}
