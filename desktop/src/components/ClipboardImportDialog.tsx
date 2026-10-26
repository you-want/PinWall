import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { useI18n } from "../i18n";
import { readClipboardText, validClipboardText, type ClipboardNoteResult } from "../services/widgetClipboard";
import { useCardStore, tauriHandler } from "../stores/cardStore";
import { recognizeImage, toolError } from "../services/widgetTools";

export function ClipboardImportDialog({ onComplete, source = "clipboard", initialText = null }: { onComplete: (result: ClipboardNoteResult) => void; source?: "clipboard" | "ocr"; initialText?: string | null }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<"idle" | "reading" | "preview" | "saving">("idle");
  const [text, setText] = useState<string | null>(initialText);
  const dialogTitle = source === "ocr" ? t.ocr_title : t.clipboard_title;
  const [title, setTitle] = useState<string>(dialogTitle);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const running = useRef(false);
  const created = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const previous = document.activeElement;
    return () => {
      controller.abort();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const read = async () => {
    const controller = controllerRef.current;
    if (running.current || !controller || controller.signal.aborted) return;
    running.current = true; setPhase("reading"); setError("");
    try {
      const value = source === "ocr" ? await recognizeImage(controller.signal) : await readClipboardText(controller.signal);
      if (controller.signal.aborted) return;
      if (value === null) { setPhase("idle"); return; }
      setText(value); setPhase("preview");
    } catch (failure: unknown) {
      if (controller.signal.aborted) return;
      const code = failure instanceof Error ? failure.message : "";
      setError(source === "ocr" ? toolError(failure, t) : code === "clipboard_sensitive" ? t.clipboard_sensitive
        : code === "clipboard_empty" || code === "clipboard_invalid" ? t.clipboard_empty
        : code === "clipboard_too_large" ? t.clipboard_large
        : code === "clipboard_changed" ? t.clipboard_changed
        : code === "clipboard_unsupported" ? t.clipboard_unsupported
        : code === "clipboard_reinstall_required" ? t.clipboard_reinstall : t.clipboard_failed);
      setPhase("idle");
    } finally { running.current = false; }
  };

  useEffect(() => { if (phase === "preview" && !createdId) titleRef.current?.focus(); }, [phase, createdId]);

  const save = async () => {
    const controller = controllerRef.current;
    if (running.current || controller?.signal.aborted || text === null) return;
    if (!validClipboardText(text)) { setError(t.clipboard_large); return; }
    running.current = true; setPhase("saving"); setError("");
    try {
      if (!created.current) {
        created.current = useCardStore.getState().createCard(title.trim().slice(0, 120) || dialogTitle, text, 0, "note", false, null, 0, 0);
        setCreatedId(created.current);
        await tauriHandler.flush();
      } else {
        await tauriHandler.retry();
      }
      if (!controller?.signal.aborted) onComplete({ created: true, cardId: created.current });
    } catch {
      if (!controller?.signal.aborted) { setError(t.clipboard_save_failed); setPhase("preview"); }
    } finally { running.current = false; }
  };

  const cancel = () => { if (phase !== "saving") onComplete({ created: false }); };
  return (
    <Dialog.Root open onOpenChange={open => { if (!open) cancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay data-interactive="true" className="modal-overlay-v2" style={{ zIndex: 2147483645 }} />
        <Dialog.Content className="modal-v2 widget-control" data-interactive="true"
          style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: 2147483646, animation: "none" }}
          onContextMenu={event => event.stopPropagation()}
          onInteractOutside={event => event.preventDefault()}
          onEscapeKeyDown={event => { if (phase === "saving") event.preventDefault(); }}>
          <div className="modal-v2-header"><Dialog.Title className="modal-v2-title">{dialogTitle}</Dialog.Title></div>
          <div className="modal-v2-body" style={{ overflowY: "auto" }}>
            <Dialog.Description className="text-sm text-gray-600">{source === "ocr" ? t.ocr_description : t.clipboard_description}</Dialog.Description>
            {text === null ? (
              <button className="btn-v2 btn-v2-primary mt-4" disabled={phase === "reading"} onClick={() => void read()}>
                {source === "ocr" ? phase === "reading" ? t.ocr_recognizing : t.ocr_choose : phase === "reading" ? t.clipboard_reading : t.clipboard_read}
              </button>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <label className="text-sm text-gray-700" htmlFor="clipboard-note-title">{t.clipboard_note_title}</label>
                <input ref={titleRef} id="clipboard-note-title" className="form-input" maxLength={120} value={title} disabled={!!createdId || phase === "saving"} onChange={event => setTitle(event.target.value)} />
                <label className="text-sm text-gray-700" htmlFor="clipboard-note-text">{t.clipboard_note_text}</label>
                <textarea id="clipboard-note-text" className="form-textarea" rows={6} value={text} disabled={!!createdId || phase === "saving"} onChange={event => setText(event.target.value)} />
              </div>
            )}
            {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
          </div>
          <div className="modal-v2-footer">
            <button className="btn-v2 btn-v2-secondary" disabled={phase === "saving"} onClick={cancel}>{t.btn_cancel}</button>
            {text !== null && <button className="btn-v2 btn-v2-primary" disabled={phase === "saving" || !validClipboardText(text)} onClick={() => void save()}>
              {phase === "saving" ? t.clipboard_saving : createdId ? t.cards_retry_save : t.clipboard_create}
            </button>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
