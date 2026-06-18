import type { Settings } from '@/types';

/** 创建一份最小可用设置 */
export function createMockSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    backgroundImages: [],
    currentImageId: null,
    opacity: 1,
    autoChangeEnabled: false,
    autoChangeInterval: 30,
    launchOnStartup: true,
    careTone: 'warm',
    hydrationGoal: 8,
    moodCheckinEnabled: true,
    moodCheckinTimes: ['10:00', '18:00'],
    restReminderEnabled: true,
    restInterval: 90,
    offWorkTime: '18:00',
    offWorkReminderEnabled: true,
    eyeCareEnabled: true,
    eyeCareInterval: 20,
    weatherCareEnabled: true,
    weatherCity: '北京',
    ...overrides,
  };
}
