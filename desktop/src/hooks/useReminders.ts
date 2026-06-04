import { useEffect, useCallback, useRef } from "react";
import { webviewWindow } from "@tauri-apps/api";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

import type { PinCardData } from "../types";

export function useReminders(cards: PinCardData[], onReminderFired: (cardId: string) => void) {
  const pendingNotificationRef = useRef<string | null>(null);

  const showNotificationWindow = useCallback(async (cardId: string) => {
    try {
      const notifWin = await webviewWindow.WebviewWindow.getByLabel("notification");
      if (!notifWin) return;
      const screenW = window.screen?.width ?? 1920;
      const scaleFactor = window.devicePixelRatio || 1;
      const x = Math.round((screenW - 280) * scaleFactor);
      const y = Math.round(40 * scaleFactor);
      await notifWin.setPosition({ x, y, type: "Physical" } as any);
      await notifWin.show();
      await notifWin.setFocus();
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 2000);
        listen("notification:ready", () => {
          clearTimeout(timeout);
          resolve();
        }).then(() => {});
      });
      await emit("notification:show-card", { cardId });
    } catch (err) {
      console.error("Failed to show notification window:", err);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const cardId = pendingNotificationRef.current;
      if (cardId) {
        pendingNotificationRef.current = null;
        showNotificationWindow(cardId);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [showNotificationWindow]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const dueCard = cards.find(
        (c) => c.reminderEnabled && !c.reminderFired && c.reminderTime !== null && c.reminderTime <= now
      );
      if (dueCard) {
        pendingNotificationRef.current = dueCard.id;
        onReminderFired(dueCard.id);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [cards, onReminderFired]);

  useEffect(() => {
    const unlisten = listen<{ cardId: string }>("notification:view-card", (event) => {
      const cardId = event.payload.cardId;
      invoke("summon_main").catch(() => {});
      window.dispatchEvent(new CustomEvent("pinwall:fullscreen-card", { detail: cardId }));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
