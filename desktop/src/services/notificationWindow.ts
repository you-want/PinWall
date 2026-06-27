import { webviewWindow } from "@tauri-apps/api";

export async function showNotificationWindow() {
  try {
    const notifWin = await webviewWindow.WebviewWindow.getByLabel("notification");
    if (!notifWin) return;
    const screenW = window.screen?.width ?? 1920;
    const scaleFactor = window.devicePixelRatio || 1;
    const x = Math.round((screenW - 300) * scaleFactor);
    const y = Math.round(40 * scaleFactor);
    await notifWin.setPosition({ x, y, type: "Physical" } as any);
    await notifWin.show();
    await notifWin.setFocus();
  } catch (err) {
    console.error("Failed to show notification window:", err);
  }
}

