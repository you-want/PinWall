import { create } from "zustand";
import { createTauriStore } from "@tauri-store/zustand";

export interface MoodEntry {
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM
  mood: number;       // 1-5
  note?: string;      // AI response or user note
}

type MoodState = {
  entries: MoodEntry[];
  addEntry: (entry: MoodEntry) => void;
  getTodayEntries: () => MoodEntry[];
  getRecentEntries: (days: number) => MoodEntry[];
};

export const useMoodStore = create<MoodState>((set, get) => ({
  entries: [],

  addEntry: (entry) => {
    set((s) => ({ entries: [...s.entries, entry] }));
  },

  getTodayEntries: () => {
    const today = new Date().toISOString().slice(0, 10);
    return get().entries.filter((e) => e.date === today);
  },

  getRecentEntries: (days) => {
    const cutoff = Date.now() - days * 86400_000;
    return get().entries.filter((e) => {
      const ts = new Date(e.date).getTime();
      return ts >= cutoff;
    });
  },
}));

export const moodTauriHandler = createTauriStore("mood", useMoodStore, {
  autoStart: true,
  saveOnChange: true,
});
