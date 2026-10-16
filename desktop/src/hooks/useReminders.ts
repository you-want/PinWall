import { useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { PinCardData } from "../types";
import { useNotificationStore } from "../stores/notificationStore";
import { showNotificationWindow } from "../services/notificationWindow";
import { reminderScheduler } from "../services/reminderScheduler";

export function useReminders(cards: PinCardData[], onReminderFired: (cardId: string) => void) {
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  const showCardNotificationWindow = useCallback(() => showNotificationWindow(), []);

  useEffect(() => {
    return reminderScheduler.subscribe(async (now) => {
      const dueCard = cardsRef.current.find((c) => {
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
        onReminderFired(dueCard.id);
        useNotificationStore.getState().showNotification(dueCard);
        await showCardNotificationWindow();
      }
    }, 1000);
  }, [onReminderFired, showCardNotificationWindow]);

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
