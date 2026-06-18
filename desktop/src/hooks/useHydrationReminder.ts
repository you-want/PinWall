import { useEffect, useRef } from "react";
import { getSettings } from "../services/storage";
import { useCardStore } from "../stores/cardStore";
import { useLanguageStore } from "../stores/languageStore";
import { getToneMessage, hydrationReminder, hydrationCelebration } from "../data/careTones";
import type { CareTone } from "../types";

/**
 * Periodically reminds the user to drink water if they have a hydration card
 * and haven't reached their daily goal yet.
 * Creates a hydration card automatically if none exists.
 */
export function useHydrationReminder() {
  const firedRef = useRef(false);
  const lastReminderRef = useRef(0);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    // Auto-create hydration card if none exists
    (async () => {
      try {
        const settings = await getSettings();
        const cards = useCardStore.getState().cards;
        const hasHydrationCard = cards.some((c) => c.cardType === "hydration");
        if (!hasHydrationCard) {
          const tone = (settings.careTone ?? "warm") as CareTone;
          const lang = useLanguageStore.getState().lang;
          const title = lang === "zh" ? "💧 喝水打卡" : "💧 Hydration Tracker";
          const msg = getToneMessage(hydrationReminder, tone);
          useCardStore.getState().createCard(
            title,
            msg,
            1, // blue gradient
            "hydration",
            false,
            null,
            window.innerWidth - 340,
            window.innerHeight - 300,
          );
        }
      } catch (err) {
        console.error("[useHydrationReminder] Failed to auto-create hydration card:", err);
      }
    })();

    // Check every 30 minutes if user needs a hydration reminder
    const interval = setInterval(async () => {
      try {
        const settings = await getSettings();
        const cards = useCardStore.getState().cards;
        const hydrationCard = cards.find((c) => c.cardType === "hydration");
        if (!hydrationCard) return;

        const goal = hydrationCard.hydrationGoal ?? settings.hydrationGoal ?? 8;
        const count = hydrationCard.hydrationCount ?? 0;
        const today = new Date().toISOString().slice(0, 10);

        // Reset if new day
        if (hydrationCard.hydrationDate !== today) return;

        // Already reached goal — celebrate once
        if (count >= goal) {
          const now = Date.now();
          if (now - lastReminderRef.current > 3600_000) {
            lastReminderRef.current = now;
            const tone = (settings.careTone ?? "warm") as CareTone;
            const msg = getToneMessage(hydrationCelebration, tone);
            useCardStore.getState().updateContent(hydrationCard.id, msg);
          }
          return;
        }

        // Remind every 60 min if not at goal
        const now = Date.now();
        if (now - lastReminderRef.current > 3600_000) {
          lastReminderRef.current = now;
          const tone = (settings.careTone ?? "warm") as CareTone;
          const msg = getToneMessage(hydrationReminder, tone);
          useCardStore.getState().updateContent(hydrationCard.id, msg);
        }
      } catch (err) {
        console.error("[useHydrationReminder] Reminder check error:", err);
      }
    }, 30 * 60_000);

    return () => clearInterval(interval);
  }, []);
}
