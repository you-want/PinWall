import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { NativeToolDialog, useToolController } from "./NativeToolDialog";
import { selectImage, exportImage, clearNativeTool, toolError, type ImagePreview, type ExportOptions, type ImageExport } from "../services/widgetTools";

export function ImageToolsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const controller = useToolController();
  const [image, setImage] = useState<ImagePreview | null>(null);
  const [width, setWidth] = useState(""); const [height, setHeight] = useState("");
  const [aspect, setAspect] = useState(true); const [format, setFormat] = useState<ExportOptions["format"]>("jpeg");
  const [quality, setQuality] = useState(80);
  const [phase, setPhase] = useState<"idle" | "choosing" | "exporting">("idle");
  const [error, setError] = useState(""); const [result, setResult] = useState<ImageExport | null>(null);
  const running = useRef(false);
  useEffect(() => () => { void clearNativeTool("com.pinwall.image-tools").catch(() => console.warn("[ImageTools] Selection cleanup failed")); }, []);
  const choose = async () => {
    const signal = controller.current?.signal; if (!signal || signal.aborted || running.current) return;
    running.current = true; setPhase("choosing"); setError(""); setResult(null); setImage(null);
    try {
      const selected = await selectImage(signal);
      if (!signal.aborted && selected) { setImage(selected); setWidth(String(selected.width)); setHeight(String(selected.height)); }
    } catch (failure) { if (!signal.aborted) setError(toolError(failure, t)); }
    finally { running.current = false; if (!signal.aborted) setPhase("idle"); }
  };
  const valid = Number.isInteger(Number(width)) && Number.isInteger(Number(height)) && Number(width) > 0 && Number(height) > 0 && Number(width) <= 8192 && Number(height) <= 8192 && Number(width) * Number(height) <= 16_000_000;
  const save = async () => {
    const signal = controller.current?.signal; if (!signal || signal.aborted || !image || !valid || running.current) return;
    running.current = true; setPhase("exporting"); setError(""); setResult(null);
    try { const saved = await exportImage(image.token, { width: Number(width), height: Number(height), format, quality }, signal); if (!signal.aborted) setResult(saved); }
    catch (failure) { if (!signal.aborted) setError(toolError(failure, t)); }
    finally { running.current = false; if (!signal.aborted) setPhase("idle"); }
  };
  const setDimension = (value: string, horizontal: boolean) => {
    if (horizontal) setWidth(value); else setHeight(value);
    if (aspect && image && Number(value) > 0) {
      const other = Math.max(1, Math.round(Number(value) * (horizontal ? image.height / image.width : image.width / image.height)));
      if (horizontal) setHeight(String(other)); else setWidth(String(other));
    }
    setResult(null);
  };
  return <NativeToolDialog title={t.image_tools_title} description={t.image_tools_description} onClose={onClose} locked={phase === "exporting"}
    footer={image && <button className="btn-v2 btn-v2-primary" disabled={phase !== "idle" || !valid} onClick={() => void save()}>{phase === "exporting" ? t.image_exporting : t.image_export}</button>}>
    <button className="btn-v2 btn-v2-secondary mt-3" disabled={phase !== "idle"} onClick={() => void choose()}>{phase === "choosing" ? t.image_choosing : t.image_choose}</button>
    {image && <div className="mt-3 flex flex-col gap-3">
      <img alt={t.image_preview} src={image.preview} style={{ maxHeight: 160, maxWidth: "100%", objectFit: "contain" }} />
      <p className="text-sm">{image.width} × {image.height} · {(image.originalBytes / 1024).toFixed(1)} KiB</p>
      <label className="text-sm">{t.image_width}<input className="form-input" type="number" min={1} max={8192} value={width} disabled={phase !== "idle"} onChange={event => setDimension(event.target.value, true)} /></label>
      <label className="text-sm">{t.image_height}<input className="form-input" type="number" min={1} max={8192} value={height} disabled={phase !== "idle"} onChange={event => setDimension(event.target.value, false)} /></label>
      <label className="text-sm flex gap-2"><input type="checkbox" checked={aspect} disabled={phase !== "idle"} onChange={event => setAspect(event.target.checked)} />{t.image_aspect}</label>
      <label className="text-sm">{t.image_format}<select className="form-input" value={format} disabled={phase !== "idle"} onChange={event => setFormat(event.target.value as ExportOptions["format"])}><option value="jpeg">JPEG</option><option value="png">PNG</option><option value="webp">WebP</option></select></label>
      {format === "jpeg" && <label className="text-sm">{t.image_quality}: {quality}<input type="range" min={1} max={100} value={quality} disabled={phase !== "idle"} onChange={event => setQuality(Number(event.target.value))} /></label>}
      <p className="text-sm text-gray-600">{t.image_lossless}</p>
      {!valid && <p role="alert" className="text-sm text-red-700">{t.image_invalid_size}</p>}
    </div>}
    {result && <p role="status" className="mt-3 text-sm">{t.image_exported}: {result.width} × {result.height} · {(result.bytes / 1024).toFixed(1)} KiB</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </NativeToolDialog>;
}
