import { useEffect, useRef, useState } from "react";
import type { PinCardData } from "../types";

interface ReminderNotificationProps {
  card: PinCardData;
  onView: () => void;
  onDismiss: () => void;
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

function playDingSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    gain1.gain.setValueAtTime(0.4, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.6);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1320, ctx.currentTime);
    gain2.gain.setValueAtTime(0.2, ctx.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime);
    osc2.stop(ctx.currentTime + 0.4);

    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Silently ignore audio errors
  }
}

export function ReminderNotification({ card, onView, onDismiss }: ReminderNotificationProps) {
  const [exiting, setExiting] = useState(false);
  const soundPlayed = useRef(false);

  useEffect(() => {
    if (!soundPlayed.current) {
      soundPlayed.current = true;
      playDingSound();
      document.addEventListener("click", () => {
        playDingSound();
      }, { once: true });
    }
  }, []);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExiting(true);
    setTimeout(onDismiss, 300);
  };

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExiting(true);
    setTimeout(onView, 300);
  };

  return (
    <div
      data-interactive="true"
      className={`reminder-notification ${exiting ? "exiting" : ""}`}
      style={{
        background: getGradient(card.colorIndex),
      }}
    >
      <div className="reminder-notification-header">
        <div className="window-controls">
          <button
            className="control close"
            type="button"
            aria-label="关闭提醒"
            onClick={handleDismiss}
          />
        </div>
        <div className="card-title">{card.title}</div>
        <span className="reminder-badge">🔔</span>
      </div>
      <div className="card-body">
        {card.content.length > 80
          ? card.content.slice(0, 80) + "..."
          : card.content}
      </div>
      <div className="reminder-notification-actions">
        <button className="btn-reminder btn-reminder-view" onClick={handleView}>
          全屏查看
        </button>
      </div>
    </div>
  );
}
