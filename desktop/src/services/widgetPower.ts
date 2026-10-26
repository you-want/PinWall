import { invoke } from "@tauri-apps/api/core";
import type { WidgetPowerAction, WidgetPowerStatus } from "../types";

export const KEEP_AWAKE_WIDGET_ID = "com.pinwall.keep-awake";

/** Disable commits only after native revocation succeeds, so failure remains retryable. */
export async function revokeWidgetPower(widgetId: string): Promise<void> {
  if (widgetId === KEEP_AWAKE_WIDGET_ID) await invoke("revoke_widget_power", { widgetId });
}

/** Tokens stay in the host closure. The native side also verifies the bundled plugin. */
export function createWidgetPowerSession(manifest: { id: string; permissions: readonly string[] }) {
  let opening: Promise<string> | null = null;
  let closing: Promise<void> | null = null;
  let disposed = false;
  return {
    async request(action: WidgetPowerAction): Promise<WidgetPowerStatus> {
      if (disposed) throw new Error("power_session_closed");
      if (manifest.id !== KEEP_AWAKE_WIDGET_ID || !manifest.permissions.includes("power")) {
        throw new Error("power_permission_denied");
      }
      opening ??= invoke<string>("open_widget_power_session", { widgetId: manifest.id }).catch(error => {
        opening = null;
        throw error;
      });
      const token = await opening;
      if (disposed) throw new Error("power_session_closed");
      return invoke<WidgetPowerStatus>("widget_power_request", { token, action });
    },
    dispose(): Promise<void> {
      if (closing) return closing;
      disposed = true;
      closing = opening
        ? opening.then(token => invoke<void>("close_widget_power_session", { token }), () => undefined)
        : Promise.resolve();
      return closing;
    },
  };
}
