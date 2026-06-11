import { useEffect, useRef } from "react";
import { getSettings, updateLastDailyCardDate } from "../services/storage";
import { generateDailyQuote } from "../services/aiService";
import { useCardStore } from "../stores/cardStore";
import { useLanguageStore } from "../stores/languageStore";

/**
 * On app startup, if AI is enabled and no card was generated today,
 * create a "daily quote" card automatically.
 */
export function useDailyCard() {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    (async () => {
      try {
        const settings = await getSettings();
        if (!settings.ai?.enabled || !settings.ai.apiKey) return;

        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        if (settings.lastDailyCardDate === today) return;

        const lang = useLanguageStore.getState().lang;
        const { title, content } = await generateDailyQuote(settings.ai, lang);

        // Create card at a slightly random position near top-left
        const x = 60 + Math.floor(Math.random() * 80);
        const y = 60 + Math.floor(Math.random() * 80);
        const colorIndex = Math.floor(Math.random() * 8);

        useCardStore.getState().createCard(title, content, colorIndex, "note", false, null, x, y);
        await updateLastDailyCardDate(today);
      } catch (err) {
        console.error("[useDailyCard] Failed to generate daily card:", err);
      }
    })();
  }, []);
}
