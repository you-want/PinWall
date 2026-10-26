import { useEffect, useRef, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { useI18n } from "../i18n";

export function useToolController() {
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const current = new AbortController(); controller.current = current;
    return () => current.abort();
  }, []);
  return controller;
}

export function NativeToolDialog({ title, description, onClose, locked = false, children, footer }: {
  title: string; description: string; onClose: () => void; locked?: boolean; children: ReactNode; footer?: ReactNode;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const previous = document.activeElement;
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <Dialog.Root open onOpenChange={open => { if (!open && !locked) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay data-interactive="true" className="modal-overlay-v2 widget-control" style={{ zIndex: 2147483645 }} />
      <Dialog.Content data-interactive="true" className="modal-v2 widget-control"
        style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: 2147483646, animation: "none" }}
        onContextMenu={event => event.stopPropagation()} onInteractOutside={event => event.preventDefault()}
        onEscapeKeyDown={event => { if (locked) event.preventDefault(); }}>
        <div className="modal-v2-header"><Dialog.Title className="modal-v2-title">{title}</Dialog.Title></div>
        <div className="modal-v2-body" style={{ overflowY: "auto" }}>
          <Dialog.Description className="text-sm text-gray-600">{description}</Dialog.Description>
          {children}
        </div>
        <div className="modal-v2-footer"><button className="btn-v2 btn-v2-secondary" disabled={locked} onClick={onClose}>{t.tools_close}</button>{footer}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
