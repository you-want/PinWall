import type { PinCardData } from '@/types';

/** 创建一张默认测试卡片 */
export function createMockCard(overrides: Partial<PinCardData> = {}): PinCardData {
  return {
    id: 'card-1700000000000',
    title: '测试卡片',
    content: '这是一张用于测试的便签卡片',
    x: 40,
    y: 40,
    collapsed: false,
    colorIndex: 0,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    cardType: 'note',
    reminderEnabled: false,
    reminderTime: null,
    reminderFired: false,
    checkinDone: false,
    lastCheckinDate: null,
    ...overrides,
  };
}

/** 创建多张不同颜色的测试卡片 */
export function createMockCards(count: number): PinCardData[] {
  return Array.from({ length: count }, (_, i) =>
    createMockCard({
      id: `card-${i}`,
      title: `卡片 ${i + 1}`,
      content: `这是第 ${i + 1} 张测试卡片的内容`,
      x: 40 + (i % 3) * 300,
      y: 40 + Math.floor(i / 3) * 200,
      colorIndex: i % 8,
    })
  );
}

/** 创建一张带提醒的测试卡片 */
export function createReminderCard(overrides: Partial<PinCardData> = {}): PinCardData {
  return createMockCard({
    cardType: 'reminder',
    reminderEnabled: true,
    reminderTime: Date.now() + 60000,
    ...overrides,
  });
}

/** 创建一张每日打卡卡片 */
export function createDailyCheckinCard(overrides: Partial<PinCardData> = {}): PinCardData {
  return createMockCard({
    cardType: 'daily-checkin',
    reminderEnabled: true,
    reminderTime: new Date().setHours(10, 0, 0, 0),
    ...overrides,
  });
}

/** 创建一张喝水提醒卡片 */
export function createHydrationCard(overrides: Partial<PinCardData> = {}): PinCardData {
  return createMockCard({
    cardType: 'hydration',
    hydrationCount: 3,
    hydrationGoal: 8,
    hydrationDate: new Date().toISOString().slice(0, 10),
    ...overrides,
  });
}
