export interface ReminderConfig {
  enabled: boolean;
  hour: number;
  minute: number;
}

const STORAGE_KEY = 'pinwall_reminder_config';

export function getDefaultConfig(): ReminderConfig {
  return {
    enabled: false,
    hour: 21,
    minute: 0,
  };
}

export function loadReminderConfig(): ReminderConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    console.error('Failed to load reminder config');
  }
  return getDefaultConfig();
}

export function saveReminderConfig(config: ReminderConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    console.error('Failed to save reminder config');
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

export function hasNotificationPermission(): boolean {
  if (!('Notification' in window)) {
    return false;
  }
  return Notification.permission === 'granted';
}

export function showNotification(title: string, body: string): void {
  if (!hasNotificationPermission()) {
    console.warn('Notification permission not granted');
    return;
  }

  new Notification(title, {
    body,
    icon: '/favicon.ico',
    tag: 'pinwall-reminder',
  });
}

export function getNextReminderTime(config: ReminderConfig): Date {
  const now = new Date();
  const next = new Date();
  next.setHours(config.hour, config.minute, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

export function getTimeUntilNextReminder(config: ReminderConfig): number {
  const next = getNextReminderTime(config);
  return next.getTime() - Date.now();
}

export function formatTime(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}