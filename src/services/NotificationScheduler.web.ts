import type { OnahKind, TaharahTaskKind } from '@/types/taharah';
import { useUserStore } from '@/stores/useUserStore';

const DAILY_REBUILD_TASK = 'jew-in-time-daily-rebuild-v2';
const NOTIFICATION_ACTION_TASK = 'jew-in-time-notification-actions';
const MITZVAH_REMINDER_CATEGORY = 'mitzvah_reminder';
const MITZVAH_TEXT_CATEGORY = 'mitzvah_reminder_text';
const TAHARAH_KIND = 'taharah';
const UPDATE_KIND = 'update';
const UPDATE_NOTIFIED_KEY = 'notifications:update-notified';
const TAHARAH_BEDIKA_CATEGORY = 'taharah_bedika';
const MARK_DONE_ACTION = 'MARK_DONE';
const OPEN_TEXT_ACTION = 'OPEN_TEXT';
const ANDROID_CHANNELS = {
  mitzvot: 'default',
  hilulot: 'hilulot',
  roshChodesh: 'rosh-chodesh',
  taharah: 'taharah',
  system: 'system',
} as const;
const PENDING_LIMIT = 60;
const IOS_MAX = 64;
const LAST_REBUILD_KEY = 'notifications:last-rebuild-date';
const SCHEDULE_FORMAT_KEY = 'notifications:schedule-format';

export type PendingNotificationMeta = {
  kind?: 'blockNotice' | 'checkin' | typeof TAHARAH_KIND | typeof UPDATE_KIND | 'hilula' | 'roshChodesh' | 'report';
  taharah?: { task: TaharahTaskKind | 'tevilaPrep' | 'postBlock' | 'preBlock'; day: number; onah?: OnahKind };
  hilula?: { day: number; when: 'before' | 'evening' };
  roshChodesh?: { day: number; when: 'before' | 'evening' | 'day' };
  report?: { week: string };
  blockId?: string;
  updateId?: string;
  updateCreatedAt?: string;
  mitzvahId?: string;
  dateKey?: string;
  windowEnd?: string;
  reminderIndex?: number;
  customId?: string;
  skipIfDone?: boolean;
  hasText?: boolean;
  fullContent?: unknown[] | null;
};

export function pendingNotificationMetaFromContent(_content?: unknown): PendingNotificationMeta {
  return {};
}

export const NotificationScheduler = {
  async withLock(task: () => Promise<void>): Promise<void> {
    await task();
  },
  async scheduleAll(): Promise<void> {},
  async cancelAll(): Promise<void> {},
  async cancelForMitzvah(): Promise<void> {},
  async cancelCheckIn(_blockId?: string): Promise<void> {},
  async settleCheckIn(_date?: Date): Promise<void> {},
  async rebuild(): Promise<void> {},
  async rebuildForNewDay(): Promise<void> {},
};

export function buildTriggerTime(
  reminder: { anchor: 'start' | 'end'; offsetMin: number },
  window: { start: Date; end: Date },
): Date {
  const anchor = reminder.anchor === 'start' ? window.start : window.end;
  return new Date(anchor.getTime() + reminder.offsetMin * 60_000);
}

export { nextReminderAt } from '@/services/notifications/planners/mitzvot';

export function setSchedulingSuspended(_value: boolean): void {}

export async function markDoneFromNotificationData(_data?: unknown, _notificationId?: string): Promise<boolean> {
  return false;
}

export async function syncNotificationPermissionStatus(): Promise<boolean> {
  return false;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  return false;
}

export async function dismissCompletedPresentedNotifications(): Promise<void> {}

export async function registerDailyRebuildTask(): Promise<void> {}

export async function registerNotificationActionTask(): Promise<void> {}

export async function refreshSchedulingOnForeground(): Promise<void> {}

export async function notifyIfUpdateReady(_now?: Date): Promise<boolean> {
  return false;
}

export function pickBodyForReminder(reminder: { label: string }): string {
  return reminder.label;
}

export function notificationTargetFromData(
  _data?: unknown,
  _notificationId?: string,
): { mitzvahId: string; date: Date; key: string } | null {
  return null;
}

export function shouldSuppressForCompletion(): boolean {
  return false;
}

export function taharahNotificationSettled(_data?: unknown): boolean {
  return false;
}

export function initNotificationHandlers(): () => void {
  useUserStore.getState().setNotificationPermission('unknown');
  return () => {};
}

export {
  ANDROID_CHANNELS,
  PENDING_LIMIT,
  IOS_MAX,
  DAILY_REBUILD_TASK,
  NOTIFICATION_ACTION_TASK,
  LAST_REBUILD_KEY,
  SCHEDULE_FORMAT_KEY,
  MITZVAH_REMINDER_CATEGORY,
  MITZVAH_TEXT_CATEGORY,
  TAHARAH_KIND,
  TAHARAH_BEDIKA_CATEGORY,
  UPDATE_KIND,
  UPDATE_NOTIFIED_KEY,
  MARK_DONE_ACTION,
  OPEN_TEXT_ACTION,
};
