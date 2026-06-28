import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsPanel } from '@/components/SettingsPanel';
import { createMockSettings } from '@/__tests__';
import { useWidgetStore } from '@/stores/widgetStore';
import type { WidgetManifest } from '@/types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue('/trusted/widget'),
}));

vi.mock('@/services/widgetLoader', () => ({
  installWidgetFromPathWithResult: vi.fn().mockResolvedValue({
    manifest: {
      id: 'com.local.clock',
      name: 'Local Clock',
      description: 'Local widget',
      version: '1.0.0',
      author: 'Local',
      entry: 'index.html',
      icon: 'icon.svg',
      type: 'community',
      category: 'utility',
      permissions: ['storage'],
      defaultSize: { width: 180, height: 120 },
    },
  }),
  installOfficialWidget: vi.fn().mockImplementation(async (id: string) => ({
    manifest: {
      id,
      name: id === 'com.pinwall.weather' ? '天气小组件' : '时钟小组件',
      description: 'Official widget',
      version: '1.0.0',
      author: 'PinWall Team',
      entry: 'index.html',
      icon: 'icon.svg',
      type: 'official',
      category: 'utility',
      permissions: id === 'com.pinwall.weather' ? ['storage', 'network'] : ['storage', 'theme'],
      defaultSize: { width: 200, height: 160 },
    },
  })),
  uninstallWidget: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/services/weatherService', () => ({
  detectCurrentCity: vi.fn().mockResolvedValue('上海'),
}));

function renderSettings(overrides = {}) {
  const props = {
    settings: createMockSettings(overrides),
    onClose: vi.fn(),
    onAutoChangeSettings: vi.fn(),
    onAIConfigChange: vi.fn(),
    onQuotaMonitorChange: vi.fn(),
    onHolidayEnabledCnChange: vi.fn(),
    onHolidayEnabledIntlChange: vi.fn(),
    onShortcutChange: vi.fn(),
    onLaunchOnStartupChange: vi.fn(),
    onCareToneChange: vi.fn(),
    onCareSettingsChange: vi.fn(),
  };
  render(<SettingsPanel {...props} />);
  return props;
}

function installWidget(overrides: Partial<WidgetManifest> = {}) {
  const manifest: WidgetManifest = {
    id: 'com.test.risky',
    name: 'Risky Widget',
    description: 'Uses sensitive APIs',
    version: '1.0.0',
    author: 'Test',
    entry: 'index.html',
    icon: 'icon.svg',
    type: 'community',
    category: 'utility',
    permissions: ['storage', 'network', 'system', 'cards', 'ai'],
    defaultSize: { width: 200, height: 120 },
    ...overrides,
  };
  useWidgetStore.getState().installWidget(manifest);
}

describe('SettingsPanel', () => {
  beforeEach(() => {
    useWidgetStore.setState({ widgets: [], _zIndexCounter: 50 });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders section navigation and switches to care reminders', () => {
    renderSettings();

    expect(screen.getByRole('button', { name: 'Basics' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Care' }));
    expect(screen.getByText('Care reminders appear as top-right notifications instead of desktop cards.')).toBeInTheDocument();
    expect(screen.getByText('Rest Reminder')).toBeInTheDocument();
    expect(screen.getByText('Eye Care')).toBeInTheDocument();
  });

  it('keeps opacity managed by the app instead of exposing a slider', () => {
    renderSettings({ opacity: 0.75 });

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(screen.getByText('Window opacity is managed by PinWall')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('keeps experimental AI form collapsed until enabled', () => {
    renderSettings({ ai: { enabled: false, apiEndpoint: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' } });

    fireEvent.click(screen.getByRole('button', { name: 'Experimental' }));
    const apiKey = screen.getAllByPlaceholderText('sk-...')[0];
    expect(apiKey.closest('.ap-ai-fields')).not.toHaveClass('open');
  });

  it('shows high-risk widget permissions distinctly', () => {
    installWidget();
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Experimental' }));
    expect(screen.getByText('Risky Widget')).toBeInTheDocument();
    const riskRow = screen.getByText('Risky Widget').closest('.ap-widget-installed-row')!;
    expect(within(riskRow as HTMLElement).getByText('Network')).toHaveClass('risk');
    expect(within(riskRow as HTMLElement).getByText('System')).toHaveClass('risk');
    expect(within(riskRow as HTMLElement).getByText('Cards')).toHaveClass('risk');
    const aiPermission = screen.getAllByText('AI').find((el) => el.classList.contains('ap-widget-permission'));
    expect(aiPermission).toHaveClass('risk');
  });

  it('shows official widgets with permission explanations', () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Experimental' }));

    expect(screen.getByText('Official Widget Hub')).toBeInTheDocument();
    expect(screen.getByText('天气小组件')).toBeInTheDocument();
    expect(screen.getAllByText('Network')[0]).toHaveClass('risk');
    expect(screen.getByText(/Accesses external network resources/)).toBeInTheDocument();
  });

  it('installs official high-risk widgets after confirmation', async () => {
    const service = await import('@/services/widgetLoader');
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Experimental' }));
    const weatherCard = screen.getByText('天气小组件').closest('.ap-widget-catalog-card')!;
    fireEvent.click(within(weatherCard as HTMLElement).getByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
      expect(service.installOfficialWidget).toHaveBeenCalledWith('com.pinwall.weather');
      expect(useWidgetStore.getState().widgets.some((w) => w.manifest.id === 'com.pinwall.weather')).toBe(true);
    });
  });

  it('keeps local widget install as an advanced trusted-source action', async () => {
    const service = await import('@/services/widgetLoader');
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Experimental' }));
    fireEvent.click(screen.getByRole('button', { name: /\+ Choose Folder/ }));

    await waitFor(() => {
      expect(service.installWidgetFromPathWithResult).toHaveBeenCalledWith('/trusted/widget');
      expect(screen.getByText('Local Clock installed')).toBeInTheDocument();
    });
  });

  it('can auto-detect weather city from care settings', async () => {
    const props = renderSettings({ weatherCity: '' });

    fireEvent.click(screen.getByRole('button', { name: 'Care' }));
    fireEvent.click(screen.getByRole('button', { name: 'Detect' }));

    await waitFor(() => {
      expect(props.onCareSettingsChange).toHaveBeenCalledWith({ weatherCity: '上海' });
    });
  });

  it('does not save weather city on every keystroke', () => {
    const props = renderSettings({ weatherCity: '' });

    fireEvent.click(screen.getByRole('button', { name: 'Care' }));
    const input = screen.getByPlaceholderText('e.g. Beijing, Shanghai');
    fireEvent.change(input, { target: { value: 'Shang' } });
    expect(props.onCareSettingsChange).not.toHaveBeenCalledWith({ weatherCity: 'Shang' });

    fireEvent.blur(input);
    expect(props.onCareSettingsChange).toHaveBeenCalledWith({ weatherCity: 'Shang' });
  });

  it('lets users configure the mood check-in reminder time', () => {
    const props = renderSettings({ moodCheckinTimes: ['09:10'] });

    fireEvent.click(screen.getByRole('button', { name: 'Care' }));
    expect(screen.getByText('Reminds at 09:10')).toBeInTheDocument();

    const input = screen.getByLabelText('Check-in reminder time');
    fireEvent.change(input, { target: { value: '08:45' } });

    expect(props.onCareSettingsChange).toHaveBeenCalledWith({ moodCheckinTimes: ['08:45'] });
  });
});
