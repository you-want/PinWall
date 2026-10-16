/** Business effects must start only after all persisted stores have hydrated. */
export async function startStoreHandlers(
  handlers: ReadonlyArray<{ start: () => Promise<void> }>,
  timeoutMs = 10_000,
): Promise<void> {
  await Promise.all(handlers.map(async (handler) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        handler.start(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Store initialization timed out')), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }));
}
