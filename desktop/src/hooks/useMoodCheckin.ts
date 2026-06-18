import { useEffect, useRef } from "react";
import { getSettings } from "../services/storage";
import { useMoodStore } from "../stores/moodStore";
import { useCardStore } from "../stores/cardStore";
import { useLanguageStore } from "../stores/languageStore";
import { getToneMessage, moodCheckinPrompt } from "../data/careTones";
import type { CareTone } from "../types";

/**
 * Checks at configured mood check-in times and creates a mood prompt card
 * if the user hasn't checked in yet for this time slot.
 */
export function useMoodCheckin() {
  const lastPromptRef = useRef("");

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const settings = await getSettings();
        if (!settings.moodCheckinEnabled) return;

        const times = settings.moodCheckinTimes ?? ["10:00", "18:00"];
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        for (const timeStr of times) {
          const [h, m] = timeStr.split(":").map(Number);
          const targetMinutes = h * 60 + m;
          const slotKey = `${today}-${timeStr}`;

          // Within 30 min window of the target time
          if (nowMinutes >= targetMinutes && nowMinutes < targetMinutes + 30) {
            // Already prompted for this slot
            if (lastPromptRef.current === slotKey) continue;

            // Check if already checked in for this slot
            const todayEntries = useMoodStore.getState().getTodayEntries();
            const alreadyCheckedIn = todayEntries.some((e) => {
              const [eh] = e.time.split(":").map(Number);
              const entryMin = eh * 60 + (parseInt(e.time.split(":")[1]) || 0);
              return Math.abs(entryMin - targetMinutes) < 60;
            });
            if (alreadyCheckedIn) continue;

            lastPromptRef.current = slotKey;
            const tone = (settings.careTone ?? "warm") as CareTone;
            const lang = useLanguageStore.getState().lang;
            const msg = getToneMessage(moodCheckinPrompt, tone);
            const title = lang === "zh" ? "😊 心情打卡" : "😊 Mood Check-in";

            const x = window.innerWidth / 2 - 110;
            const y = window.innerHeight / 2 - 70;
            useCardStore.getState().createCard(title, msg, 6, "mood", false, null, x, y);
          }
        }
      } catch (err) {
        console.error("[useMoodCheckin] error:", err);
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, []);
}
