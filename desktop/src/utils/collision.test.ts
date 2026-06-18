import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CardRect } from '@/utils/collision';

function setupWindow(w = 1920, h = 1080) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: h });
}

describe('collision detection', () => {
  let resolveCollisions: typeof import('@/utils/collision').resolveCollisions;
  let estimateCardHeight: typeof import('@/utils/collision').estimateCardHeight;

  beforeEach(async () => {
    setupWindow();
    const mod = await import('@/utils/collision');
    resolveCollisions = mod.resolveCollisions;
    estimateCardHeight = mod.estimateCardHeight;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('estimateCardHeight', () => {
    it('returns minimum height for empty content', () => {
      expect(estimateCardHeight('')).toBe(160);
    });

    it('returns minimum height for short content (under 1 line)', () => {
      expect(estimateCardHeight('Hello')).toBe(160);
    });

    it('calculates height for content exceeding one line', () => {
      // 30 chars = 3 lines, height = max(160, 48+32+3*22) = max(160, 154) = 160
      expect(estimateCardHeight('123456789012345678901234567890')).toBe(160);
    });

    it('increases height for very long content', () => {
      // 60 chars = 6 lines, height = max(160, 48+32+6*22) = max(160, 212) = 212
      const long = estimateCardHeight('123456789012345678901234567890123456789012345678901234567890');
      expect(long).toBe(212);
    });
  });

  describe('resolveCollisions', () => {
    it('returns unchanged positions when no overlap', () => {
      const cards = [
        { id: 'a', x: 0, y: 0, content: '' },
        { id: 'b', x: 300, y: 0, content: '' },
      ];
      const result = resolveCollisions(cards);
      expect(result).toEqual([
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 300, y: 0 },
      ]);
    });

    it('separates overlapping cards horizontally', () => {
      const cards = [
        { id: 'a', x: 0, y: 0, content: '' },
        { id: 'b', x: 50, y: 0, content: '' },
      ];
      const result = resolveCollisions(cards);
      expect(result[1].x).toBeGreaterThan(result[0].x);
    });

    it('separates overlapping cards vertically', () => {
      const cards = [
        { id: 'a', x: 0, y: 0, content: '' },
        { id: 'b', x: 0, y: 50, content: '' },
      ];
      const result = resolveCollisions(cards);
      expect(result[1].y).toBeGreaterThan(result[0].y);
    });

    it('dragged card stays in place, others move around it', () => {
      const cards = [
        { id: 'a', x: 0, y: 0, content: '' },
        { id: 'b', x: 0, y: 0, content: '' },
      ];
      const result = resolveCollisions(cards, 'a');
      expect(result.find(r => r.id === 'a')).toEqual({ id: 'a', x: 0, y: 0 });
    });

    it('keeps cards within screen boundaries', () => {
      setupWindow(800, 600);
      const cards = [{ id: 'a', x: 700, y: 500, content: '' }];
      const result = resolveCollisions(cards);
      for (const pos of result) {
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeGreaterThanOrEqual(0);
      }
    });

    it('handles single card without error', () => {
      const cards = [{ id: 'a', x: 100, y: 100, content: '' }];
      const result = resolveCollisions(cards);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ id: 'a', x: 100, y: 100 });
    });

    it('handles empty card list', () => {
      expect(resolveCollisions([])).toEqual([]);
    });

    it('uses content-aware height for collision detection', () => {
      // Two overlapping cards with different content lengths
      const longContent = '12345678901234567890123456789012345678901234567890';
      const shortContent = 'Hi';
      const longHeight = estimateCardHeight(longContent);
      const shortHeight = estimateCardHeight(shortContent);
      expect(longHeight).toBeGreaterThan(shortHeight);

      const cards = [
        { id: 'a', x: 0, y: 0, content: shortContent },
        { id: 'b', x: 0, y: 0, content: longContent },
      ];
      const result = resolveCollisions(cards);
      expect(result.length).toBe(2);
      // Both cards should have moved apart from (0, 0)
      const aMoved = result.find(r => r.id === 'a');
      const bMoved = result.find(r => r.id === 'b');
      // At least one card should have moved from origin
      expect(
        (aMoved!.x !== 0 || aMoved!.y !== 0) ||
        (bMoved!.x !== 0 || bMoved!.y !== 0)
      ).toBe(true);
    });
  });
});
