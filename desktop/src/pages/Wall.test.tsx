import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Wall from '@/pages/Wall';
import { useWidgetStore } from '@/stores/widgetStore';

const mockSettings = vi.hoisted(() => ({
  current: {
    backgroundImages: [],
    currentImageId: null,
    opacity: 1,
    autoChangeEnabled: false,
    autoChangeInterval: 30,
    launchOnStartup: true,
    careTone: 'warm',
    hydrationGoal: 8,
    moodCheckinEnabled: true,
    moodCheckinTimes: ['09:10'],
    restReminderEnabled: true,
    restInterval: 90,
    offWorkTime: '18:00',
    offWorkReminderEnabled: true,
    eyeCareEnabled: true,
    eyeCareInterval: 20,
    weatherCareEnabled: true,
    weatherCity: '北京',
    quotaMonitor: {
      enabled: true,
      refreshInterval: 5,
      models: [{
        id: 'openai',
        name: 'OpenAI',
        apiEndpoint: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
      }],
    },
  },
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: {
      loading: 'Loading...',
      welcome_title: 'Welcome',
      welcome_subtitle: 'Create a note',
    },
  }),
}));

vi.mock('@/services/storage', () => ({
  getSettings: vi.fn(() => Promise.resolve(mockSettings.current)),
}));

vi.mock('@/services/widgetLoader', () => ({
  loadInstalledWidgets: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/services/autostart', () => ({
  syncLaunchOnStartupSetting: vi.fn().mockRejectedValue(new Error('skip autostart in tests')),
}));

vi.mock('@/hooks/useCards', () => ({
  useCards: () => ({
    cards: [],
    visibleCards: [],
    stashedCards: [],
    zIndexMap: {},
    handlePositionChange: vi.fn(),
    handleBringToFront: vi.fn(),
    handleToggleCollapse: vi.fn(),
    handleCloseCard: vi.fn(),
    handleMinimizeCard: vi.fn(),
    handleCreateCard: vi.fn(),
    handleUnstashCard: vi.fn(),
    handleDragEnd: vi.fn(),
    handleArrangeCards: vi.fn(),
    handleReminderFired: vi.fn(),
  }),
}));

vi.mock('@/hooks/useReminders', () => ({ useReminders: vi.fn() }));
vi.mock('@/hooks/useDailyReset', () => ({ useDailyReset: vi.fn() }));
vi.mock('@/hooks/useDailyCard', () => ({ useDailyCard: vi.fn() }));
vi.mock('@/hooks/useHolidayCard', () => ({ useHolidayCard: vi.fn() }));
vi.mock('@/hooks/useHydrationReminder', () => ({ useHydrationReminder: vi.fn() }));
vi.mock('@/hooks/useRestReminder', () => ({ useRestReminder: vi.fn() }));
vi.mock('@/hooks/useOffWorkReminder', () => ({ useOffWorkReminder: vi.fn() }));
vi.mock('@/hooks/useEyeCareReminder', () => ({ useEyeCareReminder: vi.fn() }));
vi.mock('@/hooks/useMoodCheckin', () => ({ useMoodCheckin: vi.fn() }));
vi.mock('@/hooks/useQuotaMonitor', () => ({
  useQuotaMonitor: () => ({
    results: [],
    loading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/components/PinBoard', () => ({
  PinBoard: () => <div data-testid="pin-board" />,
}));
vi.mock('@/components/CardStack', () => ({
  CardStack: () => <div data-testid="card-stack" />,
}));
vi.mock('@/components/WidgetManager', () => ({
  WidgetManager: ({ variant }: { variant?: string }) => <div data-testid="widget-manager" data-variant={variant} />,
}));
vi.mock('@/components/FloatingButtons', () => ({
  FloatingButtons: () => <div data-testid="floating-buttons" />,
}));
vi.mock('@/components/NewCardModal', () => ({
  NewCardModal: () => <div data-testid="new-card-modal" />,
}));
vi.mock('@/components/BreathingGuide', () => ({
  BreathingGuide: () => <div data-testid="breathing-guide" />,
}));
vi.mock('@/components/QuotaCard', () => ({
  QuotaCard: () => <section data-testid="quota-card" data-interactive="true">Quota Card</section>,
}));
vi.mock('@/components/WeatherCard', () => ({
  WeatherCard: () => <section data-testid="weather-card" data-interactive="true">Weather Card</section>,
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

describe('Wall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWidgetStore.setState({ widgets: [], _zIndexCounter: 50 });
    mockSettings.current = {
      ...mockSettings.current,
      weatherCareEnabled: true,
      quotaMonitor: {
        enabled: true,
        refreshInterval: 5,
        models: [{
          id: 'openai',
          name: 'OpenAI',
          apiEndpoint: 'https://api.openai.com/v1',
          apiKey: 'sk-test',
          model: 'gpt-4o-mini',
        }],
      },
    };
  });

  it('stacks special cards on the right with weather below quota monitor', async () => {
    render(<Wall />);

    const sidePanel = await screen.findByTestId('wall-side-panel');
    const quotaCard = within(sidePanel).getByTestId('quota-card');
    const weatherCard = within(sidePanel).getByTestId('weather-card');
    const widgetManager = within(sidePanel).getByTestId('widget-manager');

    expect(sidePanel).toContainElement(quotaCard);
    expect(sidePanel).toContainElement(weatherCard);
    expect(widgetManager).toHaveAttribute('data-variant', 'side-panel');
    expect(quotaCard.compareDocumentPosition(weatherCard)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(weatherCard.compareDocumentPosition(widgetManager)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('does not render an empty side panel when optional cards and widgets are absent', async () => {
    mockSettings.current = {
      ...mockSettings.current,
      weatherCareEnabled: false,
      quotaMonitor: {
        enabled: false,
        refreshInterval: 5,
        models: [],
      },
    };

    render(<Wall />);

    await screen.findByTestId('pin-board');

    expect(screen.queryByTestId('wall-side-panel')).not.toBeInTheDocument();
  });
});
