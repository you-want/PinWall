import { useCallback,useEffect,useRef,useState } from "react";
import { NativeToolDialog,useToolController } from "./NativeToolDialog";
import { useI18n } from "../i18n";
import { inputAction,loadInput,saveInput,validInputProfile,type InputProfile,type InputStatus } from "../services/widgetInput";
import { toolError } from "../services/widgetTools";
export function InputToolsDialog({onClose}:{onClose:()=>void}){
  const {t}=useI18n(),controller=useToolController(),running=useRef(false);
  const [profile,setProfile]=useState<InputProfile|null>(null),[excluded,setExcluded]=useState(""),[status,setStatus]=useState<InputStatus|null>(null),[dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const inputError=(failure:unknown)=>failure instanceof Error&&failure.message==="widget_storage_corrupt"?t.input_corrupt:failure instanceof Error&&failure.message==="widget_storage_future"?t.input_future:toolError(failure,t);
  const apply=(value:InputProfile)=>{setProfile(value);setExcluded(value.excludedApps.join("\n"));setDirty(false);};
  useEffect(()=>{const signal=controller.current?.signal;if(!signal)return;void Promise.all([loadInput(signal),inputAction("status",signal)]).then(([data,state])=>{if(!signal.aborted){apply(data.profile);setStatus(state);}}).catch(failure=>{if(!signal.aborted)setError(inputError(failure));}).finally(()=>{if(!signal.aborted)setBusy(false);});},[controller,t]);
  const run=useCallback(async(method:"status"|"start"|"stop"|"permission")=>{const signal=controller.current?.signal;if(!signal||signal.aborted||running.current)return;running.current=true;setBusy(true);setError("");setMessage("");try{const value=await inputAction(method,signal);if(!signal.aborted)setStatus(value);}catch(failure){if(!signal.aborted)setError(inputError(failure));}finally{running.current=false;if(!signal.aborted)setBusy(false);}},[controller,t]);
  useEffect(()=>{if(!status?.active)return;const timer=window.setInterval(()=>{if(!document.hidden)void run("status");},2000);return()=>window.clearInterval(timer);},[status?.active,run]);
  const edited=profile?{...profile,excludedApps:excluded.split("\n").map(app=>app.trim()).filter(Boolean)}:null,valid=validInputProfile(edited),locked=busy||!!status?.active;
  const update=(patch:Partial<InputProfile>)=>{if(profile){setProfile({...profile,...patch});setDirty(true);setMessage("");}};
  const save=async()=>{const signal=controller.current?.signal;if(!signal||signal.aborted||!edited||!valid||running.current)return;running.current=true;setBusy(true);setError("");try{const result=await saveInput(edited,signal);if(!signal.aborted){apply(result.profile);setMessage(t.input_saved);}}catch(failure){if(!signal.aborted)setError(inputError(failure));}finally{running.current=false;if(!signal.aborted)setBusy(false);}};
  return <NativeToolDialog title={t.input_title} description={t.input_description} onClose={onClose}>
    <p className="my-3 text-sm" role="status">{status?.active?t.input_active:t.input_stopped}{status?.active&&status.suspended?` · ${t.input_suspended}`:""}{status?.active?` · ${t.input_expanded}: ${status.expanded}`:""}</p>
    <div className="my-3 flex flex-wrap gap-2"><button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={()=>void run("permission")}>{t.input_permissions}</button><button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={()=>void run("status")}>{t.desktop_refresh}</button><button className="btn-v2 btn-v2-primary" disabled={busy||!profile||!valid||dirty||!!status?.active} onClick={()=>void run("start")}>{t.input_start}</button><button className="btn-v2 btn-v2-secondary" disabled={busy||!status?.active} onClick={()=>void run("stop")}>{t.input_stop}</button></div>
    <button className="btn-v2 btn-v2-secondary mb-3" disabled={busy||dirty||!!status?.active} onClick={()=>{const signal=controller.current?.signal;if(!signal||running.current)return;running.current=true;setBusy(true);setError("");void loadInput(signal).then(value=>{if(!signal.aborted)apply(value.profile);}).catch(failure=>{if(!signal.aborted)setError(inputError(failure));}).finally(()=>{running.current=false;if(!signal.aborted)setBusy(false);});}}>{t.input_reload}</button>
    {status&&(!status.accessibility||!status.inputMonitoring)&&<p className="mb-3 text-sm">{t.input_permission_hint}</p>}
    {profile&&<>
      <fieldset className="space-y-2" disabled={locked}><legend className="mb-2 font-medium">{t.input_options}</legend>{(["reverseVertical","reverseHorizontal","discreteOnly","arrowNavigation","textExpansion"] as const).map(key=><label key={key} className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={profile[key]} onChange={e=>update({[key]:e.target.checked})}/><span>{t[`input_${key}`]}</span></label>)}</fieldset>
      <p className="my-3 text-sm text-gray-600">{t.input_expansion_hint}</p>
      <label className="block text-sm">{t.input_exclusions}<textarea className="form-input" rows={4} disabled={locked} value={excluded} onChange={e=>{setExcluded(e.target.value);setDirty(true);}}/></label>
      <h3 className="my-3 font-medium">{t.input_snippets}</h3><ul className="space-y-3">{profile.snippets.map((snippet,index)=><li className="rounded border p-2" key={snippet.id}>
        <label className="block text-sm">{t.input_trigger}<input className="form-input" value={snippet.trigger} maxLength={24} disabled={locked} onChange={e=>update({snippets:profile.snippets.map((s,i)=>i===index?{...s,trigger:e.target.value}:s)})}/></label>
        <label className="mt-2 block text-sm">{t.input_replacement}<textarea className="form-input" rows={3} maxLength={256} disabled={locked} value={snippet.text} onChange={e=>update({snippets:profile.snippets.map((s,i)=>i===index?{...s,text:e.target.value}:s)})}/></label>
        <button className="btn-v2 btn-v2-secondary mt-2" disabled={locked} onClick={()=>update({snippets:profile.snippets.filter((_,i)=>i!==index)})}>{t.utility_remove}</button>
      </li>)}</ul>
      <div className="my-3 flex flex-wrap gap-2"><button className="btn-v2 btn-v2-secondary" disabled={locked||profile.snippets.length>=50} onClick={()=>update({snippets:[...profile.snippets,{id:crypto.randomUUID(),trigger:";",text:""}]})}>{t.input_add}</button><button className="btn-v2 btn-v2-primary" disabled={locked||!valid||!dirty} onClick={()=>void save()}>{t.input_save}</button></div>
      {dirty&&!valid&&<p className="text-sm text-red-700">{t.input_invalid}</p>}
    </>}
    {message&&<p className="mt-3 text-sm" role="status">{message}</p>}{status?.lastError&&<p className="mt-3 text-sm text-red-700" role="alert">{toolError(new Error(status.lastError),t)}</p>}{error&&<p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
  </NativeToolDialog>;
}
