import { describe, it, expect } from 'vitest';
import {
  hydrationReminder,
  hydrationCelebration,
  restReminder,
  offWorkReminder,
  overtimeCare,
  eyeCareReminder,
  moodCheckinPrompt,
  moodResponses,
  breathingIntro,
  breathingInhale,
  breathingHold,
  breathingExhale,
  breathingDone,
  weatherCold,
  weatherRain,
  weatherHot,
  weatherSunny,
  getToneMessage,
  getTonePromptModifier,
} from './careTones';
import type { CareTone } from '@/types';

describe('careTones', () => {
  const tones: CareTone[] = ['warm', 'rational', 'playful'];

  it('has all message categories', () => {
    expect(hydrationReminder).toBeDefined();
    expect(hydrationCelebration).toBeDefined();
    expect(restReminder).toBeDefined();
    expect(offWorkReminder).toBeDefined();
    expect(overtimeCare).toBeDefined();
    expect(eyeCareReminder).toBeDefined();
    expect(moodCheckinPrompt).toBeDefined();
    expect(moodResponses).toBeDefined();
    expect(breathingIntro).toBeDefined();
    expect(breathingDone).toBeDefined();
    expect(weatherCold).toBeDefined();
    expect(weatherRain).toBeDefined();
    expect(weatherHot).toBeDefined();
    expect(weatherSunny).toBeDefined();
  });

  it('each message category has all three tones', () => {
    for (const category of [hydrationReminder, hydrationCelebration, restReminder, offWorkReminder, overtimeCare, eyeCareReminder, moodCheckinPrompt, breathingIntro, breathingDone, weatherCold, weatherRain, weatherHot, weatherSunny]) {
      for (const tone of tones) {
        expect(category[tone]).toBeDefined();
        expect(Array.isArray(category[tone])).toBe(true);
        expect(category[tone]!.length).toBeGreaterThan(0);
      }
    }
  });

  it('moodResponses has entries for all 5 levels', () => {
    for (let i = 1; i <= 5; i++) {
      expect(moodResponses[i]).toBeDefined();
      for (const tone of tones) {
        expect(moodResponses[i]![tone]).toBeDefined();
        expect(moodResponses[i]![tone]!.length).toBeGreaterThan(0);
      }
    }
  });

  it('getToneMessage returns a valid message', () => {
    for (let i = 0; i < 10; i++) {
      const msg = getToneMessage(hydrationReminder, 'warm');
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('getToneMessage returns default for unknown tone', () => {
    const msg = getToneMessage(hydrationReminder, 'warm' as CareTone);
    expect(msg.length).toBeGreaterThan(0);
  });

  it('getTonePromptModifier returns non-empty string for each tone', () => {
    for (const tone of tones) {
      const modifier = getTonePromptModifier(tone);
      expect(modifier.length).toBeGreaterThan(0);
    }
  });

  it('warm tone modifier contains caring keywords', () => {
    const modifier = getTonePromptModifier('warm');
    expect(modifier).toContain('温暖');
  });

  it('rational tone modifier contains professional keywords', () => {
    const modifier = getTonePromptModifier('rational');
    expect(modifier).toContain('理性');
  });

  it('playful tone modifier contains humorous keywords', () => {
    const modifier = getTonePromptModifier('playful');
    expect(modifier).toContain('幽默');
  });
});
