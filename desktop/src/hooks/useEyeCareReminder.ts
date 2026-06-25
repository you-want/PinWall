import { useEffect, useRef } from "react";
import { getSettings } from "../services/storage";
import { useCardStore } from "../stores/cardStore";
import { useLanguageStore } from "../stores/languageStore";
import { getToneMessage, eyeCareReminder } from "../data/careTones";
import type { CareTone } from "../types";

/**
 * Lightweight eye care reminder based on the 20-20-20 rule.
 * Creates a small, temporary card every configured interval.
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

          // Create at a corner position, less intrusive
          const x = window.innerWidth - 300;
          const y = 60;
          useCardStore.getState().upsertSystemCard({
            kind: "eye-care",
            title,
            content: msg,
            colorIndex: 5,
            x,
            y,
          });
        }
      } catch (err) {
        console.error("[useEyeCareReminder] error:", err);
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, []);
}
