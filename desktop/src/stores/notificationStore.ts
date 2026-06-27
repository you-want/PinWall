import { create } from "zustand";
import { createTauriStore } from "@tauri-store/zustand";
import type { PinCardData, ReminderNotification } from "../types";

type NotificationState = {
  notificationCard: PinCardData | null;
  notification: ReminderNotification | null;
  viewCardId: string | null;
  showNotification: (card: PinCardData) => void;
  showSystemNotification: (notification: Omit<ReminderNotification, "source">) => void;
  dismissNotification: () => void;
  viewCard: (cardId: string) => void;
  clearViewCard: () => void;
};

export const useNotificationStore = create<NotificationState>((set) => ({
  notificationCard: null,
  notification: null,
  viewCardId: null,
  showNotification: (card) => set({
    notificationCard: card,
    notification: {
      id: `card-${card.id}`,
      title: card.title,
      content: card.content,
      colorIndex: card.colorIndex,
      lifecycle: "card",
      source: "card",
      cardId: card.id,
      canView: true,
    },
  }),
  showSystemNotification: (notification) => set({
    notificationCard: null,
    notification: {
      ...notification,
      source: "system",
      canView: notification.canView ?? false,
    },
  }),
  dismissNotification: () => set({ notificationCard: null, notification: null }),
  viewCard: (cardId) => set({ viewCardId: cardId }),
  clearViewCard: () => set({ viewCardId: null }),
}));

export const tauriHandler = createTauriStore("notification", useNotificationStore, {
  autoStart: true,
});
