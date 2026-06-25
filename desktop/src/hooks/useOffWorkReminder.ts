import { useEffect, useRef } from "react";
import { getSettings } from "../services/storage";
import { useCardStore } from "../stores/cardStore";
import { useLanguageStore } from "../stores/languageStore";
import { getToneMessage, offWorkReminder, overtimeCare } from "../data/careTones";
import type { CareTone } from "../types";

/**
 * Checks the current time against the user's configured off-work time.
 * Shows a caring reminder card when it's time to stop working.
 * If the user keeps working past off-work time, shows overtime care every 30min.
 */
export function useOffWorkReminder() {
  const firedTodayRef = useRef("");
  const overtimeCountRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const settings = await getSettings();
        if (!settings.offWorkReminderEnabled) return;

        const offWorkTime = settings.offWorkTime ?? "18:00";
        const [offH, offM] = offWorkTime.split(":").map(Number);
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const offMinutes = offH * 60 + offM;

        // Not yet off-work time
        if (nowMinutes < offMinutes) {
          // Reset if it's a new day
          if (firedTodayRef.current !== today) {
            firedTodayRef.current = "";
            overtimeCountRef.current = 0;
          }
          return;
        }

        // Already fired the initial reminder today
        if (firedTodayRef.current === today) {
          // Overtime care: every 30 min after off-work time
          const overtimeMinutes = nowMinutes - offMinutes;
          const expectedFires = Math.floor(overtimeMinutes / 30);
          if (expectedFires > overtimeCountRef.current) {
            overtimeCountRef.current = expectedFires;
            const tone = (settings.careTone ?? "warm") as CareTone;
            const lang = useLanguageStore.getState().lang;
            const msg = getToneMessage(overtimeCare, tone);
            const title = lang === "zh" ? "🌙 加班关怀" : "🌙 Overtime Care";
            const x = 120 + Math.floor(Math.random() * 150);
            const y = 120 + Math.floor(Math.random() * 100);
            useCardStore.getState().upsertSystemCard({
              kind: "overtime",
              title,
              content: msg,
              colorIndex: 5,
              x,
              y,
            });
          }
          return;
        }

        // Fire the initial off-work reminder
        firedTodayRef.current = today;
        overtimeCountRef.current = 0;
        const tone = (settings.careTone ?? "warm") as CareTone;
        const lang = useLanguageStore.getState().lang;
        const msg = getToneMessage(offWorkReminder, tone);
        const title = lang === "zh" ? "🏠 下班啦" : "🏠 Time to Go Home";
        useCardStore.getState().upsertSystemCard({
          kind: "off-work",
          title,
          content: msg,
          colorIndex: 4,
          x: 150,
          y: 150,
        });
      } catch (err) {
        console.error("[useOffWorkReminder] error:", err);
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, []);
}
