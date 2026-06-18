import { describe, it, expect, vi } from 'vitest';
import { useNotificationStore } from '@/stores/notificationStore';

function resetStore() {
  useNotificationStore.setState({ notificationCard: null, viewCardId: null });
}

describe('useNotificationStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('starts with no notification', () => {
    const state = useNotificationStore.getState();
    expect(state.notificationCard).toBeNull();
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
