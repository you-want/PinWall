/**
 * Weather service using Open-Meteo (free, no API key required).
 * Uses geocoding to convert city names to coordinates.
 */

export interface WeatherData {
  temperature: number;
  weatherCode: number;
  description: string;
  city?: string;
}

export interface DailyWeatherData {
  date: string;
  weatherCode: number;
  description: string;
  temperatureMax: number;
  temperatureMin: number;
}

export interface WeatherForecast {
  current: WeatherData;
  daily: DailyWeatherData[];
}

export interface WeatherCoords {
  lat: number;
  lon: number;
  city?: string;
}

const WMO_CODES: Record<number, string> = {
  0: "晴天", 1: "大部晴朗", 2: "多云", 3: "阴天",
  45: "雾", 48: "雾凇", 51: "小毛毛雨", 53: "中毛毛雨",
  55: "大毛毛雨", 61: "小雨", 63: "中雨", 65: "大雨",
  71: "小雪", 73: "中雪", 75: "大雪", 80: "阵雨",
  81: "中阵雨", 82: "大阵雨", 95: "雷暴", 96: "雷暴+冰雹",
};

async function geocodeCity(city: string): Promise<WeatherCoords | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.results?.[0];
    if (!result) return null;
    return {
      lat: result.latitude,
      lon: result.longitude,
      city: result.name || city,
    };
  } catch {
    return null;
  }
}

export async function getWeather(city: string): Promise<WeatherData | null> {
  const coords = await geocodeCity(city);
  if (!coords) return null;

  return getWeatherByCoords(coords);
}

export async function getWeatherForecast(city: string): Promise<WeatherForecast | null> {
  const coords = await geocodeCity(city);
  if (!coords) return null;
  return getWeatherForecastByCoords(coords);
}

export async function getWeatherByCoords(coords: WeatherCoords): Promise<WeatherData | null> {
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
      city: coords.city,
    };
  } catch {
    return null;
  }
}

export async function getWeatherForecastByCoords(coords: WeatherCoords): Promise<WeatherForecast | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const temp = data.current?.temperature_2m;
    const code = data.current?.weather_code;
    if (temp === undefined || code === undefined) return null;

    const daily: DailyWeatherData[] = (data.daily?.time ?? []).map((date: string, index: number) => {
      const dailyCode = data.daily.weather_code?.[index] ?? code;
      return {
        date,
        weatherCode: dailyCode,
        description: WMO_CODES[dailyCode] || `天气代码${dailyCode}`,
        temperatureMax: data.daily.temperature_2m_max?.[index],
        temperatureMin: data.daily.temperature_2m_min?.[index],
      };
    }).filter((day: DailyWeatherData) =>
      Number.isFinite(day.temperatureMax) && Number.isFinite(day.temperatureMin)
    );

    return {
      current: {
        temperature: temp,
        weatherCode: code,
        description: WMO_CODES[code] || `天气代码${code}`,
        city: coords.city,
      },
      daily,
    };
  } catch {
    return null;
  }
}

export async function detectCurrentWeatherLocation(): Promise<WeatherCoords | null> {
  const ipCoords = await getIpLocation();
  if (ipCoords) {
    return ipCoords;
  }

  const browserCoords = await getBrowserLocation();
  if (browserCoords) {
    return reverseGeocode(browserCoords.lat, browserCoords.lon) ?? browserCoords;
  }
  return null;
}

export async function detectCurrentCity(): Promise<string | null> {
  const location = await detectCurrentWeatherLocation();
  return location?.city ?? null;
}

async function getBrowserLocation(): Promise<WeatherCoords | null> {
  if (!navigator.geolocation) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: false,
        maximumAge: 60 * 60_000,
        timeout: 6_000,
      },
    );
  });
}

async function reverseGeocode(lat: number, lon: number): Promise<WeatherCoords | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=zh&format=json`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.results?.[0];
    if (!result) return null;
    return {
      lat,
      lon,
      city: result.name,
    };
  } catch {
    return null;
  }
}

async function getIpLocation(): Promise<WeatherCoords | null> {
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (!res.ok) return null;
    const data = await res.json();
    const lat = Number(data.latitude);
    const lon = Number(data.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }
    return {
      lat,
      lon,
      city: data.city,
    };
  } catch {
    return null;
  }
}
