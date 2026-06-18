/**
 * Weather service using Open-Meteo (free, no API key required).
 * Uses geocoding to convert city names to coordinates.
 */

interface WeatherData {
  temperature: number;
  weatherCode: number;
  description: string;
}

const WMO_CODES: Record<number, string> = {
  0: "晴天", 1: "大部晴朗", 2: "多云", 3: "阴天",
  45: "雾", 48: "雾凇", 51: "小毛毛雨", 53: "中毛毛雨",
  55: "大毛毛雨", 61: "小雨", 63: "中雨", 65: "大雨",
  71: "小雪", 73: "中雪", 75: "大雪", 80: "阵雨",
  81: "中阵雨", 82: "大阵雨", 95: "雷暴", 96: "雷暴+冰雹",
};

async function geocodeCity(city: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.results?.[0];
    if (!result) return null;
    return { lat: result.latitude, lon: result.longitude };
  } catch {
    return null;
  }
}

export async function getWeather(city: string): Promise<WeatherData | null> {
  const coords = await geocodeCity(city);
  if (!coords) return null;

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code&timezone=auto`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const temp = data.current?.temperature_2m;
    const code = data.current?.weather_code;
    if (temp === undefined || code === undefined) return null;

    return {
      temperature: temp,
      weatherCode: code,
      description: WMO_CODES[code] || `天气代码${code}`,
    };
  } catch {
    return null;
  }
}
