import { useEffect, useRef } from "react";
import { getSettings } from "../services/storage";
import { useCardStore } from "../stores/cardStore";
import { useLanguageStore } from "../stores/languageStore";
import { getToneMessage, restReminder } from "../data/careTones";
import type { CareTone } from "../types";

/**
 * Tracks how long the app has been running and periodically
 * creates a rest suggestion card using the configured care tone.
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

          const x = 100 + Math.floor(Math.random() * 200);
          const y = 100 + Math.floor(Math.random() * 150);
          const colorIndex = Math.floor(Math.random() * 8);

          useCardStore.getState().createCard(title, msg, colorIndex, "note", false, null, x, y);
        }
      } catch (err) {
        console.error("[useRestReminder] error:", err);
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, []);
}
