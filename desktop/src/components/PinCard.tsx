import React, { useState, useRef, useCallback } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { PinCardData } from "../types";

interface PinCardProps {
  card: PinCardData;
  onPositionChange: (id: string, x: number, y: number) => void;
  onBringToFront: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
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
  zIndex,
}: PinCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
  }, []);

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
          confirmed = await confirm("确定要删除这个便签吗？", {
            title: "确认删除",
            kind: "warning",
            okLabel: "删除",
            cancelLabel: "取消",
          });
        } catch {
          // Fallback to native browser confirm if Tauri dialog fails
          confirmed = window.confirm("确定要删除这个便签吗？");
        }
        if (confirmed) {
          onClose(card.id);
        }
      } else if (control?.classList.contains("minimize")) {
        setIsFullscreen(false);
      } else if (control?.classList.contains("collapse")) {
        setIsFullscreen(true);
      }
    },
    [card.id, onClose]
  );

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

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
      onClick={handleControlClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
    >
      <div className={`pin-card-header`} onPointerDown={handlePointerDown}>
        <div className="window-controls">
          <button className="control close" type="button" aria-label="关闭" />
          <button
            className={`control minimize ${isFullscreen ? "" : "disabled"}`}
            type="button"
            aria-label="缩小"
            disabled={!isFullscreen}
          />
          <button
            className={`control collapse ${isFullscreen ? "disabled" : ""}`}
            type="button"
            aria-label="全屏"
            disabled={isFullscreen}
          />
        </div>
        <div className={`pin-card-title ${isDragging ? "dragging" : ""}`}>{card.title}</div>
      </div>

      {!card.collapsed && !isFullscreen && <div className="pin-card-body">{card.content}</div>}
      {isFullscreen && <div className="pin-card-body">{card.content}</div>}
    </div>
  );
}
