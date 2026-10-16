import { StrictMode } from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMockCard } from '@/__tests__';
import { useCardStore } from '@/stores/cardStore';
import { useDailyReset } from './useDailyReset';

describe('useDailyReset layout recovery', () => {
  beforeEach(() => {
    useCardStore.setState({
      cards: [
        createMockCard({ id: 'first', x: 123, y: 234 }),
        createMockCard({ id: 'second', x: 678, y: 432 }),
      ],
      zIndexMap: {},
      _zIndexCounter: 100,
    });
  });

  it('keeps persisted positions on startup, including StrictMode remounts', () => {
    renderHook(() => useDailyReset(), { wrapper: StrictMode });
    expect(useCardStore.getState().cards.map(({ id, x, y }) => ({ id, x, y }))).toEqual([
      { id: 'first', x: 123, y: 234 },
      { id: 'second', x: 678, y: 432 },
    ]);
  });
});
