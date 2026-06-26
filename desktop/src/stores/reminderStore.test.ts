import { describe, it, expect, beforeEach } from 'vitest';
import { useReminderStore } from '@/stores/reminderStore';

function resetStore() {
  useReminderStore.setState({ systemReminders: {} });
}

describe('useReminderStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('allows a system reminder that has not been shown or completed', () => {
    expect(useReminderStore.getState().shouldShowSystemReminder('eye-care', 'slot-1', 1000)).toBe(true);
  });

  it('does not show the same occurrence after it was shown', () => {
    useReminderStore.getState().markSystemReminderShown('eye-care', 'slot-1', 2000);

    expect(useReminderStore.getState().shouldShowSystemReminder('eye-care', 'slot-1', 1000)).toBe(false);
  });

  it('keeps recurring reminder definitions after confirmation', () => {
    useReminderStore.getState().confirmSystemReminder('rest', 'slot-1', 5000);

    const record = useReminderStore.getState().systemReminders.rest;
    expect(record?.lastCompletedKey).toBe('slot-1');
    expect(record?.nextDueAt).toBe(5000);
    expect(useReminderStore.getState().shouldShowSystemReminder('rest', 'slot-2', 4000)).toBe(false);
    expect(useReminderStore.getState().shouldShowSystemReminder('rest', 'slot-2', 6000)).toBe(true);
  });

  it('does not repeat a one-time daily occurrence after confirmation', () => {
    useReminderStore.getState().confirmSystemReminder('weather', '2026-06-26-weather');

    expect(useReminderStore.getState().shouldShowSystemReminder('weather', '2026-06-26-weather')).toBe(false);
    expect(useReminderStore.getState().shouldShowSystemReminder('weather', '2026-06-27-weather')).toBe(true);
  });
});

