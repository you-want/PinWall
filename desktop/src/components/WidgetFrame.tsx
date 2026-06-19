import React, { useRef, useState, useCallback, useEffect } from "react";
import type {
  WidgetInstance,
  WidgetBridgeRequest,
  WidgetSizePreset,
} from "../types";
import { WIDGET_SIZE_PRESETS } from "../types";
import { getWidgetAssetUrl } from "../services/widgetLoader";
import { handleBridgeRequest, subscribeWidgetEvent } from "../services/widgetBridge";
import { useWidgetStore } from "../stores/widgetStore";

interface WidgetFrameProps {
  instance: WidgetInstance;
}

export function WidgetFrame({ instance }: WidgetFrameProps) {
  const { manifest, x, y, size, zIndex, settings, enabled } = instance;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const { setPosition, bringToFront, setSize, uninstallWidget, updateSettings } =
    useWidgetStore();

  // ── postMessage 桥接 ──
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handler = async (e: MessageEvent) => {
      // 只处理来自当前 Widget iframe 的消息
      if (e.source !== iframe.contentWindow) return;
      const msg = e.data;
      if (!msg || msg.type !== "request") return;

      const request = msg as WidgetBridgeRequest;
      const response = await handleBridgeRequest(request, manifest);

      // 回传响应
      iframe.contentWindow?.postMessage(response, "*");
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [manifest]);

  // ── 事件推送：向 iframe 广播应用事件 ──
  useEffect(() => {
    if (!manifest.permissions.includes("events")) return;
    const iframe = iframeRef.current;

    const unsub = subscribeWidgetEvent("*", (event, payload) => {
      iframe?.contentWindow?.postMessage(
        { type: "event", event, payload },
        "*"
      );
    });
    return unsub;
  }, [manifest.permissions]);

  // ── Widget 初始化：发送配置 ──
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const onLoad = () => {
      // 发送初始化配置
      iframe.contentWindow?.postMessage(
        {
          type: "event",
          event: "pinwall:ready",
          payload: {
            settings,
            locale: navigator.language.startsWith("zh") ? "zh" : "en",
            widgetId: manifest.id,
          },
        },
        "*"
      );
    };

    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [manifest.id, settings]);

  // ── 拖拽 ──
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
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
    [manifest.id, x, y, setPosition, bringToFront]
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
  const handleUninstall = useCallback(() => {
    uninstallWidget(manifest.id);
    setContextMenu(null);
  }, [manifest.id, uninstallWidget]);

  // ── 刷新 ──
  const handleRefresh = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.src = iframe.src; // 重新加载
    }
    setContextMenu(null);
  }, []);

  if (!enabled) return null;

  const iframeSrc = getWidgetAssetUrl(manifest.id, manifest.entry);

  return (
    <div
      ref={containerRef}
      data-interactive
      className="widget-frame"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size.width,
        height: size.height,
        zIndex,
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
      }}
      onPointerDown={handlePointerDown}
      onContextMenu={handleContextMenu}
    >
      {/* 容器样式 */}
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 16,
          overflow: "hidden",
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)",
          border: "1px solid rgba(255,255,255,0.5)",
        }}
      >
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title={manifest.name}
          sandbox="allow-scripts allow-same-origin"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            pointerEvents: isDragging ? "none" : "auto",
          }}
        />
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
          <MenuItem label="刷新" onClick={handleRefresh} />
          <MenuItem label="设置" onClick={() => { setShowSettings(true); setContextMenu(null); }} />
          <MenuDivider />
          <MenuItem label="尺寸 S" onClick={() => handleSizePreset("S")} />
          <MenuItem label="尺寸 M" onClick={() => handleSizePreset("M")} />
          <MenuItem label="尺寸 L" onClick={() => handleSizePreset("L")} />
          <MenuDivider />
          <MenuItem label="移除小组件" onClick={handleUninstall} danger />
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
    <div
      className="widget-control"
      onClick={onClick}
      style={{
        padding: "6px 16px",
        cursor: "pointer",
        color: danger ? "#ef4444" : "#1a1a1a",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) =>
        ((e.target as HTMLElement).style.background = "rgba(0,0,0,0.05)")
      }
      onMouseLeave={(e) =>
        ((e.target as HTMLElement).style.background = "transparent")
      }
    >
      {label}
    </div>
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
