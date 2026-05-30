import { useEffect, useRef, useCallback } from 'react';
import {
  loadReminderConfig,
  getTimeUntilNextReminder,
  showNotification,
  hasNotificationPermission,
} from '@/utils/reminder';
import { useNotesStore } from '@/stores/notesStore';

export function useReminder() {
  const timerRef = useRef<number | null>(null);
  const scheduleRef = useRef<() => void>(() => {});
  const { notes } = useNotesStore();

  const scheduleReminder = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const config = loadReminderConfig();
    if (!config.enabled || !hasNotificationPermission()) {
      return;
    }

    const uncheckedNotes = notes.filter(n => !n.is_checked);
    if (uncheckedNotes.length === 0) {
      return;
    }

    const delay = getTimeUntilNextReminder(config);
    timerRef.current = window.setTimeout(() => {
      showNotification(
        '📝 打卡提醒',
        `你还有 ${uncheckedNotes.length} 个便签待打卡，快去完成吧！`
      );
      scheduleRef.current();
    }, delay);
  }, [notes]);

  useEffect(() => {
    scheduleRef.current = scheduleReminder;
  }, [scheduleReminder]);

  useEffect(() => {
    scheduleReminder();

    const handleStorageChange = () => {
      scheduleReminder();
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [scheduleReminder]);

  return { scheduleReminder };
}