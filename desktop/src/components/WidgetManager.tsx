import { useWidgetStore } from "../stores/widgetStore";
import { WidgetFrame } from "./WidgetFrame";

/**
 * Widget 管理器
 * 负责：
 * 1. 启动时加载已安装的 Widget 并同步到 store
 * 2. 渲染所有已启用的 Widget 实例
 * 3. 管理 Widget 层级（低于便签卡片）
 */
interface WidgetManagerProps {
  variant?: "freeform" | "side-panel";
}

export function WidgetManager({ variant = "freeform" }: WidgetManagerProps) {
  const { widgets } = useWidgetStore();

  const enabledWidgets = widgets.filter((w) => w.enabled);

  if (enabledWidgets.length === 0) return null;

  return (
    <>
      {enabledWidgets.map((instance) => (
        <WidgetFrame key={instance.manifest.id} instance={instance} variant={variant} />
      ))}
    </>
  );
}
