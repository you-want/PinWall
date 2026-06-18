import { describe, it, expect } from 'vitest';
import { HOLIDAYS } from '@/data/holidays';

describe('holiday data', () => {
  it('has at least 10 holidays defined', () => {
    expect(HOLIDAYS.length).toBeGreaterThanOrEqual(10);
  });

  it('has both cn and intl regions', () => {
    const regions = new Set(HOLIDAYS.map(h => h.region));
    expect(regions.has('cn')).toBe(true);
    expect(regions.has('intl')).toBe(true);
  });

  it('each holiday has required fields', () => {
    for (const holiday of HOLIDAYS) {
      expect(holiday.id).toBeTruthy();
      expect(holiday.name).toBeTruthy();
      expect(holiday.nameEn).toBeTruthy();
      expect(['cn', 'intl']).toContain(holiday.region);
      expect(holiday.greetingsZh.length).toBeGreaterThan(0);
      expect(holiday.greetingsEn.length).toBeGreaterThan(0);
    }
  });

  it('has unique holiday IDs', () => {
    const ids = HOLIDAYS.map(h => h.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('has solar calendar holidays', () => {
    const solar = HOLIDAYS.filter(h => h.solarMonth && h.solarDay);
    expect(solar.length).toBeGreaterThan(0);
  });

  it('has lunar calendar holidays', () => {
    const lunar = HOLIDAYS.filter(h => h.lunarMonth && h.lunarDay);
    expect(lunar.length).toBeGreaterThan(0);
  });
});
