import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function setupWindow(w = 1920) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: w });
}

describe('gridLayout', () => {
  let getNextGridPosition: typeof import('@/utils/gridLayout').getNextGridPosition;
  let calculateGridPositions: typeof import('@/utils/gridLayout').calculateGridPositions;
  let PADDING_LEFT: number;
  let PADDING_TOP: number;

  beforeEach(async () => {
    setupWindow(1920);
    const mod = await import('@/utils/gridLayout');
    getNextGridPosition = mod.getNextGridPosition;
    calculateGridPositions = mod.calculateGridPositions;
    PADDING_LEFT = mod.PADDING_LEFT;
    PADDING_TOP = 40;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns first grid position when no cards exist', () => {
    const pos = getNextGridPosition([]);
    expect(pos.x).toBe(PADDING_LEFT);
    expect(pos.y).toBe(PADDING_TOP);
  });

  it('returns next column when first is occupied', () => {
    const pos = getNextGridPosition([{ x: PADDING_LEFT, y: PADDING_TOP }]);
    expect(pos.x).toBeGreaterThan(PADDING_LEFT);
    expect(pos.y).toBe(PADDING_TOP);
  });

  it('fills row left to right', () => {
    const p1 = getNextGridPosition([]);
    const p2 = getNextGridPosition([p1]);
    const p3 = getNextGridPosition([p1, p2]);
    expect(p1).not.toEqual(p2);
    expect(p2).not.toEqual(p3);
  });

  it('wraps to next row when row is full', () => {
    const cols = Math.floor((1920 - PADDING_LEFT - 180) / (280 + 20));
    let existing: { x: number; y: number }[] = [];
    for (let i = 0; i < cols; i++) {
      existing.push(getNextGridPosition(existing));
    }
    const nextPos = getNextGridPosition(existing);
    expect(nextPos.y).toBeGreaterThan(PADDING_TOP);
  });

  it('avoids duplicate positions', () => {
    const existing = [
      { x: PADDING_LEFT, y: PADDING_TOP },
      { x: PADDING_LEFT + 300, y: PADDING_TOP },
    ];
    const pos = getNextGridPosition(existing);
    expect(existing.some(e => e.x === pos.x && e.y === pos.y)).toBe(false);
  });

  it('returns correct number of positions for given card IDs', () => {
    expect(calculateGridPositions(['a', 'b', 'c'])).toHaveLength(3);
  });

  it('returns unique positions for each card', () => {
    const positions = calculateGridPositions(['a', 'b', 'c', 'd', 'e']);
    const seen = new Set<string>();
    for (const pos of positions) {
      const key = `${pos.x},${pos.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('handles empty card ID list', () => {
    expect(calculateGridPositions([])).toEqual([]);
  });

  it('maintains input order', () => {
    const positions = calculateGridPositions(['first', 'second', 'third']);
    expect(positions.map(p => p.id)).toEqual(['first', 'second', 'third']);
  });
});
