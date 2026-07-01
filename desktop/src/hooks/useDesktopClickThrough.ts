import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useDesktopClickThrough(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const currentWindow = getCurrentWindow();
    let isSummoned = false;
    let unlisten: (() => void) | null = null;

    const syncCursorPassthrough = async (summoned: boolean) => {
      isSummoned = summoned;
      await currentWindow.setIgnoreCursorEvents(!summoned);
    };

    invoke<boolean>("is_main_summoned")
      .then((summoned) => syncCursorPassthrough(summoned))
      .catch(() => syncCursorPassthrough(false));

    listen<boolean>("main-layer-changed", (event) => {
      void syncCursorPassthrough(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    const handleMouseDown = (event: MouseEvent) => {
      if (!isSummoned || event.button !== 0) return;

      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-interactive]")) return;

      event.preventDefault();
      event.stopPropagation();
      void invoke("send_to_background");
    };

    document.addEventListener("mousedown", handleMouseDown, true);

    return () => {
      unlisten?.();
      document.removeEventListener("mousedown", handleMouseDown, true);
      void currentWindow.setIgnoreCursorEvents(false);
    };
  }, [enabled]);
}
