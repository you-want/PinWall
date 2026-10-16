import { describe, expect, it, vi } from "vitest";
import { createReminderScheduler } from "./reminderScheduler";

describe("reminderScheduler", () => {
  it("isolates synchronous failures so other reminders and later ticks still run", async () => {
    const scheduler = createReminderScheduler({ now: () => 0 });
    const broken = vi.fn(() => { throw new Error('reminder unavailable'); });
    const healthy = vi.fn();
    const stopBroken = scheduler.subscribe(broken, 1000);
    const stopHealthy = scheduler.subscribe(healthy, 1000);
    expect(() => scheduler.tick(1000)).not.toThrow();
    await vi.waitFor(() => expect(healthy).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    scheduler.tick(2000);
    await vi.waitFor(() => expect(healthy).toHaveBeenCalledTimes(2));
    expect(broken).toHaveBeenCalledTimes(2);
    stopBroken(); stopHealthy();
  });
  it("uses one heartbeat for multiple subscriptions and stops after the last one leaves", async () => {
    let clock = 0;
    const timers: Array<() => void> = [];
    const scheduler = createReminderScheduler({ now: () => clock, heartbeatMs: 1000, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout: vi.fn() });
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = scheduler.subscribe(first, 1000);
    const stopSecond = scheduler.subscribe(second, 60_000);
    expect(scheduler.subscriberCount).toBe(2);
    expect(timers).toHaveLength(1);
    clock = 1000;
    timers.shift()?.();
    await vi.waitFor(() => expect(first).toHaveBeenCalledWith(1000));
    expect(second).not.toHaveBeenCalled();
    stopFirst();
    stopSecond();
    expect(scheduler.timerActive).toBe(false);
  });

  it("does not overlap a slow callback", async () => {
    let release!: () => void;
    let completed!: Promise<void>;
    let clock = 0;
    const scheduler = createReminderScheduler({ now: () => clock, heartbeatMs: 1000 });
    const slow = vi.fn(() => {
      completed = new Promise<void>(resolve => { release = resolve; });
      return completed;
    });
    const stop = scheduler.subscribe(slow, 1000);
    scheduler.tick(1000);
    scheduler.tick(2000);
    expect(slow).toHaveBeenCalledTimes(1);
    release();
    await completed;
    stop();
  });
});
