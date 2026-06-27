import { useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { PinCardData } from "../types";
import { useNotificationStore } from "../stores/notificationStore";
import { showNotificationWindow } from "../services/notificationWindow";

export function useReminders(cards: PinCardData[], onReminderFired: (cardId: string) => void) {
  const pendingNotificationRef = useRef<string | null>(null);

  const showCardNotificationWindow = useCallback(() => showNotificationWindow(), []);

  // Process pending notifications
  useEffect(() => {
    const interval = setInterval(() => {
      const cardId = pendingNotificationRef.current;
      if (cardId) {
        pendingNotificationRef.current = null;
        const card = cards.find((c) => c.id === cardId);
        if (card) {
          useNotificationStore.getState().showNotification(card);
          showCardNotificationWindow();
        }
      }
    }, 200);
    return () => clearInterval(interval);
  }, [cards, showCardNotificationWindow]);

  // Check for due reminders every second
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const dueCard = cards.find((c) => {
        if (!c.reminderEnabled || c.reminderFired || c.reminderTime === null || c.reminderTime > now) {
          return false;
        }
        // daily-checkin 类型：仅在未打卡时触发
        if (c.cardType === "daily-checkin") {
          return !c.checkinDone;
        }
        // 其他类型（reminder）：正常触发
        return true;
      });
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
