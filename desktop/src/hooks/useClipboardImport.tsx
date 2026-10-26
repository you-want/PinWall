import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ClipboardNoteResult } from "../services/widgetClipboard";

const ImportDialog = lazy(() => import("../components/ClipboardImportDialog").then(module => ({ default: module.ClipboardImportDialog })));

/** Raw clipboard text never enters the plugin's message channel. */
export function useClipboardImport() {
  const [open, setOpen] = useState(false);
  const pending = useRef<{ resolve: (result: ClipboardNoteResult) => void; signal: AbortSignal; abort: () => void } | null>(null);
  const complete = useCallback((result: ClipboardNoteResult) => {
    const current = pending.current;
    pending.current = null;
    current?.signal.removeEventListener("abort", current.abort);
    current?.resolve(result);
    setOpen(false);
  }, []);
  const request = useCallback((signal: AbortSignal): Promise<ClipboardNoteResult> => {
    if (signal.aborted) return Promise.resolve({ created: false });
    if (pending.current) return Promise.reject(new Error("clipboard_busy"));
    return new Promise(resolve => {
      const abort = () => complete({ created: false });
      pending.current = { resolve, signal, abort };
      signal.addEventListener("abort", abort, { once: true });
      setOpen(true);
    });
  }, [complete]);
  useEffect(() => () => {
    const current = pending.current;
    pending.current = null;
    current?.signal.removeEventListener("abort", current.abort);
    current?.resolve({ created: false });
  }, []);
  return { request, dialog: open ? <Suspense fallback={null}><ImportDialog onComplete={complete} /></Suspense> : null };
}
