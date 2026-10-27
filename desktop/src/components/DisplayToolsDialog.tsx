import {useEffect,useRef,useState} from "react";
import {NativeToolDialog,useToolController} from "./NativeToolDialog";
import {displayRequest,type DisplayAction,type DisplayItem,type DisplayStatus} from "../services/widgetDisplay";
import {clearNativeTool,toolError} from "../services/widgetTools";
import {useI18n} from "../i18n";
export function DisplayToolsDialog({onClose}:{onClose:()=>void}){
 const {t}=useI18n(),controller=useToolController(),running=useRef(false),cleanup=useRef<number|null>(null),[displays,setDisplays]=useState<DisplayItem[]>([]),[selected,setSelected]=useState(0),[gain,setGain]=useState("1.2"),[seconds,setSeconds]=useState("60"),[consent,setConsent]=useState(false),[status,setStatus]=useState<DisplayStatus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const run=async(action:DisplayAction)=>{const signal=controller.current?.signal;if(!signal||signal.aborted||running.current)return;running.current=true;if(action.method!=="status")setBusy(true);setError("");try{const result=await displayRequest(action,signal);if(signal.aborted)return;if("displays" in result){setDisplays(result.displays);setSelected(old=>result.displays.some(d=>d.id===old)?old:result.displays[0]?.id??0);}else {setStatus(result);if(result.lastError)setError(t.display_cleanup);}}catch(reason){if(!signal.aborted)setError(toolError(reason,t));}finally{running.current=false;if(!signal.aborted)setBusy(false);}};
 useEffect(()=>{if(cleanup.current!==null)window.clearTimeout(cleanup.current);const load=window.setTimeout(()=>void run({method:"list"}),0);return()=>{window.clearTimeout(load);cleanup.current=window.setTimeout(()=>{void clearNativeTool("com.pinwall.display-tools").catch(()=>console.warn("[DisplayTools] Cleanup failed"));},0);};},[]);
 useEffect(()=>{if(!status?.active&&!status?.starting)return;const timer=window.setInterval(()=>void run({method:"status"}),1000);return()=>window.clearInterval(timer);},[status?.active,status?.starting]);
 const display=displays.find(d=>d.id===selected),g=Number(gain),duration=Number(seconds),valid=Number.isFinite(g)&&g>=1.05&&g<=2&&!!display&&g<=display.potential&&Number.isInteger(duration)&&duration>=15&&duration<=300;
 return <NativeToolDialog title={t.display_title} description={t.display_description} onClose={onClose}>
  <p className="mt-3 text-sm">{t.display_hint}</p><fieldset className="native-hardware-fields mt-3 space-y-3" disabled={busy||status?.active||status?.starting}>
   <label className="block">{t.display_select}<select className="ap-input w-full" value={selected} onChange={e=>{setSelected(Number(e.target.value));setConsent(false);}}>{displays.map(d=><option key={d.id} value={d.id}>{d.name} · EDR {d.current.toFixed(2)} / {d.potential.toFixed(2)}</option>)}</select></label>
   <label className="block">{t.display_gain}<input className="ap-input w-full" type="number" min="1.05" max="2" step="0.05" value={gain} onChange={e=>{setGain(e.target.value);setConsent(false);}}/></label>
   <label className="block">{t.display_seconds}<input className="ap-input w-full" type="number" min="15" max="300" step="1" value={seconds} onChange={e=>{setSeconds(e.target.value);setConsent(false);}}/></label>
   <label className="flex gap-2"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t.display_consent}</label>
   <button className="btn-v2 btn-v2-primary" disabled={!consent||!valid} onClick={()=>void run({method:"start",display:selected,gain:g,seconds:duration})}>{t.display_start}</button>
  </fieldset>
  <div className="mt-3 flex gap-2 flex-wrap"><button className="btn-v2 btn-v2-secondary" disabled={busy||status?.active||status?.starting} onClick={()=>void run({method:"list"})}>{t.display_refresh}</button><button className="btn-v2 btn-v2-secondary" onClick={()=>{setConsent(false);void run({method:"stop"});}}>{t.display_stop}</button></div>
  <p role="status" className="mt-3">{status?.active?`${t.display_active}: ${Math.ceil(status.remaining)}`:t.display_idle}</p>{error&&<p role="alert" className="mt-2 text-red-600">{error}</p>}
 </NativeToolDialog>;
}
