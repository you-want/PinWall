import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useI18n } from "../i18n";
import { NativeToolDialog, useToolController } from "./NativeToolDialog";
import { ClipboardImportDialog } from "./ClipboardImportDialog";
import { clearNativeTool, toolError } from "../services/widgetTools";
import { originalPixel, screenRequest, type ScreenAction, type ScreenPreview, type ScreenResult } from "../services/widgetWorkspaceTools";

export function ScreenToolsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n(); const controller = useToolController(); const running = useRef(false);
  const [image, setImage] = useState<ScreenPreview | null>(null);
  const [phase, setPhase] = useState<ScreenAction["method"] | null>(null);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [point, setPoint] = useState({ x: 0, y: 0 });
  const [color, setColor] = useState<Extract<ScreenResult, { kind: "color" }> | null>(null);
  useEffect(() => () => { void clearNativeTool("com.pinwall.screen-tools").catch(() => console.warn("[ScreenTools] Dialog cleanup failed")); }, []);
  const run = async (action: ScreenAction) => {
    const signal = controller.current?.signal; if (!signal || signal.aborted || running.current) return;
    running.current = true; setPhase(action.method); setError(""); setMessage("");
    if (action.method === "capture") { setImage(null); setColor(null); }
    try {
      const result = await screenRequest(action, signal);
      if (signal.aborted) return;
      if (result.kind === "capture") { setImage(result.image); setPoint({ x: Math.floor(result.image.width / 2), y: Math.floor(result.image.height / 2) }); }
      if (result.kind === "text") setText(result.text);
      if (result.kind === "color") { setColor(result); if (result.copied) setMessage(t.screen_copied); }
      if (result.kind === "exported") setMessage(`${t.image_exported}: ${(result.bytes / 1024).toFixed(1)} KiB`);
      if (result.kind === "cancelled" && action.method === "capture") setMessage(t.screen_cancelled);
    } catch (failure) { if (!signal.aborted) setError(toolError(failure, t)); }
    finally { running.current = false; if (!signal.aborted) setPhase(null); }
  };
  if (text !== null) return <ClipboardImportDialog source="ocr" initialText={text} onComplete={result => { setText(null); if (result.created) setMessage(t.history_created); }} />;
  const valid = image && Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.x < image.width && point.y >= 0 && point.y < image.height;
  const pick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!image) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const next = event.detail === 0 ? point : { x: originalPixel((event.clientX - rect.left) / rect.width, image.width), y: originalPixel((event.clientY - rect.top) / rect.height, image.height) };
    setPoint(next); void run({ method: "color", token: image.token, ...next, copy: false });
  };
  return <NativeToolDialog title={t.screen_title} description={t.screen_description} onClose={onClose} locked={phase === "export"}>
    <button className="btn-v2 btn-v2-primary mt-3" disabled={phase !== null} onClick={() => void run({ method: "capture" })}>{phase === "capture" ? t.screen_capturing : t.screen_capture}</button>
    {image && <div className="mt-3 flex flex-col gap-3">
      <p className="text-sm">{image.width} × {image.height} · {t.screen_pick_hint}</p>
      <button type="button" aria-label={t.screen_preview} disabled={phase !== null} onClick={pick} className="w-full rounded focus-visible:outline-2 focus-visible:outline-blue-600" style={{ display: "block", padding: 0, border: 0, background: "transparent", cursor: "crosshair" }}>
        <img alt={t.screen_preview} src={image.preview} style={{ display: "block", width: "100%", height: "auto" }} />
      </button>
      <div className="flex gap-3">
        <label className="min-w-0 flex-1 text-sm">{t.screen_x}<input className="form-input" type="number" min={0} max={image.width - 1} disabled={phase !== null} value={point.x} onChange={event => { setPoint({ ...point, x: Number(event.target.value) }); setColor(null); }} /></label>
        <label className="min-w-0 flex-1 text-sm">{t.screen_y}<input className="form-input" type="number" min={0} max={image.height - 1} disabled={phase !== null} value={point.y} onChange={event => { setPoint({ ...point, y: Number(event.target.value) }); setColor(null); }} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-v2 btn-v2-secondary" disabled={phase !== null || !valid} onClick={() => void run({ method: "color", token: image.token, ...point, copy: false })}>{t.screen_pick}</button>
        <button className="btn-v2 btn-v2-secondary" disabled={phase !== null} onClick={() => void run({ method: "ocr", token: image.token })}>{phase === "ocr" ? t.ocr_recognizing : t.screen_ocr}</button>
        <button className="btn-v2 btn-v2-secondary" disabled={phase !== null} onClick={() => void run({ method: "export", token: image.token })}>{t.screen_export}</button>
      </div>
      {color && <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden="true" className="h-8 w-8 rounded border border-gray-300" style={{ backgroundColor: color.hex }} />
        <output aria-label={t.screen_color}>{color.hex} · RGB({color.r}, {color.g}, {color.b})</output>
        <button className="btn-v2 btn-v2-secondary" disabled={phase !== null || !valid} onClick={() => void run({ method: "color", token: image.token, ...point, copy: true })}>{t.screen_copy}</button>
      </div>}
    </div>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </NativeToolDialog>;
}
