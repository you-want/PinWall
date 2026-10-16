import { useEffect, useRef } from "react";
import { useCardStore, migrateCardsIfNeeded } from "../stores/cardStore";
import { reminderScheduler } from "../services/reminderScheduler";

/**
 * 应用启动时执行向后兼容迁移 + 每日打卡重置，保留已保存的布局。
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
  }, []);

  // 每分钟检查是否跨日
  useEffect(() => {
    return reminderScheduler.subscribe(() => {
      const today = new Date().toISOString().slice(0, 10);
      if (today !== lastDateRef.current) {
        lastDateRef.current = today;
        useCardStore.getState().resetDailyCheckins();
        useCardStore.getState().resetDailyHydration();
      }
    }, 60_000);
  }, []);
}
