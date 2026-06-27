import { describe, it, expect, vi } from 'vitest';
import { useNotificationStore } from '@/stores/notificationStore';

function resetStore() {
  useNotificationStore.setState({ notificationCard: null, notification: null, viewCardId: null });
}

describe('useNotificationStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('starts with no notification', () => {
    const state = useNotificationStore.getState();
    expect(state.notificationCard).toBeNull();
    expect(state.notification).toBeNull();
    expect(state.viewCardId).toBeNull();
  });

  it('shows a notification', () => {
    const mockCard = {
      id: 'card-1', title: 'Test', content: 'Content', x: 0, y: 0,
      collapsed: false, colorIndex: 0, createdAt: 0, updatedAt: 0,
      cardType: 'note' as const, reminderEnabled: false, reminderTime: null,
      reminderFired: false, checkinDone: false, lastCheckinDate: null,
    };
    useNotificationStore.getState().showNotification(mockCard);
    const state = useNotificationStore.getState();
    expect(state.notificationCard).toEqual(mockCard);
    expect(state.notification).toMatchObject({
      source: 'card',
      lifecycle: 'card',
      cardId: 'card-1',
      canView: true,
    });
  });

  it('shows a system notification without a card', () => {
    useNotificationStore.getState().showSystemNotification({
      id: 'system-eye-care-1',
      title: 'Eye Break',
      content: 'Look away',
      colorIndex: 5,
      lifecycle: 'recurring',
      systemKind: 'eye-care',
      occurrenceKey: 'slot-1',
      nextDueAt: 2000,
    });

    const state = useNotificationStore.getState();
    expect(state.notificationCard).toBeNull();
    expect(state.notification).toMatchObject({
      source: 'system',
      lifecycle: 'recurring',
      systemKind: 'eye-care',
      occurrenceKey: 'slot-1',
      canView: false,
    });
  });

  it('dismisses notification', () => {
    const mockCard = {
      id: 'card-1', title: 'Test', content: 'Content', x: 0, y: 0,
      collapsed: false, colorIndex: 0, createdAt: 0, updatedAt: 0,
      cardType: 'note' as const, reminderEnabled: false, reminderTime: null,
      reminderFired: false, checkinDone: false, lastCheckinDate: null,
    };
    useNotificationStore.getState().showNotification(mockCard);
    useNotificationStore.getState().dismissNotification();
    expect(useNotificationStore.getState().notificationCard).toBeNull();
    expect(useNotificationStore.getState().notification).toBeNull();
  });

  it('sets viewCardId', () => {
    useNotificationStore.getState().viewCard('card-123');
    expect(useNotificationStore.getState().viewCardId).toBe('card-123');
  });

  it('clears viewCardId', () => {
    useNotificationStore.getState().viewCard('card-123');
    useNotificationStore.getState().clearViewCard();
    expect(useNotificationStore.getState().viewCardId).toBeNull();
  });
});
