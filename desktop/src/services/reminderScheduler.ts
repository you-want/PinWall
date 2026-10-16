export type ReminderTick = (now: number) => void | Promise<void>;

export interface ReminderSchedulerOptions {
  now?: () => number;
  setTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
  heartbeatMs?: number;
}

type Subscription = {
  tick: ReminderTick;
  intervalMs: number;
  lastRun: number;
  running: boolean;
};

/** One cancellable heartbeat shared by all background reminder hooks. */
export function createReminderScheduler(options: ReminderSchedulerOptions = {}) {
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimeout ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = options.clearTimeout ?? ((timer) => clearTimeout(timer));
  const heartbeatMs = Math.max(250, options.heartbeatMs ?? 1000);
  const subscriptions = new Set<Subscription>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = false;

  const run = (at: number) => {
    for (const subscription of subscriptions) {
      if (subscription.running || at - subscription.lastRun < subscription.intervalMs) continue;
      subscription.lastRun = at;
      subscription.running = true;
      new Promise<void>(resolve => resolve(subscription.tick(at))).catch(() => {
        // Individual reminder failures must not stop the shared heartbeat.
      }).finally(() => {
        subscription.running = false;
      });
    }
  };

  const schedule = () => {
    if (!active || timer !== undefined) return;
    timer = setTimer(() => {
      timer = undefined;
      run(now());
      schedule();
    }, heartbeatMs);
  };

  const start = () => {
    if (active) return;
    active = true;
    schedule();
  };

  const stop = () => {
    active = false;
    if (timer !== undefined) {
      clearTimer(timer);
      timer = undefined;
    }
  };

  return {
    subscribe(tick: ReminderTick, intervalMs = 60_000) {
      const subscription: Subscription = { tick, intervalMs: Math.max(heartbeatMs, intervalMs), lastRun: now(), running: false };
      subscriptions.add(subscription);
      start();
      return () => {
        subscriptions.delete(subscription);
        if (subscriptions.size === 0) stop();
      };
    },
    /** Deterministic hook for unit tests and sleep/wake recovery. */
    tick(at = now()) {
      run(at);
    },
    get subscriberCount() { return subscriptions.size; },
    get timerActive() { return active; },
    stop,
  };
}

export const reminderScheduler = createReminderScheduler();
