import {useEffect,useRef,useState} from "react";
import {NativeToolDialog} from "./NativeToolDialog";
import {useI18n} from "../i18n";
import {marketRequest,cancelMarket,type MarketConfig,type MarketEntry,type MarketAction} from "../services/trustedMarketplace";
import {getWidgetPermissionDescription,getWidgetPermissionLabel} from "../data/widgetPermissions";
import {useWidgetStore} from "../stores/widgetStore";
import type {WidgetManifest} from "../types";
export function MarketplacePanel({onClose}:{onClose:()=>void}){
 const {t,lang}=useI18n(),widgets=useWidgetStore(s=>s.widgets),alive=useRef(false),running=useRef(false),cleanup=useRef<number|null>(null);
 const [config,setConfig]=useState<MarketConfig>({enabled:false,catalogUrl:"",rootKey:""}),[dirty,setDirty]=useState(false),[loaded,setLoaded]=useState(false),[trusted,setTrusted]=useState(false),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [entries,setEntries]=useState<MarketEntry[]>([]),[preview,setPreview]=useState<{token:string;manifest:WidgetManifest}|null>(null),[search,setSearch]=useState("");
 const failure=(reason:unknown)=>{const code=typeof reason==="string"?reason:reason instanceof Error?reason.message:"";return code==="market_signature"||code==="market_digest"?t.market_bad_signature:code==="market_rollback"?t.market_rollback:code==="market_expired"||code==="market_clock"?t.market_expired:code==="market_changed"?t.market_changed:code==="market_key"||code==="market_https"||code==="widget_network_denied"||code==="widget_network_invalid"?t.market_bad_config:code==="market_busy"||code==="widget_storage_busy"?t.tools_busy:code==="market_cancelled"?t.market_cancelled:t.market_failed;};
 const run=async(action:MarketAction)=>{if(running.current)return;running.current=true;setBusy(true);setError("");setMessage("");if(action.method==="prepare"||action.method==="refresh")setPreview(null);try{const result=await marketRequest(action);if(!alive.current)return;
  if("config" in result){setConfig(result.config);setLoaded(true);setDirty(false);setTrusted(false);setPreview(null);setEntries([]);}
  else if("entries" in result){setEntries(result.entries);setMessage(`${t.market_verified}: ${result.revision} · ${t.market_expires}: ${new Date(result.expiresAt*1000).toLocaleString(lang==="zh"?"zh-CN":"en-US")}`);}
  else if("token" in result){setPreview(result);setConfirmed(false);}
  else if("manifest" in result){useWidgetStore.getState().installWidget(result.manifest);setPreview(null);setConfirmed(false);setMessage(t.market_installed);}
 }catch(reason){if(alive.current){setError(failure(reason));if(action.method==="install")setPreview(null);}}finally{running.current=false;if(alive.current)setBusy(false);}};
 useEffect(()=>{alive.current=true;if(cleanup.current!==null)window.clearTimeout(cleanup.current);void run({method:"config"});return()=>{alive.current=false;cleanup.current=window.setTimeout(()=>{void cancelMarket().catch(()=>console.warn("[Marketplace] Session cleanup failed"));},0);};},[]);
 const edit=(update:Partial<MarketConfig>)=>{setConfig({...config,...update});setDirty(true);setTrusted(false);setEntries([]);setPreview(null);};
 return <NativeToolDialog title={t.market_title} description={t.market_description} onClose={onClose}>
  <fieldset disabled={!loaded||busy} className="mt-3 space-y-3 min-w-0">
   <legend>{t.market_trust}</legend>
   <label className="flex gap-2"><input type="checkbox" checked={config.enabled} onChange={e=>edit({enabled:e.target.checked})}/>{t.market_enable}</label>
   <label className="block">{t.market_url}<input className="ap-input w-full" type="url" value={config.catalogUrl} onChange={e=>edit({catalogUrl:e.target.value})} spellCheck={false}/></label>
   <label className="block">{t.market_root}<input className="ap-input w-full" value={config.rootKey} onChange={e=>edit({rootKey:e.target.value})} spellCheck={false}/></label>
   <p className="text-xs break-words">{t.market_root_hint}</p>
   <label className="flex gap-2"><input type="checkbox" checked={trusted} onChange={e=>setTrusted(e.target.checked)}/>{t.market_trust_confirm}</label>
   <button className="btn-v2 btn-v2-secondary" disabled={config.enabled&&!trusted} onClick={()=>void run({method:"configure",config})}>{t.market_save}</button>
  </fieldset>
  <div className="mt-4 flex gap-2 flex-wrap"><button className="btn-v2 btn-v2-primary" disabled={busy||!loaded||!config.enabled||dirty} onClick={()=>void run({method:"refresh"})}>{t.market_refresh}</button><button className="btn-v2 btn-v2-secondary" disabled={!busy&&!preview} onClick={()=>{void cancelMarket().catch(()=>setError(t.market_failed));setPreview(null);setConfirmed(false);}}>{t.market_cancel}</button></div>
  <p className="mt-2 text-xs">{t.market_single_file}</p>
  <label className="mt-3 block">{t.market_search}<input className="ap-input w-full" value={search} onChange={e=>setSearch(e.target.value)}/></label>
  <ul className="mt-2 space-y-2">{entries.filter(e=>`${e.name} ${e.id} ${e.publisher}`.toLowerCase().includes(search.toLowerCase())).map(entry=><li key={entry.id} className="rounded border p-2 min-w-0"><p className="break-words">{entry.name} v{entry.version}</p><p className="text-xs break-words">{entry.id} · {entry.publisher}</p><p className="text-sm break-words">{entry.description}</p><p className="text-xs">{widgets.find(w=>w.manifest.id===entry.id)?.manifest.version}</p><button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={()=>void run({method:"prepare",id:entry.id,version:entry.version})}>{t.market_prepare}</button></li>)}</ul>
  {preview&&<section aria-label={t.market_review} className="mt-3 space-y-2 rounded border p-3"><h3>{preview.manifest.name} v{preview.manifest.version}</h3><ul>{preview.manifest.permissions.map(p=><li key={p}>{getWidgetPermissionLabel(p,lang)}: {getWidgetPermissionDescription(p,lang)}</li>)}</ul><label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>{t.market_install_confirm}</label><button className="btn-v2 btn-v2-primary" disabled={!confirmed||busy} onClick={()=>void run({method:"install",token:preview.token})}>{t.market_install}</button></section>}
  {busy&&<p role="status">{t.market_working}</p>}{message&&<p role="status" className="mt-2 break-words">{message}</p>}{error&&<p role="alert" className="mt-2 text-red-600">{error}</p>}
 </NativeToolDialog>;
}
