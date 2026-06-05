import { create } from "zustand";
import { createTauriStore } from "@tauri-store/zustand";
import type { PinCardData } from "../types";

type NotificationState = {
  notificationCard: PinCardData | null;
  viewCardId: string | null;
  showNotification: (card: PinCardData) => void;
  dismissNotification: () => void;
  viewCard: (cardId: string) => void;
  clearViewCard: () => void;
};

export const useNotificationStore = create<NotificationState>((set) => ({
  notificationCard: null,
  viewCardId: null,
  showNotification: (card) => set({ notificationCard: card }),
  dismissNotification: () => set({ notificationCard: null }),
  viewCard: (cardId) => set({ viewCardId: cardId }),
  clearViewCard: () => set({ viewCardId: null }),
}));

export const tauriHandler = createTauriStore("notification", useNotificationStore, {
  autoStart: true,
});
