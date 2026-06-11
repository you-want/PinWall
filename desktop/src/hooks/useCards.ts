import { useMemo, useCallback } from "react";
import { useCardStore } from "../stores/cardStore";
import { resolveCollisions } from "../utils/collision";
import type { CardType } from "../types";

const VISIBLE_LIMIT = 5;

export function useCards() {
  const cards = useCardStore((s) => s.cards);
  const zIndexMap = useCardStore((s) => s.zIndexMap);
  const setPosition = useCardStore((s) => s.setPosition);
  const batchSetPositions = useCardStore((s) => s.batchSetPositions);
  const bringToFront = useCardStore((s) => s.bringToFront);
  const toggleCollapse = useCardStore((s) => s.toggleCollapse);
  const closeCard = useCardStore((s) => s.closeCard);
  const createCard = useCardStore((s) => s.createCard);
  const updateReminder = useCardStore((s) => s.updateReminder);
  const reminderFired = useCardStore((s) => s.reminderFired);
  const unstashCard = useCardStore((s) => s.unstashCard);

  const sortedCards = useMemo(
    () => [...cards].sort((a, b) => b.updatedAt - a.updatedAt),
    [cards]
  );
  const visibleCards = useMemo(() => sortedCards.slice(0, VISIBLE_LIMIT), [sortedCards]);
  const stashedCards = useMemo(() => sortedCards.slice(VISIBLE_LIMIT), [sortedCards]);

  // 碰撞解决：拖动结束或创建卡片后，推开重叠的卡片
  const resolveOverlaps = useCallback(
    (activeId: string) => {
      const visible = visibleCards;
      if (visible.length < 2) return;

      const positions = resolveCollisions(
        visible.map((c) => ({ id: c.id, x: c.x, y: c.y, content: c.content })),
        activeId
      );

      // 检查是否有位置变化，没有就不触发更新
      const hasChange = positions.some((p) => {
        const card = visible.find((c) => c.id === p.id);
        return card && (Math.abs(card.x - p.x) > 1 || Math.abs(card.y - p.y) > 1);
      });

      if (hasChange) {
        batchSetPositions(positions);
      }
    },
    [visibleCards, batchSetPositions]
  );

  const handleDragEnd = useCallback(
    (id: string) => {
      resolveOverlaps(id);
    },
    [resolveOverlaps]
  );

  // 包装 createCard，创建后解决碰撞
  const handleCreateCard = useCallback(
    (
      title: string,
      content: string,
      colorIndex: number,
      cardType: CardType,
      reminderEnabled: boolean,
      reminderTime: number | null,
      x: number,
      y: number
    ) => {
      createCard(title, content, colorIndex, cardType, reminderEnabled, reminderTime, x, y);
      // 下一帧解决碰撞，确保新卡片已加入 store
      setTimeout(() => {
        const latest = useCardStore.getState().cards;
        const sorted = [...latest].sort((a, b) => b.updatedAt - a.updatedAt);
        const visible = sorted.slice(0, VISIBLE_LIMIT);
        const newCard = visible[0];
        if (newCard && visible.length > 1) {
          const positions = resolveCollisions(
            visible.map((c) => ({ id: c.id, x: c.x, y: c.y, content: c.content })),
            newCard.id
          );
          const hasChange = positions.some((p) => {
            const card = visible.find((c) => c.id === p.id);
            return card && (Math.abs(card.x - p.x) > 1 || Math.abs(card.y - p.y) > 1);
          });
          if (hasChange) {
            useCardStore.getState().batchSetPositions(positions);
          }
        }
      }, 50);
    },
    [createCard]
  );

  return {
    cards,
    visibleCards,
    stashedCards,
    zIndexMap,
    handlePositionChange: setPosition,
    handleBringToFront: bringToFront,
    handleToggleCollapse: toggleCollapse,
    handleCloseCard: closeCard,
    handleMinimizeCard: closeCard,
    handleCreateCard,
    handleUnstashCard: unstashCard,
    handleDragEnd,
    updateCardReminder: updateReminder,
    handleReminderFired: reminderFired,
  };
}
