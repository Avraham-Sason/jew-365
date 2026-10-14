import { DateTime } from 'luxon';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { storage, StorageService } from '@/services/StorageService';
import {
  NotificationScheduler,
  SCHEDULE_FORMAT_KEY,
  setSchedulingSuspended,
  syncNotificationPermissionStatus,
} from '@/services/NotificationScheduler';
import { reportError } from '@/services/errors';
import type { AppLanguage } from '@/i18n';
import { useUserStore } from '@/stores/useUserStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { dateKey, useCompletionsStore } from '@/stores/useCompletionsStore';
import { useCustomMitzvotStore } from '@/stores/useCustomMitzvotStore';

export const BACKUP_APP = 'jew-in-time';
export const BACKUP_FORMAT = 1;
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

// The taharah store is left out on purpose: its key never leaves the device, and a cycle log in a
// file the user shares through a chat app is not something to produce by default.
const STORES = {
  'user-store': useUserStore,
  'mitzvot-store': useMitzvotStore,
  'completions-store': useCompletionsStore,
  'custom-mitzvot-store': useCustomMitzvotStore,
} as const;

export type BackupStoreName = keyof typeof STORES;
export const BACKUP_STORES = Object.keys(STORES) as BackupStoreName[];

export type Backup = {
  app: typeof BACKUP_APP;
  format: number;
  createdAt: string;
  stores: Partial<Record<BackupStoreName, string>>;
};

export type BackupErrorReason = 'invalid' | 'newer';

export class BackupError extends Error {
  constructor(readonly reason: BackupErrorReason) {
    super(`backup ${reason}`);
    this.name = 'BackupError';
  }
}

export function createBackup(now: Date = new Date()): Backup {
  const stores: Backup['stores'] = {};
  for (const name of BACKUP_STORES) {
    const raw = storage.getString(name);
    if (raw !== undefined) stores[name] = raw;
  }
  return { app: BACKUP_APP, format: BACKUP_FORMAT, createdAt: now.toISOString(), stores };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isPersistedPayload(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) && isRecord(parsed.state) && typeof parsed.version === 'number';
  } catch {
    return false;
  }
}

export function parseBackup(text: string): Backup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('invalid');
  }
  if (!isRecord(parsed) || parsed.app !== BACKUP_APP || typeof parsed.format !== 'number') {
    throw new BackupError('invalid');
  }
  if (parsed.format > BACKUP_FORMAT) throw new BackupError('newer');
  if (typeof parsed.createdAt !== 'string' || Number.isNaN(Date.parse(parsed.createdAt))) {
    throw new BackupError('invalid');
  }
  if (!isRecord(parsed.stores)) throw new BackupError('invalid');
  const stores: Backup['stores'] = {};
  for (const name of BACKUP_STORES) {
    const raw = parsed.stores[name];
    if (raw === undefined) continue;
    if (!isPersistedPayload(raw)) throw new BackupError('invalid');
    stores[name] = raw;
  }
  if (!stores['user-store']) throw new BackupError('invalid');
  return { app: BACKUP_APP, format: parsed.format, createdAt: parsed.createdAt, stores };
}

// Replaces, never merges: every store in the file takes the file's state through the store's own
// migrate and merge, and a store the file lacks goes back to its defaults. Scheduling is held for
// the whole swap and rebuilt once, and the schedule stamp is dropped first, so a reload part-way
// (a language change reloads the app for RTL) still rebuilds on the next launch.
export async function restoreBackup(backup: Backup): Promise<void> {
  setSchedulingSuspended(true);
  try {
    StorageService.delete(SCHEDULE_FORMAT_KEY);
    for (const name of BACKUP_STORES) {
      const raw = backup.stores[name];
      const store = STORES[name];
      if (raw === undefined) {
        store.getState().reset();
        continue;
      }
      storage.set(name, raw);
      await store.persist.rehydrate();
    }
    await syncNotificationPermissionStatus().catch((error) => reportError('schedule', error));
  } finally {
    setSchedulingSuspended(false);
  }
  await NotificationScheduler.rebuild().catch((error) => reportError('schedule', error));
}

export function backupFileName(now: Date = new Date()): string {
  return `jew-in-time-backup-${dateKey(now)}.json`;
}

export async function exportBackup(now: Date = new Date()): Promise<void> {
  const file = new File(Paths.cache, backupFileName(now));
  file.write(JSON.stringify(createBackup(now)));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: backupFileName(now),
  });
}

const isCancelled = (error: unknown): boolean => error instanceof Error && /cancel/i.test(error.message);

// Resolves null when the user closes the picker without choosing a file.
export async function pickBackup(): Promise<Backup | null> {
  let picked: Awaited<ReturnType<typeof File.pickFileAsync>>;
  try {
    picked = await File.pickFileAsync();
  } catch (error) {
    if (isCancelled(error)) return null;
    throw error;
  }
  const file = Array.isArray(picked) ? picked[0] : picked;
  if (!file) return null;
  if (file.size > MAX_BACKUP_BYTES) throw new BackupError('invalid');
  return parseBackup(await file.text());
}

export function backupDateLabel(backup: Backup, language: AppLanguage): string {
  return DateTime.fromISO(backup.createdAt)
    .setLocale(language)
    .toFormat(language === 'he' ? 'd LLLL yyyy' : 'LLL d, yyyy');
}

// The i18n key that explains a failed export, pick or restore. Anything but a rejected file is
// unexpected, so it is reported as well.
export function backupFailureKey(error: unknown): string {
  if (error instanceof BackupError) return error.reason === 'newer' ? 'settings.backupNewer' : 'settings.backupInvalid';
  reportError('storage', error);
  return 'settings.backupFailed';
}
