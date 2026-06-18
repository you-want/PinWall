import { useEffect, useRef } from "react";
import { getSettings } from "../services/storage";
import { getWeather } from "../services/weatherService";
import { generateWeatherCare } from "../services/aiService";
import { useCardStore } from "../stores/cardStore";
import { useLanguageStore } from "../stores/languageStore";
import { getToneMessage, weatherCold, weatherRain, weatherHot, weatherSunny } from "../data/careTones";
import type { CareTone } from "../types";

/**
 * On app startup (once per day), fetch weather for the configured city
 * and create a weather care card with a personalized message.
 */
export function useWeatherCare() {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    (async () => {
      try {
        const settings = await getSettings();
        if (!settings.weatherCareEnabled || !settings.weatherCity) return;

        // Only fire once per day
        const today = new Date().toISOString().slice(0, 10);
        const lastDate = settings.lastWeatherCardDate;
        if (lastDate === today) return;

        const weather = await getWeather(settings.weatherCity);
        if (!weather) return;

        const tone = (settings.careTone ?? "warm") as CareTone;
        const lang = useLanguageStore.getState().lang;
        let title: string;
        let content: string;

        // Try AI-generated weather care
        if (settings.ai?.enabled && settings.ai.apiKey) {
          try {
            const result = await generateWeatherCare(
              weather.description,
              weather.temperature,
              settings.ai,
              lang,
              tone,
            );
            title = result.title;
            content = result.content;
          } catch {
            // Fallback to template
            const tpl = pickWeatherTemplate(weather.weatherCode, weather.temperature);
            title = lang === "zh" ? "🌤️ 天气关怀" : "🌤️ Weather Care";
            content = getToneMessage(tpl, tone);
          }
        } else {
          const tpl = pickWeatherTemplate(weather.weatherCode, weather.temperature);
          title = lang === "zh" ? "🌤️ 天气关怀" : "🌤️ Weather Care";
          content = getToneMessage(tpl, tone);
        }

        const x = 80 + Math.floor(Math.random() * 100);
        const y = 80 + Math.floor(Math.random() * 80);
        useCardStore.getState().createCard(title, content, 2, "note", false, null, x, y);

        // Save last date
        const s = await getSettings();
        s.lastWeatherCardDate = today;
        const { saveSettings } = await import("../services/storage");
        await saveSettings(s);
      } catch (err) {
        console.error("[useWeatherCare] error:", err);
      }
    })();
  }, []);
}

function pickWeatherTemplate(code: number, temp: number) {
  // Rain codes
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96].includes(code)) return weatherRain;
  // Snow
  if ([71, 73, 75].includes(code)) return weatherCold;
  // Temperature based
  if (temp <= 5) return weatherCold;
  if (temp >= 32) return weatherHot;
  if (code <= 2) return weatherSunny;
  return weatherSunny; // default
}
