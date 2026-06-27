import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeatherCard } from '@/components/WeatherCard';
import { createMockSettings } from '@/__tests__';

vi.mock('@/services/weatherService', () => ({
  getWeatherForecast: vi.fn().mockResolvedValue({
    current: {
      temperature: 22,
      weatherCode: 0,
      description: '晴天',
      city: '北京',
    },
    daily: [
      { date: '2026-06-26', weatherCode: 0, description: '晴天', temperatureMax: 25, temperatureMin: 16 },
      { date: '2026-06-27', weatherCode: 61, description: '小雨', temperatureMax: 21, temperatureMin: 15 },
    ],
  }),
  getWeatherForecastByCoords: vi.fn(),
  detectCurrentWeatherLocation: vi.fn(),
}));

describe('WeatherCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders current weather and forecast days', async () => {
    render(<WeatherCard settings={createMockSettings({ weatherCity: '北京' })} />);

    expect(await screen.findByText('北京')).toBeInTheDocument();
    expect(screen.getByText('22°')).toBeInTheDocument();
    expect(screen.getAllByText('晴天').length).toBeGreaterThan(0);
    expect(screen.getByText('小雨')).toBeInTheDocument();
  });

  it('shows fallback while forecast is unavailable', async () => {
    const service = await import('@/services/weatherService');
    vi.mocked(service.getWeatherForecast).mockResolvedValueOnce(null);

    render(<WeatherCard settings={createMockSettings({ weatherCity: 'Nowhere' })} />);

    await waitFor(() => {
      expect(screen.getAllByText('Weather unavailable').length).toBeGreaterThan(0);
    });
  });
});
