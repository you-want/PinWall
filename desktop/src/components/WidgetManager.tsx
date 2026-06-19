import { useEffect } from "react";
import { useWidgetStore } from "../stores/widgetStore";
import { loadInstalledWidgets } from "../services/widgetLoader";
import { WidgetFrame } from "./WidgetFrame";

/**
 * Widget 管理器
 * 负责：
 * 1. 启动时加载已安装的 Widget 并同步到 store
 * 2. 渲染所有已启用的 Widget 实例
 * 3. 管理 Widget 层级（低于便签卡片）
 */
export function WidgetManager() {
  const { widgets, syncWidgets } = useWidgetStore();

  // 启动时加载 Widget 列表
  useEffect(() => {
    loadInstalledWidgets().then((manifests) => {
      if (manifests.length > 0) {
        syncWidgets(manifests);
      }
    });
  }, [syncWidgets]);

  const enabledWidgets = widgets.filter((w) => w.enabled);

  if (enabledWidgets.length === 0) return null;

  return (
    <>
      {enabledWidgets.map((instance) => (
        <WidgetFrame key={instance.manifest.id} instance={instance} />
      ))}
    </>
  );
}
