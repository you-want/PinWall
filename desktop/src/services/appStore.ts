import { createTauriStore, type State, type StoreOptions } from '@tauri-store/zustand';
import type { StoreApi } from 'zustand';

/** tauri-store's default error hook logs and resolves start(), even on load failure. */
export function createAppStore<S extends State>(
  id: string,
  store: StoreApi<S>,
  options: Omit<StoreOptions<S>, 'autoStart' | 'hooks'> = {},
) {
  let startupFailed = false;
  let startupComplete = false;
  const handler = createTauriStore(id, store, {
    ...options,
    autoStart: false,
    hooks: {
      error: () => {
        if (!startupComplete) {
          startupFailed = true;
        } else {
          // Do not log native error objects, note contents or personal file paths.
          console.error(`[Store:${id}] Persistence or synchronization failed`);
        }
      },
    },
  });

  return {
    async start() {
      await handler.start();
      if (startupFailed) throw new Error(`Store ${id} failed to initialize`);
      startupComplete = true;
    },
  };
}
