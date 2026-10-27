import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { NativeTool, ToolResult } from "../services/widgetTools";
const HardwareDialog = lazy(() => import("../components/HardwareToolsDialog").then(m => ({ default: m.HardwareToolsDialog })));
const DisplayDialog = lazy(() => import("../components/DisplayToolsDialog").then(m => ({ default: m.DisplayToolsDialog })));
const MaintenanceDialog = lazy(() => import("../components/MaintenanceDialog").then(m => ({ default: m.MaintenanceDialog })));
const VideoDialog = lazy(() => import("../components/VideoToolsDialog").then(m => ({ default: m.VideoToolsDialog })));
const InputDialog = lazy(() => import("../components/InputToolsDialog").then(m => ({ default: m.InputToolsDialog })));
const AudioDialog = lazy(() => import("../components/AudioToolsDialog").then(m => ({ default: m.AudioToolsDialog })));
const WindowsDialog = lazy(() => import("../components/WindowToolsDialog").then(m => ({ default: m.WindowToolsDialog })));
const UtilitiesDialog = lazy(() => import("../components/LocalToolsDialog").then(m => ({ default: m.LocalToolsDialog })));
const ShelfDialog = lazy(() => import("../components/FileShelfDialog").then(m => ({ default: m.FileShelfDialog })));
const ScreenDialog = lazy(() => import("../components/ScreenToolsDialog").then(m => ({ default: m.ScreenToolsDialog })));
const OcrDialog = lazy(() => import("../components/ClipboardImportDialog").then(m => ({ default: m.ClipboardImportDialog })));
const ImagesDialog = lazy(() => import("../components/ImageToolsDialog").then(m => ({ default: m.ImageToolsDialog })));
const HistoryDialog = lazy(() => import("../components/ClipboardHistoryDialog").then(m => ({ default: m.ClipboardHistoryDialog })));

export function useWidgetTool() {
  const [tool, setTool] = useState<NativeTool | null>(null);
  const pending = useRef<{ resolve: (result: ToolResult) => void; signal: AbortSignal; abort: () => void } | null>(null);
  const complete = useCallback((result: ToolResult) => {
    const current = pending.current; pending.current = null;
    current?.signal.removeEventListener("abort", current.abort); current?.resolve(result); setTool(null);
  }, []);
  const request = useCallback((kind: NativeTool, signal: AbortSignal): Promise<ToolResult> => {
    if (signal.aborted) return Promise.resolve({ closed: true });
    if (pending.current) return Promise.reject(new Error("tool_busy"));
    return new Promise(resolve => {
      const abort = () => complete({ closed: true });
      pending.current = { resolve, signal, abort }; signal.addEventListener("abort", abort, { once: true }); setTool(kind);
    });
  }, [complete]);
  useEffect(() => () => {
    const current = pending.current; pending.current = null;
    current?.signal.removeEventListener("abort", current.abort); current?.resolve({ closed: true });
  }, []);
  return { request, dialog: tool ? <Suspense fallback={null}>
    {tool === "hardware" ? <HardwareDialog onClose={() => complete({ closed: true })} /> : tool === "display" ? <DisplayDialog onClose={() => complete({ closed: true })} /> : tool === "maintenance" ? <MaintenanceDialog onClose={() => complete({ closed: true })} /> : tool === "video" ? <VideoDialog onClose={() => complete({ closed: true })} /> : tool === "input" ? <InputDialog onClose={() => complete({ closed: true })} /> : tool === "audio" ? <AudioDialog onClose={() => complete({ closed: true })} /> : tool === "windows" ? <WindowsDialog onClose={() => complete({ closed: true })} /> : tool === "utilities" ? <UtilitiesDialog onClose={() => complete({ closed: true })} /> : tool === "shelf" ? <ShelfDialog onClose={() => complete({ closed: true })} /> : tool === "screen" ? <ScreenDialog onClose={() => complete({ closed: true })} /> : tool === "ocr" ? <OcrDialog source="ocr" onComplete={complete} /> : tool === "images" ? <ImagesDialog onClose={() => complete({ closed: true })} /> : <HistoryDialog onClose={() => complete({ closed: true })} />}
  </Suspense> : null };
}
