import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import {
  detectCurrentWeatherLocation,
  getWeatherForecast,
  getWeatherForecastByCoords,
  type WeatherForecast,
} from "../services/weatherService";
import type { Settings } from "../types";

interface WeatherCardProps {
  settings: Settings;
}

export function WeatherCard({ settings }: WeatherCardProps) {
  const { lang } = useI18n();
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      setLoading(true);
      setError("");
      try {
        const city = settings.weatherCity?.trim();
        const data = city
          ? await getWeatherForecast(city)
          : await detectCurrentWeatherLocation().then((location) =>
              location ? getWeatherForecastByCoords(location) : null
            );

        if (cancelled) return;
        if (data) {
          setForecast(data);
        } else {
          setForecast(null);
          setError(lang === "zh" ? "天气加载失败" : "Weather unavailable");
        }
      } catch {
        if (!cancelled) {
          setForecast(null);
          setError(lang === "zh" ? "天气加载失败" : "Weather unavailable");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadWeather();
    const interval = setInterval(loadWeather, 30 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [lang, settings.weatherCity]);

  const title = forecast?.current.city || settings.weatherCity || (lang === "zh" ? "当前位置" : "Current location");

  return (
    <section className="weather-card" data-interactive="true">
      <div className="weather-card-header">
        <div>
          <div className="weather-card-title">{title}</div>
          <div className="weather-card-subtitle">
            {loading
              ? (lang === "zh" ? "更新中" : "Updating")
              : error || forecast?.current.description || (lang === "zh" ? "实时天气" : "Live weather")}
          </div>
        </div>
        {forecast && (
          <div className="weather-card-temp">{Math.round(forecast.current.temperature)}°</div>
        )}
      </div>

      {forecast ? (
        <div className="weather-days">
          {forecast.daily.slice(0, 7).map((day, index) => (
            <div className="weather-day" key={day.date}>
              <span className="weather-day-name">{formatDay(day.date, index, lang)}</span>
              <span className="weather-day-desc">{day.description}</span>
              <span className="weather-day-temp">
                {Math.round(day.temperatureMin)}°/{Math.round(day.temperatureMax)}°
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="weather-empty">
          {error || (lang === "zh" ? "设置城市后显示天气" : "Set a city to show weather")}
        </div>
      )}
    </section>
  );
}

function formatDay(date: string, index: number, lang: "zh" | "en") {
  if (index === 0) return lang === "zh" ? "今天" : "Today";
  if (index === 1) return lang === "zh" ? "明天" : "Tomorrow";
  return new Date(`${date}T12:00:00`).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
    weekday: "short",
  });
}
