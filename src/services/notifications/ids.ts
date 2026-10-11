import type { ContentBlock } from '@/types/mitzvah';
import type { OnahKind, TaharahTaskKind } from '@/types/taharah';
import { dateKey } from '@/stores/useCompletionsStore';

export const DAILY_REBUILD_TASK = 'jew-in-time-daily-rebuild-v2';
export const LEGACY_DAILY_REBUILD_TASK = 'jew-in-time-daily-rebuild';
export const NOTIFICATION_ACTION_TASK = 'jew-in-time-notification-actions';
export const MITZVAH_REMINDER_CATEGORY = 'mitzvah_reminder';
export const MITZVAH_TEXT_CATEGORY = 'mitzvah_reminder_text';
export const TAHARAH_BEDIKA_CATEGORY = 'taharah_bedika';
export const MARK_DONE_ACTION = 'MARK_DONE';
export const OPEN_TEXT_ACTION = 'OPEN_TEXT';
// The mitzvot channel keeps the id `default` so installs that already hold it keep the sound and
// importance the user chose for it.
export const ANDROID_CHANNELS = {
  mitzvot: 'default',
  hilulot: 'hilulot',
  roshChodesh: 'rosh-chodesh',
  taharah: 'taharah',
  system: 'system',
} as const;
export const PENDING_LIMIT = 60;
export const IOS_MAX = 64;
export const IOS_HEADROOM = 4;
export const LAST_REBUILD_KEY = 'notifications:last-rebuild-date';
export const SCHEDULE_FORMAT_KEY = 'notifications:schedule-format';
export const SCHEDULE_FORMAT = 8;
export const BLOCK_NOTICE_KIND = 'blockNotice';
export const CHECK_IN_KIND = 'checkin';
export const UPDATE_KIND = 'update';
export const UPDATE_NOTIFIED_KEY = 'notifications:update-notified';
export const TAHARAH_KIND = 'taharah';
export const HILULA_KIND = 'hilula';
export const ROSH_CHODESH_KIND = 'roshChodesh';
export const REPORT_KIND = 'report';

export type HilulaWhen = 'before' | 'evening';
export type RoshChodeshWhen = 'before' | 'evening' | 'day';

export type PendingNotificationMeta = {
  kind?:
    | typeof BLOCK_NOTICE_KIND
    | typeof CHECK_IN_KIND
    | typeof TAHARAH_KIND
    | typeof UPDATE_KIND
    | typeof HILULA_KIND
    | typeof ROSH_CHODESH_KIND
    | typeof REPORT_KIND;
  taharah?: { task: TaharahTaskKind | 'tevilaPrep' | 'postBlock' | 'preBlock'; day: number; onah?: OnahKind };
  hilula?: { day: number; when: HilulaWhen };
  roshChodesh?: { day: number; when: RoshChodeshWhen };
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
  fullContent?: ContentBlock[] | null;
};

export type NotificationContentLike = {
  data?: unknown;
  dataString?: unknown;
};

export function buildId(mitzvahId: string, date: Date, idx: number): string {
  return `${mitzvahId}__${dateKey(date)}__${idx}`;
}

export function parseId(id: string): { mitzvahId: string; date: string; idx: number } | null {
  const parts = id.split('__');
  if (parts.length !== 3) return null;
  return { mitzvahId: parts[0], date: parts[1], idx: Number(parts[2]) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asPendingNotificationMeta(value: unknown): PendingNotificationMeta {
  return isRecord(value) ? (value as PendingNotificationMeta) : {};
}

export function pendingNotificationMetaFromContent(content?: NotificationContentLike | null): PendingNotificationMeta {
  if (!content) return {};
  if (isRecord(content.data)) return asPendingNotificationMeta(content.data);
  if (typeof content.dataString === 'string') {
    try {
      return asPendingNotificationMeta(JSON.parse(content.dataString));
    } catch {
      return {};
    }
  }
  return {};
}

export function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function notificationTargetFromData(
  data: PendingNotificationMeta,
  notificationId?: string,
): { mitzvahId: string; date: Date; key: string } | null {
  const idTarget = notificationId ? parseId(notificationId) : null;
  const customTarget = typeof data.customId === 'string' ? parseId(data.customId) : null;
  const mitzvahId = data.mitzvahId ?? idTarget?.mitzvahId ?? customTarget?.mitzvahId;
  const key = data.dateKey ?? idTarget?.date ?? customTarget?.date;
  if (!mitzvahId || !key) return null;
  const date = parseDateKey(key);
  if (!date) return null;
  return { mitzvahId, date, key };
}

export function notificationMatchesTarget(
  notificationId: string,
  data: PendingNotificationMeta,
  mitzvahId: string,
  key: string,
): boolean {
  const target = notificationTargetFromData(data, notificationId);
  return Boolean(target && target.mitzvahId === mitzvahId && target.key === key);
}
