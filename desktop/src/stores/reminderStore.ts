import { create } from "zustand";
import { createTauriStore } from "@tauri-store/zustand";
import type { SystemReminderKind } from "../types";

export interface SystemReminderRecord {
  lastShownKey?: string;
  lastCompletedKey?: string;
  nextDueAt?: number;
  updatedAt: number;
}

type ReminderState = {
  systemReminders: Partial<Record<SystemReminderKind, SystemReminderRecord>>;
  markSystemReminderShown: (
    kind: SystemReminderKind,
    occurrenceKey: string,
    nextDueAt?: number,
  ) => void;
  confirmSystemReminder: (
    kind: SystemReminderKind,
    occurrenceKey: string,
    nextDueAt?: number,
  ) => void;
  shouldShowSystemReminder: (
    kind: SystemReminderKind,
    occurrenceKey: string,
    now?: number,
  ) => boolean;
  getNextDueAt: (kind: SystemReminderKind) => number | undefined;
  resetReminderRuntime: () => void;
};

export const useReminderStore = create<ReminderState>((set, get) => ({
  systemReminders: {},

  markSystemReminderShown: (kind, occurrenceKey, nextDueAt) => {
    set((state) => ({
      systemReminders: {
        ...state.systemReminders,
        [kind]: {
          ...state.systemReminders[kind],
          lastShownKey: occurrenceKey,
          nextDueAt,
          updatedAt: Date.now(),
        },
      },
    }));
  },

  confirmSystemReminder: (kind, occurrenceKey, nextDueAt) => {
    set((state) => ({
      systemReminders: {
        ...state.systemReminders,
        [kind]: {
          ...state.systemReminders[kind],
          lastShownKey: occurrenceKey,
          lastCompletedKey: occurrenceKey,
          nextDueAt,
          updatedAt: Date.now(),
        },
      },
    }));
  },

  shouldShowSystemReminder: (kind, occurrenceKey, now = Date.now()) => {
    const record = get().systemReminders[kind];
    if (record?.lastShownKey === occurrenceKey) return false;
    if (record?.lastCompletedKey === occurrenceKey) return false;
    if (record?.nextDueAt !== undefined && record.nextDueAt > now) return false;
    return true;
  },

  getNextDueAt: (kind) => get().systemReminders[kind]?.nextDueAt,

  resetReminderRuntime: () => {
    set({ systemReminders: {} });
  },
}));

export const tauriHandler = createTauriStore("reminders", useReminderStore, {
  autoStart: true,
  saveOnChange: true,
});

