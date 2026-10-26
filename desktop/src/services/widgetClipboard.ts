import { invoke } from "@tauri-apps/api/core";

export const CLIPBOARD_WIDGET_ID = "com.pinwall.clipboard-note";
export type ClipboardNoteResult = { created: false } | { created: true; cardId: string };
export const MAX_CLIPBOARD_BYTES = 64 * 1024;

export function validClipboardText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && new TextEncoder().encode(value).length <= MAX_CLIPBOARD_BYTES;
}

/** Called from the host's Read button, never automatically or directly from an iframe. */
export async function readClipboardText(signal: AbortSignal): Promise<string> {
  if (signal.aborted) throw new Error("clipboard_cancelled");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  try {
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new Error("clipboard_cancelled"));
      signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => reject(new Error("clipboard_unavailable")), 8000);
    });
    const text = await Promise.race([
      invoke<unknown>("read_widget_clipboard_text", { widgetId: CLIPBOARD_WIDGET_ID }), cancelled,
    ]);
    if (!validClipboardText(text)) throw new Error("clipboard_invalid");
    return text;
  } catch (error: unknown) {
    const code = typeof error === "string" ? error : error instanceof Error ? error.message : "";
    const known = ["clipboard_cancelled", "clipboard_unavailable", "clipboard_invalid", "clipboard_empty", "clipboard_too_large", "clipboard_sensitive", "clipboard_changed", "clipboard_busy", "clipboard_unsupported", "clipboard_reinstall_required"];
    throw new Error(known.includes(code) ? code : code === "clipboard_untrusted_widget" ? "clipboard_reinstall_required" : "clipboard_unavailable");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
