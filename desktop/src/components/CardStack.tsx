import { useState, useCallback, useRef, useEffect } from "react";
import { useI18n, interpolate } from "../i18n";
import type { PinCardData } from "../types";

interface CardStackProps {
  stashedCards: PinCardData[];
  onUnstash: (id: string) => void;
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

export function CardStack({ stashedCards, onUnstash }: CardStackProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    if (!expanded) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };

    // Use setTimeout to avoid the current click triggering close
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [expanded]);

  const handleUnstash = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onUnstash(id);
    },
    [onUnstash]
  );

  const previewCount = Math.min(stashedCards.length, 3);
  const previewCards = stashedCards.slice(0, previewCount);

  if (stashedCards.length === 0) return null;

  return (
    <div className="card-stack" ref={panelRef} data-interactive="true">
      {/* Expanded panel */}
      {expanded && (
        <div className="card-stack-panel">
          <div className="card-stack-panel-header">
            <span className="card-stack-panel-title">
              {interpolate(t.stashed_notes, { n: stashedCards.length })}
            </span>
            <button
              className="card-stack-panel-close"
              onClick={toggleExpanded}
              type="button"
              aria-label={t.aria_collapse}
            >
              ×
            </button>
          </div>
          <div className="card-stack-panel-list">
            {stashedCards.map((card) => (
              <div key={card.id} className="card-stack-item">
                <div
                  className="card-stack-item-color"
                  style={{ background: getGradient(card.colorIndex) }}
                />
                <div className="card-stack-item-info">
                  <div className="card-stack-item-title">{card.title}</div>
                  <div className="card-stack-item-content">
                    {card.content}
                  </div>
                </div>
                <button
                  className="card-stack-item-pin"
                  onClick={(e) => handleUnstash(card.id, e)}
                  type="button"
                  aria-label={t.pin_back}
                  title={t.pin_back}
                >
                  📌
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stack preview (always visible) */}
      <div className="card-stack-preview" onClick={toggleExpanded}>
        {previewCards.map((card, index) => (
          <div
            key={card.id}
            className="card-stack-preview-card"
            style={{
              background: getGradient(card.colorIndex),
              transform: `rotate(${(index - 1) * 4}deg) translate(${index * 4}px, ${-index * 3}px)`,
              zIndex: previewCount - index,
            }}
          >
            <div className="card-stack-preview-card-title">{card.title}</div>
          </div>
        ))}
        <div className="card-stack-badge">+{stashedCards.length}</div>
      </div>
    </div>
  );
}
