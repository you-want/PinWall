import { useEffect, useRef } from "react";
import { getSettings } from "../services/storage";
import { useLanguageStore } from "../stores/languageStore";
import { getToneMessage, offWorkReminder, overtimeCare } from "../data/careTones";
import type { CareTone } from "../types";
import { showSystemReminder } from "../services/systemReminderService";

/**
 * Checks the current time against the user's configured off-work time.
 * Shows a caring reminder notification when it's time to stop working.
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
            await showSystemReminder({
              kind: "overtime",
              occurrenceKey: `${today}-overtime-${expectedFires}`,
              title,
              content: msg,
              colorIndex: 5,
              lifecycle: "recurring",
              nextDueAt: Date.now() + 30 * 60_000,
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
        await showSystemReminder({
          kind: "off-work",
          occurrenceKey: `${today}-off-work`,
          title,
          content: msg,
          colorIndex: 4,
          lifecycle: "daily",
        });
      } catch (err) {
        console.error("[useOffWorkReminder] error:", err);
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, []);
}
