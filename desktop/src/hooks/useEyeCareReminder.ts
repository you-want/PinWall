import { useEffect, useRef } from "react";
import { getSettings } from "../services/storage";
import { useLanguageStore } from "../stores/languageStore";
import { getToneMessage, eyeCareReminder } from "../data/careTones";
import type { CareTone } from "../types";
import { showSystemReminder } from "../services/systemReminderService";

/**
 * Lightweight eye care reminder based on the 20-20-20 rule.
 * Shows a lightweight notification every configured interval.
 * Less intrusive than rest reminders — designed to not break flow.
 */
export function useEyeCareReminder() {
  const lastFiredRef = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const settings = await getSettings();
        if (!settings.eyeCareEnabled) return;

        const intervalMin = settings.eyeCareInterval ?? 20;
        const intervalMs = intervalMin * 60_000;
        const now = Date.now();

        if (now - lastFiredRef.current >= intervalMs) {
          lastFiredRef.current = now;

          const tone = (settings.careTone ?? "warm") as CareTone;
          const lang = useLanguageStore.getState().lang;
          const msg = getToneMessage(eyeCareReminder, tone);
          const title = lang === "zh" ? "👁️ 护眼时间" : "👁️ Eye Break";
          await showSystemReminder({
            kind: "eye-care",
            occurrenceKey: `eye-care-${Math.floor(now / intervalMs)}`,
            title,
            content: msg,
            colorIndex: 5,
            lifecycle: "recurring",
            nextDueAt: now + intervalMs,
          });
        }
      } catch (err) {
        console.error("[useEyeCareReminder] error:", err);
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, []);
}
