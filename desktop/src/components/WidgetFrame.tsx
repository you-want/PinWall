import React, { useRef, useState, useCallback, useEffect } from "react";
import type {
  WidgetInstance,
  WidgetSizePreset,
} from "../types";
import { WIDGET_SIZE_PRESETS } from "../types";
import { loadWidgetEntryHtml, uninstallWidget as uninstallWidgetFiles } from "../services/widgetLoader";
import { handleBridgeRequest, subscribeWidgetEvent } from "../services/widgetBridge";
import { useWidgetStore } from "../stores/widgetStore";
import { parseWidgetRequest, prepareWidgetHtml } from "../services/widgetProtocol";
import { createWidgetPowerSession, revokeWidgetPower } from "../services/widgetPower";
import { useI18n } from "../i18n";
import { useClipboardImport } from "../hooks/useClipboardImport";

interface WidgetFrameProps {
  instance: WidgetInstance;
  variant?: "freeform" | "side-panel";
}

export function WidgetFrame({ instance, variant = "freeform" }: WidgetFrameProps) {
  const { t, lang } = useI18n();
  const { request: importClipboard, dialog: clipboardDialog } = useClipboardImport();
  const { manifest, x, y, size, zIndex, settings, enabled } = instance;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [entryHtml, setEntryHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const { setPosition, bringToFront, setSize, uninstallWidget, toggleWidget, updateSettings } =
    useWidgetStore();
  // Opaque sandbox frames can only be addressed with '*'; replies are bound to this exact frame.
  const targetOrigin = "*";

  useEffect(() => {
    let cancelled = false;

    setLoadError(null);
    setEntryHtml(null);
    if (!enabled) return;

    loadWidgetEntryHtml(manifest.id)
      .then((html) => {
        if (cancelled) return;
        setEntryHtml(html);
        setLoadError(null);
      })
      .catch(() => {
        if (cancelled) return;
        console.warn("[WidgetFrame] Failed to load widget entry", { widgetId: manifest.id });
        setEntryHtml(null);
        setLoadError("load_failed");
      });

    return () => {
      cancelled = true;
    };
  }, [manifest.id, manifest.entry, manifest.installedPath, reloadKey, enabled]);

  // ── postMessage 桥接 ──
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !entryHtml || !enabled) return;
    const controller = new AbortController();
    const power = createWidgetPowerSession(manifest);
    const inFlight = new Set<string>();
    let intervalStarted = Date.now();
    let requestCount = 0;

    const handler = async (e: MessageEvent) => {
      // 只处理来自当前 Widget iframe 的消息
      if (e.source !== iframe.contentWindow || e.origin !== "null" || controller.signal.aborted) return;
      const request = parseWidgetRequest(e.data);
      if (!request || inFlight.has(request.id)) return;
      if (Date.now() - intervalStarted >= 1000) { intervalStarted = Date.now(); requestCount = 0; }
      if (++requestCount > 60 || inFlight.size >= 16) {
        iframe.contentWindow?.postMessage({ type: "response", id: request.id, success: false, error: "Widget request limit exceeded" }, targetOrigin);
        return;
      }
      inFlight.add(request.id);
      let response;
      try {
        response = await handleBridgeRequest(request, manifest, { signal: controller.signal, power, clipboard: () => importClipboard(controller.signal) });
      } catch {
        response = { type: "response", id: request.id, success: false, error: "Widget request failed" };
      } finally {
        inFlight.delete(request.id);
      }

      // 回传响应
      if (!controller.signal.aborted) iframe.contentWindow?.postMessage(response, targetOrigin);
    };

    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      controller.abort();
      void power.dispose().catch(() => console.warn("[WidgetFrame] Power session cleanup failed", { widgetId: manifest.id }));
    };
  }, [manifest, reloadKey, entryHtml, enabled, importClipboard]);

  // ── 事件推送：向 iframe 广播应用事件 ──
  useEffect(() => {
    if (!enabled || !entryHtml || !manifest.permissions.includes("events")) return;
    const iframe = iframeRef.current;

    const unsub = subscribeWidgetEvent("*", (event, payload) => {
      iframe?.contentWindow?.postMessage(
        { type: "event", event, payload },
        targetOrigin
      );
    });
    return unsub;
  }, [manifest.permissions, reloadKey, entryHtml, enabled]);

  // ── Widget 初始化：发送配置 ──
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !entryHtml || !enabled) return;

    const sendReady = () => {
      iframe.contentWindow?.postMessage(
        {
          type: "event",
          event: "pinwall:ready",
          payload: {
            settings,
            locale: lang,
            bridgeVersion: 1,
            widgetId: manifest.id,
          },
        },
        targetOrigin
      );
    };

    const onLoad = () => {
      // Let the embedded document finish loading before exposing interactive controls.
      window.clearTimeout(readyTimer);
      readyTimer = window.setTimeout(sendReady, 120);
    };

    iframe.addEventListener("load", onLoad);
    let readyTimer = window.setTimeout(sendReady, 120);
    return () => {
      window.clearTimeout(readyTimer);
      iframe.removeEventListener("load", onLoad);
    };
  }, [manifest.id, settings, reloadKey, entryHtml, enabled, lang]);

  // ── 拖拽 ──
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (variant === "side-panel") return;
      if ((e.target as HTMLElement).closest(".widget-control")) {
        return;
      }
      e.preventDefault();
      bringToFront(manifest.id);
      setIsDragging(true);
      dragOffsetRef.current = { x: e.clientX - x, y: e.clientY - y };

      const handlePointerMove = (ev: PointerEvent) => {
        const newX = ev.clientX - dragOffsetRef.current.x;
        const newY = ev.clientY - dragOffsetRef.current.y;
        setPosition(manifest.id, newX, newY);
      };

      const handlePointerUp = () => {
        setIsDragging(false);
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [manifest.id, x, y, setPosition, bringToFront, variant]
  );

  // ── 右键菜单 ──
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (contextMenu) {
      document.addEventListener("click", closeContextMenu);
      return () => document.removeEventListener("click", closeContextMenu);
    }
  }, [contextMenu, closeContextMenu]);

  // ── 尺寸预设切换 ──
  const handleSizePreset = useCallback(
    (preset: WidgetSizePreset) => {
      setSize(manifest.id, WIDGET_SIZE_PRESETS[preset]);
      setContextMenu(null);
    },
    [manifest.id, setSize]
  );

  // ── 卸载 ──
  const handleUninstall = useCallback(async () => {
    const removed = await uninstallWidgetFiles(manifest.id);
    if (removed) uninstallWidget(manifest.id);
    else setLoadError("uninstall_failed");
    setContextMenu(null);
  }, [manifest.id, uninstallWidget]);

  // ── 刷新 ──
  const handleRefresh = useCallback(() => {
    setReloadKey((key) => key + 1);
    setContextMenu(null);
  }, []);

  const handleDisable = async () => {
    try {
      await revokeWidgetPower(manifest.id);
      toggleWidget(manifest.id, false);
    } catch {
      setLoadError("stop_failed");
    }
    setContextMenu(null);
  };

  if (!enabled) return null;

  const frameStyle: React.CSSProperties = variant === "side-panel"
    ? {
        position: "relative",
        width: "100%",
        height: size.height,
        zIndex: "auto",
        cursor: "default",
        userSelect: "none",
      }
    : {
        position: "absolute",
        left: x,
        top: y,
        width: size.width,
        height: size.height,
        zIndex,
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
      };

  return (
    <div
      ref={containerRef}
      data-interactive
      className={`widget-frame ${variant === "side-panel" ? "widget-frame-side" : ""}`}
      style={frameStyle}
      onPointerDown={handlePointerDown}
      onContextMenu={handleContextMenu}
    >
      {clipboardDialog}
      {/* 容器样式 */}
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          borderRadius: 14,
          overflow: "hidden",
          background: "rgba(28, 28, 30, 0.76)",
          backdropFilter: "blur(32px) saturate(170%)",
          WebkitBackdropFilter: "blur(32px) saturate(170%)",
          boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
          border: "1px solid rgba(255,255,255,0.16)",
        }}
      >
        <iframe
          key={`${manifest.id}-${reloadKey}-${entryHtml ? "srcdoc" : "src"}`}
          ref={iframeRef}
          srcDoc={entryHtml ? prepareWidgetHtml(entryHtml) : ""}
          title={manifest.name}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            pointerEvents: isDragging ? "none" : "auto",
          }}
        />
        {loadError && (
          <div
            role="status"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              color: "rgba(255,255,255,0.78)",
              fontSize: 12,
              textAlign: "center",
              background: "rgba(28, 28, 30, 0.82)",
            }}
          >
            {loadError === "uninstall_failed" ? t.widget_uninstall_failed : loadError === "stop_failed" ? t.widget_stop_failed : t.widget_load_failed}
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="widget-control"
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 99999,
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(20px)",
            borderRadius: 10,
            padding: "4px 0",
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
            minWidth: 160,
            fontSize: 13,
          }}
        >
          <MenuItem label={t.widget_refresh} onClick={handleRefresh} />
          <MenuItem label={t.widget_settings} onClick={() => { setShowSettings(true); setContextMenu(null); }} />
          <MenuDivider />
          <MenuItem label={`${t.widget_size} S`} onClick={() => handleSizePreset("S")} />
          <MenuItem label={`${t.widget_size} M`} onClick={() => handleSizePreset("M")} />
          <MenuItem label={`${t.widget_size} L`} onClick={() => handleSizePreset("L")} />
          <MenuDivider />
          <MenuItem label={t.widget_disable} onClick={handleDisable} />
          <MenuItem label={t.widget_remove} onClick={handleUninstall} danger />
        </div>
      )}

      {/* 设置弹窗 */}
      {showSettings && (
        <WidgetSettingsDialog
          manifest={manifest}
          currentSettings={settings}
          onSave={(newSettings) => {
            updateSettings(manifest.id, newSettings);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// ── 辅助子组件 ──

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className="widget-control"
      onClick={onClick}
      style={{
        padding: "6px 16px",
        cursor: "pointer",
        color: danger ? "#ef4444" : "#1a1a1a",
        transition: "background 0.15s",
        display: "block",
        width: "100%",
        border: 0,
        background: "transparent",
        textAlign: "left",
      }}
      onMouseEnter={(e) =>
        ((e.target as HTMLElement).style.background = "rgba(0,0,0,0.05)")
      }
      onMouseLeave={(e) =>
        ((e.target as HTMLElement).style.background = "transparent")
      }
    >
      {label}
    </button>
  );
}

function MenuDivider() {
  return (
    <div
      style={{
        height: 1,
        background: "rgba(0,0,0,0.08)",
        margin: "4px 0",
      }}
    />
  );
}

function WidgetSettingsDialog({
  manifest,
  currentSettings,
  onSave,
  onClose,
}: {
  manifest: WidgetInstance["manifest"];
  currentSettings: Record<string, any>;
  onSave: (settings: Record<string, any>) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, any>>({ ...currentSettings });
  const defs = manifest.settings || [];

  if (defs.length === 0) {
    return null;
  }

  return (
    <div
      className="widget-control"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 10,
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(20px)",
        borderRadius: 16,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflow: "auto",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>{manifest.name} 设置</div>

      {defs.map((def) => (
        <div key={def.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "#6b7280" }}>{def.label}</label>
          {def.type === "select" ? (
            <select
              value={values[def.key] ?? def.default ?? ""}
              onChange={(e) => setValues({ ...values, [def.key]: e.target.value })}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid rgba(0,0,0,0.15)",
                fontSize: 13,
              }}
            >
              {def.options?.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : def.type === "boolean" ? (
            <input
              type="checkbox"
              checked={!!values[def.key]}
              onChange={(e) => setValues({ ...values, [def.key]: e.target.checked })}
            />
          ) : def.type === "number" ? (
            <input
              type="number"
              value={values[def.key] ?? def.default ?? 0}
              min={def.min}
              max={def.max}
              onChange={(e) =>
                setValues({ ...values, [def.key]: Number(e.target.value) })
              }
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid rgba(0,0,0,0.15)",
                fontSize: 13,
              }}
            />
          ) : def.type === "color" ? (
            <input
              type="color"
              value={values[def.key] ?? def.default ?? "#000000"}
              onChange={(e) => setValues({ ...values, [def.key]: e.target.value })}
            />
          ) : (
            <input
              type="text"
              value={values[def.key] ?? def.default ?? ""}
              onChange={(e) => setValues({ ...values, [def.key]: e.target.value })}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid rgba(0,0,0,0.15)",
                fontSize: 13,
              }}
            />
          )}
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
        <button
          onClick={() => onSave(values)}
          style={{
            flex: 1,
            padding: "6px 0",
            borderRadius: 8,
            border: "none",
            background: "#6366f1",
            color: "white",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          保存
        </button>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: "6px 0",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "transparent",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          取消
        </button>
      </div>
    </div>
  );
}
