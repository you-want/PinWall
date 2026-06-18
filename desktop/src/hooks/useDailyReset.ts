import { useEffect, useRef } from "react";
import { useCardStore, migrateCardsIfNeeded } from "../stores/cardStore";
import { calculateGridPositions } from "../utils/gridLayout";

/**
 * 应用启动时执行向后兼容迁移 + 每日打卡重置 + 自动整齐排列，
 * 之后每分钟检查是否跨日，跨日时再次重置。
 */
export function useDailyReset() {
  const firedRef = useRef(false);
  const lastDateRef = useRef<string>("");

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    // 向后兼容迁移旧卡片
    migrateCardsIfNeeded();

    // 启动时重置每日打卡 + 喝水
    useCardStore.getState().resetDailyCheckins();
    useCardStore.getState().resetDailyHydration();
    lastDateRef.current = new Date().toISOString().slice(0, 10);

    // 启动时自动整齐排列所有可见卡片
    const cards = useCardStore.getState().cards;
    const sorted = [...cards].sort((a, b) => b.updatedAt - a.updatedAt);
    const visible = sorted.slice(0, 5);
    if (visible.length > 1) {
      const positions = calculateGridPositions(visible.map((c) => c.id));
      useCardStore.getState().batchSetPositions(positions);
    }
  }, []);

  // 每分钟检查是否跨日
  useEffect(() => {
    const interval = setInterval(() => {
      const today = new Date().toISOString().slice(0, 10);
      if (today !== lastDateRef.current) {
        lastDateRef.current = today;
        useCardStore.getState().resetDailyCheckins();
        useCardStore.getState().resetDailyHydration();
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, []);
}
