import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../i18n";
import { NativeToolDialog, useToolController } from "./NativeToolDialog";
import { clearNativeTool, toolError } from "../services/widgetTools";
import { shelfRequest, type ShelfAction, type ShelfSnapshot } from "../services/widgetWorkspaceTools";

export function FileShelfDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n(); const controller = useToolController();
  const [snapshot, setSnapshot] = useState<ShelfSnapshot | null>(null);
  const [busy, setBusy] = useState(false); const [search, setSearch] = useState("");
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const operation = useRef(0); const operationSignal = useRef<AbortSignal | null>(null);
  const running = useRef(false); const refreshQueued = useRef(false);
  const run = useCallback(async (action: ShelfAction) => {
    const signal = controller.current?.signal; if (!signal || signal.aborted) return;
    if (running.current && operationSignal.current === signal) { if (action.method === "status") refreshQueued.current = true; return; }
    const current = ++operation.current; operationSignal.current = signal;
    running.current = true; setBusy(true); setError(""); if (action.method !== "status") setMessage("");
    try {
      const value = await shelfRequest(action, signal);
      if (!signal.aborted) {
        setSnapshot(previous => action.method === "status" ? { ...value, added: previous?.added ?? 0, skipped: previous?.skipped ?? 0 } : value);
        if (action.method === "clear") setMessage(t.shelf_cleared);
        if (action.method === "remove") setMessage(t.shelf_removed);
      }
    } catch (failure) { if (!signal.aborted) setError(toolError(failure, t)); }
    finally {
      if (operation.current !== current) return;
      running.current = false;
      if (!signal.aborted) {
        setBusy(false);
        if (refreshQueued.current) { refreshQueued.current = false; void run({ method: "status" }); }
      }
    }
  }, [controller, t]);
  useEffect(() => {
    let disposed = false; let unlisten: (() => void) | undefined;
    void run({ method: "activate" });
    void listen<unknown>("pinwall:shelf-changed", event => {
      if (disposed) return;
      const value = event.payload;
      if (!value || typeof value !== "object" || !("added" in value) || !("skipped" in value)
        || typeof value.added !== "number" || !Number.isSafeInteger(value.added) || value.added < 0 || value.added > 50
        || typeof value.skipped !== "number" || !Number.isSafeInteger(value.skipped) || value.skipped < 0) setError(t.shelf_drop_failed);
      else {
        const added = value.added; const skipped = value.skipped;
        setSnapshot(previous => previous ? { ...previous, added, skipped } : previous);
        void run({ method: "status" });
      }
    }).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(() => { if (!disposed) setError(t.shelf_drop_failed); });
    const refresh = () => { if (!document.hidden) void run({ method: "status" }); };
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true; unlisten?.(); window.removeEventListener("focus", refresh);
      void clearNativeTool("com.pinwall.file-shelf").catch(() => console.warn("[Shelf] Dialog cleanup failed"));
    };
  }, [run, t]);
  const clear = async () => {
    if (running.current) return;
    running.current = true; setBusy(true);
    let handedOff = false;
    try {
      const accepted = await confirm(t.shelf_clear_confirm, { title: t.shelf_title, kind: "warning", okLabel: t.shelf_clear, cancelLabel: t.btn_cancel });
      running.current = false;
      if (accepted) { handedOff = true; await run({ method: "clear" }); }
    } catch { if (!controller.current?.signal.aborted) setError(t.workspace_io); }
    finally {
      if (!handedOff) {
        running.current = false;
        if (!controller.current?.signal.aborted) {
          setBusy(false);
          if (refreshQueued.current) { refreshQueued.current = false; void run({ method: "status" }); }
        }
      }
    }
  };
  const matches = snapshot?.entries.filter(e => e.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];
  return <NativeToolDialog title={t.shelf_title} description={t.shelf_description} onClose={onClose}>
    <div className="mt-3 rounded-lg border border-dashed border-gray-400 p-3 text-sm" role="note">{t.shelf_drop_hint}</div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button className="btn-v2 btn-v2-primary" disabled={busy} onClick={() => void run({ method: "add" })}>{t.shelf_add}</button>
      <button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={() => void run({ method: "status" })}>{t.shelf_refresh}</button>
      <button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={() => void clear()}>{t.shelf_clear}</button>
    </div>
    <label className="mt-3 block text-sm">{t.shelf_search}<input className="form-input" value={search} onChange={e => setSearch(e.target.value)} /></label>
    <ul className="mt-3 flex flex-col gap-3" aria-label={t.shelf_title}>
      {matches.map(item => <li key={item.id} className="rounded-lg border border-gray-200 p-3">
        <p className="break-all text-sm font-medium">{item.name}</p>
        <p className="mt-1 text-xs text-gray-600">{item.available ? `${(item.bytes / 1024).toFixed(1)} KiB` : t.shelf_missing} · {t.shelf_expires} {new Date(item.expiresAt).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn-v2 btn-v2-secondary" disabled={busy || !item.available} onClick={() => void run({ method: "reveal", id: item.id })}>{t.shelf_reveal}</button>
          <button className="btn-v2 btn-v2-secondary" disabled={busy || !item.available} onClick={() => void run({ method: "export", id: item.id })}>{t.shelf_export}</button>
          <button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={() => void run({ method: "remove", id: item.id })}>{t.shelf_remove}</button>
        </div>
      </li>)}
    </ul>
    {!matches.length && <p className="mt-3 text-sm text-gray-600">{t.shelf_empty}</p>}
    {!!snapshot?.added && <p role="status" className="mt-3 text-sm">{t.shelf_added}: {snapshot.added}</p>}
    {!!snapshot?.skipped && <p role="status" className="mt-3 text-sm">{t.shelf_skipped}: {snapshot.skipped}</p>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </NativeToolDialog>;
}
