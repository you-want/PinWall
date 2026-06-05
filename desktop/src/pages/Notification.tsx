import React from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { webviewWindow } from "@tauri-apps/api";
import type { PinCardData } from "../types";

const STORAGE_KEY = "pinwall_cards";

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

function loadCardFromStorage(cardId: string): PinCardData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const cards = JSON.parse(stored) as PinCardData[];
      return cards.find((c) => c.id === cardId) || null;
    }
  } catch {
    // ignore
  }
  return null;
}

function Notification() {
  const [card, setCard] = React.useState<PinCardData | null>(null);
  const [exiting, setExiting] = React.useState(false);
  const soundPlayed = React.useRef(false);

  // Listen for card data from main window
  React.useEffect(() => {
    // Register listener first, then signal ready
    const setup = async () => {
      const unlisten = await listen<{ cardId: string }>("notification:show-card", (event) => {
        const cardId = event.payload.cardId;
        const loaded = loadCardFromStorage(cardId);
        if (loaded) {
          setCard(loaded);
          setExiting(false);
        }
      });
      // Signal that listener is ready
      await emit("notification:ready");
      return unlisten;
    };
    let unlistenFn: (() => void) | null = null;
    setup().then((fn) => { unlistenFn = fn; });
    return () => {
      unlistenFn?.();
    };
  }, []);

  // Play sound when card changes
  React.useEffect(() => {
    if (card) {
      soundPlayed.current = false;
      playDingSound();
      soundPlayed.current = true;

      // Auto-dismiss after 15 seconds
      const timer = setTimeout(() => {
        handleDismiss();
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [card?.id]);

  const handleDismiss = async () => {
    setExiting(true);
    setTimeout(async () => {
      try {
        const win = webviewWindow.getCurrentWebviewWindow();
        await win.hide();
      } catch {
        // fallback
        window.close();
      }
    }, 300);
  };

  const handleView = async () => {
    if (!card) return;
    setExiting(true);
    setTimeout(async () => {
      try {
        // Tell the main window to fullscreen this card
        await emit("notification:view-card", { cardId: card.id });
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
    <div
      className={`reminder-notification ${exiting ? "exiting" : ""}`}
      style={{
        background: getGradient(card.colorIndex),
        width: "100vw",
        height: "100vh",
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

export default Notification;
