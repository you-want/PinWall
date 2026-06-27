import { useEffect, useRef } from "react";
import { getSettings, saveSettings } from "../services/storage";
import { detectCurrentWeatherLocation, getWeather, getWeatherByCoords } from "../services/weatherService";
import { generateWeatherCare } from "../services/aiService";
import { useLanguageStore } from "../stores/languageStore";
import { getToneMessage, weatherCold, weatherRain, weatherHot, weatherSunny } from "../data/careTones";
import type { CareTone } from "../types";
import { showSystemReminder } from "../services/systemReminderService";

/**
 * Before off-work time, fetch weather for the configured or detected city
 * and show a weather care notification with a personalized message.
 */
export function useWeatherCare() {
  const runningRef = useRef(false);

  useEffect(() => {
    const checkWeatherCare = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const settings = await getSettings();
        if (!settings.weatherCareEnabled) return;

        const today = new Date().toISOString().slice(0, 10);
        const lastDate = settings.lastWeatherCardDate;
        if (lastDate === today) return;

        const now = new Date();
        const offWorkTime = settings.offWorkTime ?? "18:00";
        const [offH, offM] = offWorkTime.split(":").map(Number);
        const offMinutes = offH * 60 + offM;
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const reminderMinutesBeforeOffWork = 30;
        const targetMinutes = Math.max(0, offMinutes - reminderMinutesBeforeOffWork);
        if (nowMinutes < targetMinutes || nowMinutes >= offMinutes) return;

        const manualCity = settings.weatherCity?.trim();
        const location = manualCity ? null : await detectCurrentWeatherLocation();
        const weather = manualCity
          ? await getWeather(manualCity)
          : location
            ? await getWeatherByCoords(location)
            : null;
        if (!weather) return;

        if (!manualCity && weather.city) {
          const latest = await getSettings();
          latest.weatherCity = weather.city;
          await saveSettings(latest);
        }

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

        await showSystemReminder({
          kind: "weather",
          occurrenceKey: `${today}-weather`,
          title,
          content: weather.city ? `${weather.city}: ${content}` : content,
          colorIndex: 2,
          lifecycle: "one-time",
        });

        const s = await getSettings();
        s.lastWeatherCardDate = today;
        await saveSettings(s);
      } catch (err) {
        console.error("[useWeatherCare] error:", err);
      } finally {
        runningRef.current = false;
      }
    };

    checkWeatherCare();
    const interval = setInterval(checkWeatherCare, 60_000);
    return () => clearInterval(interval);
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
