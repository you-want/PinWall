import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { NativeToolDialog, useToolController } from "./NativeToolDialog";
import { ClipboardImportDialog } from "./ClipboardImportDialog";
import { historyRequest, historyStatus, toolError, type HistoryAction, type HistoryEntry, type HistorySnapshot } from "../services/widgetTools";

export function ClipboardHistoryDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n(); const controller = useToolController();
  const [snapshot, setSnapshot] = useState<HistorySnapshot | null>(null);
  const [search, setSearch] = useState(""); const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const running = useRef(false); const acting = useRef(false); const generation = useRef(0); const revision = useRef("");
  useEffect(() => {
    const signal = controller.current?.signal; if (!signal || selected) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const poll = async () => {
      if (disposed || signal.aborted || document.hidden) return;
      if (!running.current && !acting.current) {
        running.current = true;
        const current = generation.current;
        try {
          const status = await historyStatus(signal);
          if (status.revision !== revision.current) {
            const data = await historyRequest({ method: "status" }, signal);
            if (!disposed && !signal.aborted && generation.current === current) { revision.current = status.revision; setSnapshot(data); }
          }
          if (!disposed && !signal.aborted && generation.current === current) setError("");
        } catch (failure) { if (!disposed && !signal.aborted && generation.current === current) setError(toolError(failure, t)); }
        finally { running.current = false; }
      }
      if (!disposed && !signal.aborted) timer = setTimeout(() => void poll(), 1500);
    };
    const visible = () => { clearTimeout(timer); if (!document.hidden) void poll(); };
    void poll(); document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [controller, selected, t]);
  const action = async (value: HistoryAction) => {
    const signal = controller.current?.signal; if (!signal || signal.aborted || acting.current) return;
    acting.current = true; generation.current += 1; setBusy(true); setError(""); setMessage("");
    try {
      const data = await historyRequest(value, signal);
      if (!signal.aborted) { setSnapshot(data); revision.current = ""; if (value.method === "copy") setMessage(t.history_copied); }
    } catch (failure) { if (!signal.aborted) setError(toolError(failure, t)); }
    finally { acting.current = false; if (!signal.aborted) setBusy(false); }
  };
  if (selected) return <ClipboardImportDialog initialText={selected.text} onComplete={result => { setSelected(null); if (result.created) setMessage(t.history_created); }} />;
  const matches = snapshot?.entries.filter(entry => entry.text.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];
  return <NativeToolDialog title={t.history_title} description={t.history_description} onClose={onClose}>
    <p role="status" className="mt-3 text-sm">{snapshot?.stopping ? t.history_stopping : snapshot?.recording ? t.history_recording : t.history_paused}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button className="btn-v2 btn-v2-primary" disabled={busy || !snapshot || snapshot.stopping} onClick={() => void action({ method: snapshot?.recording ? "pause" : "start" })}>{snapshot?.recording ? t.history_pause : t.history_start}</button>
      <button className="btn-v2 btn-v2-secondary" disabled={busy || !snapshot} onClick={() => void action({ method: "clear" })}>{t.history_clear}</button>
    </div>
    <label className="mt-3 block text-sm">{t.history_search}<input className="form-input" value={search} onChange={event => setSearch(event.target.value)} /></label>
    {snapshot?.failed && <p role="alert" className="mt-3 text-sm text-red-700">{t.history_failed}</p>}
    {!!snapshot?.skipped && <p className="mt-3 text-sm text-gray-600">{t.history_skipped}: {snapshot.skipped}</p>}
    <ul className="mt-3 flex flex-col gap-3" aria-label={t.history_title}>
      {matches.map(entry => <li key={entry.id} className="rounded-lg border border-gray-200 p-3">
        <p className="text-xs text-gray-600">{new Date(entry.createdAt).toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US")}</p>
        <p className="my-2 whitespace-pre-wrap break-words text-sm">{entry.text.slice(0, 180)}{entry.text.length > 180 ? "…" : ""}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={() => void action({ method: "copy", id: entry.id })}>{t.history_copy}</button>
          <button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={() => { setError(""); setSelected(entry); }}>{t.history_to_note}</button>
          <button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={() => void action({ method: "delete", id: entry.id })}>{t.history_delete}</button>
        </div>
      </li>)}
    </ul>
    {!matches.length && <p className="mt-3 text-sm text-gray-600">{t.history_empty}</p>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </NativeToolDialog>;
}
