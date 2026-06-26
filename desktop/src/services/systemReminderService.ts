import type { ReminderNotificationLifecycle, SystemReminderKind } from "../types";
import { useNotificationStore } from "../stores/notificationStore";
import { useReminderStore } from "../stores/reminderStore";
import { showNotificationWindow } from "./notificationWindow";

type SystemReminderInput = {
  kind: SystemReminderKind;
  occurrenceKey: string;
  title: string;
  content: string;
  colorIndex: number;
  lifecycle: Exclude<ReminderNotificationLifecycle, "card">;
  nextDueAt?: number;
};

export async function showSystemReminder(input: SystemReminderInput): Promise<boolean> {
  const reminderStore = useReminderStore.getState();
  if (!reminderStore.shouldShowSystemReminder(input.kind, input.occurrenceKey)) {
    return false;
  }

  reminderStore.markSystemReminderShown(input.kind, input.occurrenceKey, input.nextDueAt);
  useNotificationStore.getState().showSystemNotification({
    id: `system-${input.kind}-${input.occurrenceKey}`,
    title: input.title,
    content: input.content,
    colorIndex: input.colorIndex,
    lifecycle: input.lifecycle,
    systemKind: input.kind,
    occurrenceKey: input.occurrenceKey,
    nextDueAt: input.nextDueAt,
  });
  await showNotificationWindow();
  return true;
}

