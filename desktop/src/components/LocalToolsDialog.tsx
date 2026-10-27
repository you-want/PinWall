import { useEffect, useRef, useState } from "react";
import { Tabs } from "radix-ui";
import { confirm } from "@tauri-apps/plugin-dialog";
import { NativeToolDialog, useToolController } from "./NativeToolDialog";
import { useI18n } from "../i18n";
import { calculate, cleanLink } from "../services/localUtilities";
import { utilityRequest, type Snippet, type UtilityAction } from "../services/widgetUtilities";
import { toolError } from "../services/widgetTools";

export function LocalToolsDialog({onClose}:{onClose:()=>void}){
  const {t}=useI18n();const controller=useToolController();const running=useRef(false);
  const [busy,setBusy]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [link,setLink]=useState(""),[cleaned,setCleaned]=useState<ReturnType<typeof cleanLink>|null>(null);
  const [expression,setExpression]=useState(""),[answer,setAnswer]=useState<number|null>(null);
  const [snippets,setSnippets]=useState<Snippet[]>([]),[search,setSearch]=useState("");
  const [id,setId]=useState<string|null>(null),[title,setTitle]=useState(""),[text,setText]=useState("");
  useEffect(()=>{
    const signal=controller.current?.signal;if(!signal)return;
    setBusy(true);
    void utilityRequest({method:"list"},signal).then(value=>{if(!signal.aborted)setSnippets(value);}).catch(failure=>{if(!signal.aborted)setError(toolError(failure,t));}).finally(()=>{if(!signal.aborted)setBusy(false);});
  },[controller,t]);
  const run=async(action:UtilityAction)=>{
    const signal=controller.current?.signal;if(!signal||signal.aborted||running.current)return;
    running.current=true;setBusy(true);setError("");setMessage("");
    try{const value=await utilityRequest(action,signal);if(signal.aborted)return;
      if(action.method==="copy")setMessage(t.utility_copied);
      else {setSnippets(value);if(action.method==="save")setMessage(t.utility_saved);if(action.method==="clear"||action.method==="remove"){setId(null);setTitle("");setText("");}}
    }catch(failure){if(!signal.aborted)setError(toolError(failure,t));}
    finally{running.current=false;if(!signal.aborted)setBusy(false);}
  };
  const clean=()=>{setError("");setMessage("");try{setCleaned(cleanLink(link));}catch{setCleaned(null);setError(t.utility_invalid_url);}};
  const compute=()=>{setError("");setMessage("");try{setAnswer(calculate(expression));}catch{setAnswer(null);setError(t.utility_invalid_expression);}};
  const clear=async()=>{if(busy)return;try{if(await confirm(t.utility_clear_confirm,{title:t.utility_snippets,okLabel:t.utility_clear,cancelLabel:t.btn_cancel,kind:"warning"}))await run({method:"clear"});}catch{setError(t.utility_failed);}};
  const tabClass="rounded px-3 py-2 text-sm focus-visible:outline-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900";
  return <NativeToolDialog title={t.utility_title} description={t.utility_description} onClose={onClose}>
    <Tabs.Root defaultValue="links">
      <Tabs.List className="my-3 flex flex-wrap gap-2" aria-label={t.utility_title}>
        <Tabs.Trigger className={tabClass} value="links">{t.utility_links}</Tabs.Trigger><Tabs.Trigger className={tabClass} value="calculator">{t.utility_calculator}</Tabs.Trigger><Tabs.Trigger className={tabClass} value="snippets">{t.utility_snippets}</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="links">
        <label className="block text-sm">{t.utility_url}<textarea className="form-input" value={link} onChange={e=>{setLink(e.target.value);setCleaned(null);}} rows={3}/></label>
        <button className="btn-v2 btn-v2-primary mt-3" onClick={clean}>{t.utility_clean}</button>
        {cleaned&&<div className="mt-3"><label className="block text-sm">{t.utility_result}<textarea className="form-input" readOnly value={cleaned.url} rows={3}/></label><p className="my-2 text-sm" role="status">{cleaned.signed?t.utility_signed:`${t.utility_removed}: ${cleaned.removed}`}</p><button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={()=>void run({method:"copy",text:cleaned.url})}>{t.utility_copy}</button></div>}
      </Tabs.Content>
      <Tabs.Content value="calculator">
        <p className="mb-3 text-sm text-gray-600">{t.utility_calc_hint}</p>
        <label className="block text-sm">{t.utility_expression}<input className="form-input" value={expression} onChange={e=>{setExpression(e.target.value);setAnswer(null);}} onKeyDown={e=>{if(e.key==="Enter")compute();}}/></label>
        <button className="btn-v2 btn-v2-primary mt-3" onClick={compute}>{t.utility_calculate}</button>
        {answer!==null&&<div className="mt-3"><output className="block break-all" aria-label={t.utility_result}>{answer}</output><button className="btn-v2 btn-v2-secondary mt-2" disabled={busy} onClick={()=>void run({method:"copy",text:String(answer)})}>{t.utility_copy}</button></div>}
      </Tabs.Content>
      <Tabs.Content value="snippets">
        <label className="block text-sm">{t.utility_search}<input className="form-input" value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <ul className="my-3 flex max-h-48 flex-col gap-2 overflow-y-auto" aria-label={t.utility_snippets}>
          {snippets.filter(s=>(s.title+"\n"+s.text).toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(s=><li key={s.id} className="rounded border border-gray-200 p-2"><p className="break-all font-medium">{s.title}</p><div className="mt-1 flex flex-wrap gap-2"><button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={()=>{setId(s.id);setTitle(s.title);setText(s.text);}}>{t.utility_edit}</button><button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={()=>void run({method:"copy",text:s.text})}>{t.utility_copy}</button><button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={()=>void run({method:"remove",id:s.id})}>{t.utility_remove}</button></div></li>)}
        </ul>
        <label className="block text-sm">{t.utility_snippet_title}<input className="form-input" value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/></label>
        <label className="mt-2 block text-sm">{t.utility_snippet_text}<textarea className="form-input" rows={4} value={text} disabled={busy} onChange={e=>setText(e.target.value)}/></label>
        <div className="mt-3 flex flex-wrap gap-2"><button className="btn-v2 btn-v2-primary" disabled={busy||!title.trim()||!text||new TextEncoder().encode(title).length>256||new TextEncoder().encode(text).length>65536} onClick={()=>{const next=id??crypto.randomUUID();setId(next);void run({method:"save",id:next,title,text});}}>{t.utility_save}</button><button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={()=>{setId(null);setTitle("");setText("");}}>{t.utility_new}</button><button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={()=>void clear()}>{t.utility_clear}</button></div>
      </Tabs.Content>
    </Tabs.Root>
    {message&&<p className="mt-3 text-sm" role="status">{message}</p>}{error&&<p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
  </NativeToolDialog>;
}
