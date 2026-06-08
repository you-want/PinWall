import { useRef, useEffect } from "react";
import { webviewWindow } from "@tauri-apps/api";
import { useNotificationStore } from "../stores/notificationStore";
import { useI18n } from "../i18n";

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

function Notification() {
  const { t } = useI18n();
  const card = useNotificationStore((s) => s.notificationCard);
  const dismissNotification = useNotificationStore((s) => s.dismissNotification);
  const viewCardAction = useNotificationStore((s) => s.viewCard);
  const exitingRef = useRef(false);

  // Play sound when card changes
  useEffect(() => {
    if (card) {
      playDingSound();
      exitingRef.current = false;

      // Auto-dismiss after 15 seconds
      const timer = setTimeout(() => {
        handleDismiss();
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [card?.id]);

  const handleDismiss = async () => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setTimeout(async () => {
      dismissNotification();
      try {
        const win = webviewWindow.getCurrentWebviewWindow();
        await win.hide();
      } catch {
        window.close();
      }
    }, 300);
  };

  const handleView = async () => {
    if (!card) return;
    if (exitingRef.current) return;
    exitingRef.current = true;
    setTimeout(async () => {
      viewCardAction(card.id);
      try {
        const win = webviewWindow.getCurrentWebviewWindow();
        await win.hide();
      } catch {
        window.close();
      }
    }, 300);
  };

  if (!card) {
    return null;
  }

  return (
    <div className="reminder-notification">
      <div
        className="reminder-notification-inner"
        style={{ background: getGradient(card.colorIndex) }}
      >
        <div className="reminder-notification-header">
          <div className="window-controls">
            <button
              className="control close"
              type="button"
              aria-label={t.aria_dismiss_reminder}
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
            {t.view_fullscreen}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Notification;
