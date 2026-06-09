import React, { useState, useRef, useCallback } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../i18n";
import { getSettings } from "../services/storage";
import { polishContent, condenseContent } from "../services/aiService";
import { useCardStore } from "../stores/cardStore";
import type { PinCardData } from "../types";

interface PinCardProps {
  card: PinCardData;
  onPositionChange: (id: string, x: number, y: number) => void;
  onBringToFront: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onDragEnd: (id: string) => void;
  zIndex: number;
}

const colors = [
  "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
  "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)",
  "linear-gradient(135deg, #fdcbf1 0%, #e6dee9 100%)",
  "linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)",
  "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
  "linear-gradient(135deg, #cfd9df 0%, #e2ebf0 100%)",
  "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
];

function getGradient(index: number): string {
  return colors[index % colors.length];
}

export function PinCard({
  card,
  onPositionChange,
  onBringToFront,
  // onToggleCollapse,
  onClose,
  // onMinimize,
  onDragEnd,
  zIndex,
}: PinCardProps) {
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [aiLoading, setAiLoading] = useState<"polish" | "condense" | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest(".control")) {
        e.stopPropagation();
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      onBringToFront(card.id);

      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        dragOffsetRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      }

      setIsDragging(true);
    },
    [card.id, onBringToFront]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDragging || !cardRef.current) return;

      const newX = Math.max(0, e.clientX - dragOffsetRef.current.x);
      const newY = Math.max(0, e.clientY - dragOffsetRef.current.y);

      onPositionChange(card.id, newX, newY);
    },
    [isDragging, card.id, onPositionChange]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    onDragEnd(card.id);
  }, [card.id, onDragEnd]);

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener("pointermove", handlePointerMove, true);
      document.addEventListener("pointerup", handlePointerUp, true);
      document.addEventListener("pointercancel", handlePointerUp, true);
    }

    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", handlePointerUp, true);
    };
  }, [isDragging, handlePointerMove, handlePointerUp]);

  // Listen for fullscreen event from notification
  React.useEffect(() => {
    const handleFullscreenEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === card.id) {
        setIsFullscreen(true);
      }
    };
    window.addEventListener("pinwall:fullscreen-card", handleFullscreenEvent);
    return () => window.removeEventListener("pinwall:fullscreen-card", handleFullscreenEvent);
  }, [card.id]);

  const handleControlClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const target = e.target as HTMLElement;
      const control = target.closest(".control");

      if (control?.classList.contains("close")) {
        let confirmed = false;
        try {
          confirmed = await confirm(t.confirm_delete_msg, {
            title: t.confirm_delete_title,
            kind: "warning",
            okLabel: t.btn_delete,
            cancelLabel: t.btn_cancel,
          });
        } catch {
          // Fallback to native browser confirm if Tauri dialog fails
          confirmed = window.confirm(t.confirm_delete_msg);
        }
        if (confirmed) {
          onClose(card.id);
        }
      } else if (control?.classList.contains("minimize")) {
        setIsFullscreen(false);
      } else if (control?.classList.contains("maximize")) {
        setIsFullscreen(true);
      }
    },
    [card.id, onClose]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    []
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Close context menu when clicking elsewhere
  React.useEffect(() => {
    if (contextMenu) {
      const handler = () => closeContextMenu();
      window.addEventListener("click", handler);
      return () => window.removeEventListener("click", handler);
    }
  }, [contextMenu, closeContextMenu]);

  const handleAIPolish = useCallback(async () => {
    closeContextMenu();
    if (aiLoading || !card.content) return;
    setAiLoading("polish");
    try {
      const settings = await getSettings();
      if (!settings.ai?.enabled || !settings.ai.apiKey) return;
      const lang = (navigator.language.startsWith("zh") ? "zh" : "en") as "zh" | "en";
      const polished = await polishContent(settings.ai, card.content, lang);
      useCardStore.getState().updateContent(card.id, polished);
    } catch (err) {
      console.error("[PinCard] AI polish error:", err);
    } finally {
      setAiLoading(null);
    }
  }, [aiLoading, card.id, card.content, closeContextMenu]);

  const handleAICondense = useCallback(async () => {
    closeContextMenu();
    if (aiLoading || !card.content) return;
    setAiLoading("condense");
    try {
      const settings = await getSettings();
      if (!settings.ai?.enabled || !settings.ai.apiKey) return;
      const lang = (navigator.language.startsWith("zh") ? "zh" : "en") as "zh" | "en";
      const condensed = await condenseContent(settings.ai, card.content, lang);
      useCardStore.getState().updateContent(card.id, condensed);
    } catch (err) {
      console.error("[PinCard] AI condense error:", err);
    } finally {
      setAiLoading(null);
    }
  }, [aiLoading, card.id, card.content, closeContextMenu]);

  return (
    <div
      ref={cardRef}
      data-interactive="true"
      className={`pin-card ${isDragging ? "dragging" : ""} ${card.collapsed ? "collapsed" : ""} ${isFullscreen ? "fullscreen" : ""}`}
      style={{
        left: isFullscreen ? 0 : card.x,
        top: isFullscreen ? 0 : card.y,
        width: isFullscreen ? "100%" : undefined,
        height: isFullscreen ? "100%" : undefined,
        zIndex: isFullscreen ? 9999 : zIndex,
        background: getGradient(card.colorIndex),
      }}
      onContextMenu={handleContextMenu}
    >
      <div className="card-header" onPointerDown={handlePointerDown}>
        <div className="window-controls" onClick={handleControlClick}>
          <button className="control close" type="button" aria-label={t.aria_close} />
          <button
            className={`control minimize ${isFullscreen ? "" : "disabled"}`}
            type="button"
            aria-label={t.aria_minimize}
            disabled={!isFullscreen}
          />
          <button
            className={`control maximize ${isFullscreen ? "disabled" : ""}`}
            type="button"
            aria-label={t.aria_maximize}
            disabled={isFullscreen}
          />
        </div>
        <div className={`card-title ${isDragging ? "dragging" : ""}`}>{card.title}</div>
      </div>

      {(!card.collapsed || isFullscreen) && (
        <div
          className="card-body"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
        >
          {aiLoading ? (
            <span className="ai-loading-inline">
              <span className="btn-spinner" />
              {aiLoading === "polish" ? t.ai_polishing : t.ai_condensing}
            </span>
          ) : card.content}
        </div>
      )}

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="menu-item" onClick={handleAIPolish} disabled={!!aiLoading}>
            <span className="menu-label">✨ {t.ai_polish}</span>
          </button>
          <button className="menu-item" onClick={handleAICondense} disabled={!!aiLoading}>
            <span className="menu-label">📝 {t.ai_condense}</span>
          </button>
        </div>
      )}
    </div>
  );
}
