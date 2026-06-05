import { useEffect, useCallback, useRef } from "react";
import { webviewWindow } from "@tauri-apps/api";
import { invoke } from "@tauri-apps/api/core";

import type { PinCardData } from "../types";
import { useNotificationStore } from "../stores/notificationStore";

export function useReminders(cards: PinCardData[], onReminderFired: (cardId: string) => void) {
  const pendingNotificationRef = useRef<string | null>(null);

  const showNotificationWindow = useCallback(async () => {
    try {
      const notifWin = await webviewWindow.WebviewWindow.getByLabel("notification");
      if (!notifWin) return;
      const screenW = window.screen?.width ?? 1920;
      const scaleFactor = window.devicePixelRatio || 1;
      const x = Math.round((screenW - 300) * scaleFactor);
      const y = Math.round(40 * scaleFactor);
      await notifWin.setPosition({ x, y, type: "Physical" } as any);
      await notifWin.show();
      await notifWin.setFocus();
    } catch (err) {
      console.error("Failed to show notification window:", err);
    }
  }, []);

  // Process pending notifications
  useEffect(() => {
    const interval = setInterval(() => {
      const cardId = pendingNotificationRef.current;
      if (cardId) {
        pendingNotificationRef.current = null;
        const card = cards.find((c) => c.id === cardId);
        if (card) {
          useNotificationStore.getState().showNotification(card);
          showNotificationWindow();
        }
      }
    }, 200);
    return () => clearInterval(interval);
  }, [cards, showNotificationWindow]);

  // Check for due reminders every second
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

  // Watch for viewCardId from notification window
  useEffect(() => {
    const unsubscribe = useNotificationStore.subscribe((state) => {
      if (state.viewCardId) {
        const cardId = state.viewCardId;
        useNotificationStore.getState().clearViewCard();
        invoke("summon_main").catch(() => {});
        window.dispatchEvent(new CustomEvent("pinwall:fullscreen-card", { detail: cardId }));
      }
    });
    return unsubscribe;
  }, []);
}
