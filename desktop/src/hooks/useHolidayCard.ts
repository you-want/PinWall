import { useEffect, useRef } from "react";
import { webviewWindow } from "@tauri-apps/api";
import { getSettings, updateLastHolidayCardDate } from "../services/storage";
import { generateHolidayGreeting } from "../services/aiService";
import { useCardStore } from "../stores/cardStore";
import { useLanguageStore } from "../stores/languageStore";
import { useNotificationStore } from "../stores/notificationStore";
import { getTodayHoliday, getRandomGreeting } from "../data/holidays";

/**
 * On app startup, if holiday greetings are enabled and today is a holiday,
 * create a holiday greeting card and show a notification popup.
 */
export function useHolidayCard() {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    (async () => {
      try {
        const settings = await getSettings();

        // Check if holiday greetings are enabled
        if (settings.holidayEnabled === false) return;

        // Check if today is a holiday
        const holiday = getTodayHoliday();
        if (!holiday) return;

        // Check if we already showed today's holiday card
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        if (settings.lastHolidayCardDate === today) return;

        const lang = useLanguageStore.getState().lang;
        let title: string;
        let content: string;

        // Generate greeting: AI if enabled, otherwise fallback
        if (settings.ai?.enabled && settings.ai.apiKey) {
          try {
            const result = await generateHolidayGreeting(holiday.name, settings.ai, lang);
            title = result.title;
            content = result.content;
          } catch {
            // AI failed, use fallback
            title = holiday.name;
            content = getRandomGreeting(holiday, lang);
          }
        } else {
          title = holiday.name;
          content = getRandomGreeting(holiday, lang);
        }

        // Create card at a slightly random position
        const x = 80 + Math.floor(Math.random() * 100);
        const y = 80 + Math.floor(Math.random() * 80);
        const colorIndex = Math.floor(Math.random() * 8);

        useCardStore.getState().createCard(title, content, colorIndex, false, null, x, y);
        await updateLastHolidayCardDate(today);

        // Show notification popup after a short delay (let the card be created first)
        setTimeout(async () => {
          const cards = useCardStore.getState().cards;
          const newCard = cards.find((c) => c.title === title);
          if (newCard) {
            useNotificationStore.getState().showNotification(newCard);
            try {
              const notifWin = await webviewWindow.WebviewWindow.getByLabel("notification");
              if (notifWin) {
                const screenW = window.screen?.width ?? 1920;
                const scaleFactor = window.devicePixelRatio || 1;
                const nx = Math.round((screenW - 300) * scaleFactor);
                const ny = Math.round(40 * scaleFactor);
                await notifWin.setPosition({ x: nx, y: ny, type: "Physical" } as any);
                await notifWin.show();
                await notifWin.setFocus();
              }
            } catch (err) {
              console.error("[useHolidayCard] Failed to show notification window:", err);
            }
          }
        }, 500);
      } catch (err) {
        console.error("[useHolidayCard] Failed to generate holiday card:", err);
      }
    })();
  }, []);
}
