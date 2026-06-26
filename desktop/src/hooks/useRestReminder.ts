import { useEffect, useRef } from "react";
import { getSettings } from "../services/storage";
import { useLanguageStore } from "../stores/languageStore";
import { getToneMessage, restReminder } from "../data/careTones";
import type { CareTone } from "../types";
import { showSystemReminder } from "../services/systemReminderService";

/**
 * Tracks how long the app has been running and periodically
 * shows a rest suggestion notification using the configured care tone.
 */
export function useRestReminder() {
  const startTimeRef = useRef(Date.now());
  const lastFiredRef = useRef(0);

  useEffect(() => {
    // Check every minute
    const interval = setInterval(async () => {
      try {
        const settings = await getSettings();
        if (!settings.restReminderEnabled) return;

        const intervalMin = settings.restInterval ?? 90;
        const intervalMs = intervalMin * 60_000;
        const elapsed = Date.now() - startTimeRef.current;
        const sinceLastFire = Date.now() - lastFiredRef.current;

        if (elapsed >= intervalMs && sinceLastFire >= intervalMs) {
          lastFiredRef.current = Date.now();

          const tone = (settings.careTone ?? "warm") as CareTone;
          const lang = useLanguageStore.getState().lang;
          const msg = getToneMessage(restReminder, tone);
          const title = lang === "zh" ? "🧘 休息时间" : "🧘 Break Time";
          const colorIndex = Math.floor(Math.random() * 8);

          await showSystemReminder({
            kind: "rest",
            occurrenceKey: `rest-${Math.floor(Date.now() / intervalMs)}`,
            title,
            content: msg,
            colorIndex,
            lifecycle: "recurring",
            nextDueAt: Date.now() + intervalMs,
          });
        }
      } catch (err) {
        console.error("[useRestReminder] error:", err);
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, []);
}
