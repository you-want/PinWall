import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectCurrentCity, getWeather, getWeatherForecast } from '@/services/weatherService';

describe('weatherService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('geocodes a manual city and fetches current weather', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ latitude: 31.23, longitude: 121.47, name: '上海' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: { temperature_2m: 26, weather_code: 0 },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const weather = await getWeather('Shanghai');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('name=Shanghai');
    expect(weather).toEqual({
      temperature: 26,
      weatherCode: 0,
      description: '晴天',
      city: '上海',
    });
  });

  it('fetches current weather and 7-day forecast', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ latitude: 39.9, longitude: 116.4, name: '北京' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: { temperature_2m: 18, weather_code: 1 },
          daily: {
            time: ['2026-06-26', '2026-06-27'],
            weather_code: [1, 61],
            temperature_2m_max: [24, 22],
            temperature_2m_min: [15, 14],
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const forecast = await getWeatherForecast('北京');

    expect(forecast?.current.city).toBe('北京');
    expect(forecast?.current.description).toBe('大部晴朗');
    expect(forecast?.daily).toHaveLength(2);
    expect(forecast?.daily[1]).toMatchObject({
      date: '2026-06-27',
      description: '小雨',
      temperatureMax: 22,
      temperatureMin: 14,
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain('forecast_days=7');
  });

  it('detects city by ip location without requiring browser geolocation', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn(),
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ latitude: 39.9, longitude: 116.4, city: '北京' }),
    }));

    await expect(detectCurrentCity()).resolves.toBe('北京');
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });
});
