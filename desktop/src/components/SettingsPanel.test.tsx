import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsPanel } from '@/components/SettingsPanel';
import { createMockSettings } from '@/__tests__';
import { useWidgetStore } from '@/stores/widgetStore';
import type { WidgetManifest } from '@/types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('@/services/widgetLoader', () => ({
  installWidgetFromPath: vi.fn(),
  uninstallWidget: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/services/weatherService', () => ({
  detectCurrentCity: vi.fn().mockResolvedValue('上海'),
}));

function renderSettings(overrides = {}) {
  const props = {
    settings: createMockSettings(overrides),
    onClose: vi.fn(),
    onOpacityChange: vi.fn(),
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
    icon: 'icon.png',
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
  });

  it('renders section navigation and switches to care reminders', () => {
    renderSettings();

    expect(screen.getByRole('button', { name: 'Basics' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Care' }));
    expect(screen.getByText('Care reminders appear as top-right notifications instead of desktop cards.')).toBeInTheDocument();
    expect(screen.getByText('Rest Reminder')).toBeInTheDocument();
    expect(screen.getByText('Eye Care')).toBeInTheDocument();
  });

  it('exposes opacity controls in note experience', () => {
    const props = renderSettings({ opacity: 0.75 });

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    const slider = screen.getByRole('slider');
    expect(slider).toHaveValue('0.75');

    fireEvent.change(slider, { target: { value: '0.9' } });
    expect(props.onOpacityChange).toHaveBeenCalledWith(0.9);
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
    expect(screen.getByText('Network')).toHaveClass('risk');
    expect(screen.getByText('System')).toHaveClass('risk');
    expect(screen.getByText('Cards')).toHaveClass('risk');
    const aiPermission = screen.getAllByText('AI').find((el) => el.classList.contains('ap-widget-permission'));
    expect(aiPermission).toHaveClass('risk');
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
});
