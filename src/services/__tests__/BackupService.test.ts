jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  getPresentedNotificationsAsync: jest.fn(async () => []),
  dismissAllNotificationsAsync: jest.fn(),
  dismissNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  setNotificationCategoryAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0 },
}));

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  getStatusAsync: jest.fn(),
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
}));

const mockWrite = jest.fn();
const mockPickFileAsync = jest.fn();
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: Object.assign(
    jest.fn().mockImplementation((dir: { uri: string }, name: string) => ({
      uri: `${dir.uri}${name}`,
      write: mockWrite,
    })),
    { pickFileAsync: (...args: unknown[]) => mockPickFileAsync(...args) },
  ),
}));

const mockReconcile = jest.fn();
jest.mock('@/services/ChokContentService', () => ({ reconcileChokInstall: () => mockReconcile() }));

const mockShareAsync = jest.fn(async (..._args: unknown[]) => {});
jest.mock('expo-sharing', () => ({ shareAsync: (...args: unknown[]) => mockShareAsync(...args) }));

import {
  BACKUP_APP,
  BACKUP_FORMAT,
  BACKUP_STORES,
  BackupError,
  backupDateLabel,
  backupFailureKey,
  backupFileName,
  createBackup,
  exportBackup,
  parseBackup,
  pickBackup,
  RESTORABLE_APPS,
  restoreBackup,
  type Backup,
} from '../BackupService';
import { NotificationScheduler, SCHEDULE_FORMAT_KEY } from '../NotificationScheduler';
import { storage, StorageService } from '../StorageService';
import { taharahStorage } from '../TaharahStorage';
import { useUserStore } from '@/stores/useUserStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { useCustomMitzvotStore } from '@/stores/useCustomMitzvotStore';
import { useTaharahStore } from '@/stores/useTaharahStore';
import { CITIES } from '@/data/cities';
import type { CustomMitzvah } from '@/types/mitzvah';

const MARK_DAY = new Date(2026, 9, 12, 12);
const CREATED = new Date('2026-10-14T09:30:00Z');
const custom = { id: 'custom_1_ab', name: 'לימוד', start: '08:00', end: '09:00' } as unknown as CustomMitzvah;

function resetAll() {
  useUserStore.getState().reset();
  useMitzvotStore.getState().reset();
  useCompletionsStore.getState().reset();
  useCustomMitzvotStore.getState().reset();
  useTaharahStore.getState().reset();
  for (const name of BACKUP_STORES) storage.delete(name);
}

function fillSource() {
  const haifa = CITIES.find((city) => city.cityId === 'haifa') ?? CITIES[1];
  const user = useUserStore.getState();
  user.setNusach('sefard');
  user.setTheme('plum');
  user.setLanguage('en');
  user.setProfileName('Avi');
  user.setLocationState(haifa, 'ready', 'manual');
  user.setOnboarded(true);
  user.setSiddurFontSize(28);
  useMitzvotStore.getState().setEnabled('havdalah', true);
  useCompletionsStore.getState().markDone('shacharit', MARK_DAY);
  useCompletionsStore.getState().markSkipped('mincha', MARK_DAY);
  useCustomMitzvotStore.getState().add(custom);
  return haifa;
}

describe('BackupService', () => {
  beforeEach(() => {
    resetAll();
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('createBackup', () => {
    it('carries the four plain stores as their persisted strings and nothing else', () => {
      fillSource();
      const backup = createBackup(CREATED);

      expect(backup.app).toBe(BACKUP_APP);
      expect(backup.format).toBe(BACKUP_FORMAT);
      expect(backup.createdAt).toBe('2026-10-14T09:30:00.000Z');
      expect(Object.keys(backup.stores).sort()).toEqual([
        'completions-store',
        'custom-mitzvot-store',
        'mitzvot-store',
        'user-store',
      ]);
      for (const name of BACKUP_STORES) expect(backup.stores[name]).toBe(storage.getString(name));
      expect(JSON.parse(backup.stores['user-store']!).state.nusach).toBe('sefard');
    });

    it('never carries the taharah log, even while tracking is on', () => {
      fillSource();
      useUserStore.getState().setTaharahEnabled(true);
      useTaharahStore.getState().addEvent({ type: 'onset', onah: { abs: 740000, kind: 'night' } });
      expect(taharahStorage.getString('taharah-store')).toContain('onset');

      const text = JSON.stringify(createBackup(CREATED));

      expect(text).not.toContain('taharah-store');
      expect(text).not.toContain('onset');
    });

    it('leaves out a store that was never written', () => {
      useUserStore.getState().setOnboarded(true);
      storage.delete('custom-mitzvot-store');

      expect(createBackup(CREATED).stores['custom-mitzvot-store']).toBeUndefined();
    });
  });

  describe('parseBackup', () => {
    const valid = (): Backup => {
      fillSource();
      return createBackup(CREATED);
    };

    it('round-trips a backup', () => {
      const backup = valid();
      expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
    });

    it('drops store names it does not know, a taharah store included', () => {
      const backup = valid();
      const text = JSON.stringify({ ...backup, stores: { ...backup.stores, 'taharah-store': '{"state":{}}' } });

      expect(Object.keys(parseBackup(text).stores)).not.toContain('taharah-store');
    });

    const rejects = (text: string, reason: 'invalid' | 'newer') => {
      let caught: unknown;
      try {
        parseBackup(text);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(BackupError);
      expect((caught as BackupError).reason).toBe(reason);
    };

    it('rejects text that is not JSON', () => rejects('not json', 'invalid'));
    it('rejects a JSON array', () => rejects('[]', 'invalid'));
    it('rejects another app', () => rejects(JSON.stringify({ ...valid(), app: 'other' }), 'invalid'));
    it('restores a backup of the previous app as one of this app', () => {
      expect(RESTORABLE_APPS).toHaveLength(2);
      expect(RESTORABLE_APPS[0]).toBe(BACKUP_APP);
      for (const app of RESTORABLE_APPS) {
        const backup = valid();
        expect(parseBackup(JSON.stringify({ ...backup, app }))).toEqual(backup);
      }
    });
    it('rejects a format from a newer app as newer', () =>
      rejects(JSON.stringify({ ...valid(), format: BACKUP_FORMAT + 1 }), 'newer'));
    it('rejects a missing creation date', () => rejects(JSON.stringify({ ...valid(), createdAt: 'x' }), 'invalid'));
    it('rejects a backup without the user store', () => {
      const backup = valid();
      const { 'user-store': _user, ...stores } = backup.stores;
      rejects(JSON.stringify({ ...backup, stores }), 'invalid');
    });
    it('rejects a store payload that is not a persisted state', () => {
      const backup = valid();
      rejects(JSON.stringify({ ...backup, stores: { ...backup.stores, 'mitzvot-store': '{"nope":1}' } }), 'invalid');
      rejects(JSON.stringify({ ...backup, stores: { ...backup.stores, 'mitzvot-store': 42 } }), 'invalid');
      rejects(JSON.stringify({ ...backup, stores: { ...backup.stores, 'mitzvot-store': '{broken' } }), 'invalid');
    });
  });

  describe('restoreBackup', () => {
    it('replaces every store with the file and rebuilds the schedule once', async () => {
      const haifa = fillSource();
      const backup = createBackup(CREATED);
      resetAll();
      useUserStore.getState().setNusach('chabad');
      useCompletionsStore.getState().markDone('maariv', MARK_DAY);
      StorageService.set(SCHEDULE_FORMAT_KEY, 99);
      const cancelAll = jest.spyOn(NotificationScheduler, 'cancelAll');

      await restoreBackup(parseBackup(JSON.stringify(backup)));

      const user = useUserStore.getState();
      expect(user.nusach).toBe('sefard');
      expect(user.theme).toBe('plum');
      expect(user.language).toBe('en');
      expect(user.profileName).toBe('Avi');
      expect(user.isOnboarded).toBe(true);
      expect(user.siddurFontSize).toBe(28);
      expect(user.location.cityId).toBe(haifa.cityId);
      expect(user.inIsrael).toBe(haifa.inIsrael);
      expect(useMitzvotStore.getState().activeMitzvot.havdalah.enabled).toBe(true);
      expect(useCompletionsStore.getState().isDone('shacharit', MARK_DAY)).toBe(true);
      expect(useCompletionsStore.getState().isSkipped('mincha', MARK_DAY)).toBe(true);
      expect(useCompletionsStore.getState().isDone('maariv', MARK_DAY)).toBe(false);
      expect(useCustomMitzvotStore.getState().items[custom.id]).toEqual(custom);
      expect(cancelAll).toHaveBeenCalledTimes(1);
    });

    it('reconciles the Chok LeYisrael install once, before the schedule is rebuilt', async () => {
      fillSource();
      const backup = createBackup(CREATED);
      const order: string[] = [];
      mockReconcile.mockImplementation(() => order.push('reconcile'));
      jest.spyOn(NotificationScheduler, 'rebuild').mockImplementation(async () => {
        order.push('rebuild');
      });

      await restoreBackup(backup);

      expect(mockReconcile).toHaveBeenCalledTimes(1);
      expect(order[0]).toBe('reconcile');
      expect(order).toContain('rebuild');
    });

    it('drops the schedule stamp, so a reload part-way rebuilds on the next launch', async () => {
      fillSource();
      const backup = createBackup(CREATED);
      StorageService.set(SCHEDULE_FORMAT_KEY, 99);
      jest.spyOn(NotificationScheduler, 'rebuild').mockResolvedValue();

      await restoreBackup(backup);

      expect(StorageService.get(SCHEDULE_FORMAT_KEY)).toBeUndefined();
    });

    it('returns a store the file lacks to its defaults', async () => {
      fillSource();
      const backup = createBackup(CREATED);
      delete backup.stores['custom-mitzvot-store'];
      delete backup.stores['completions-store'];

      await restoreBackup(backup);

      expect(useCustomMitzvotStore.getState().items).toEqual({});
      expect(useCompletionsStore.getState().completions).toEqual({});
    });

    it('keeps the taharah log on the phone untouched', async () => {
      fillSource();
      const backup = createBackup(CREATED);
      useTaharahStore.getState().addEvent({ type: 'onset', onah: { abs: 740000, kind: 'night' } });

      await restoreBackup(backup);

      expect(useTaharahStore.getState().events).toHaveLength(1);
    });

    it('holds scheduling while the stores are swapped', async () => {
      fillSource();
      const backup = createBackup(CREATED);
      const cancelAll = jest.spyOn(NotificationScheduler, 'cancelAll');
      const counts: number[] = [];
      const unsubscribe = useUserStore.subscribe(() => counts.push(cancelAll.mock.calls.length));

      await restoreBackup(backup);
      unsubscribe();

      expect(counts.length).toBeGreaterThan(0);
      expect(counts.every((count) => count === 0)).toBe(true);
      expect(cancelAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('exportBackup', () => {
    it('writes the backup to a dated cache file and opens the share sheet on it', async () => {
      fillSource();

      await exportBackup(CREATED);

      const name = backupFileName(CREATED);
      expect(name).toMatch(/^jew-365-backup-\d{4}-\d{2}-\d{2}\.json$/);
      expect(mockWrite).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mockWrite.mock.calls[0][0])).toEqual(createBackup(CREATED));
      expect(mockShareAsync).toHaveBeenCalledWith(`file:///cache/${name}`, {
        mimeType: 'application/json',
        UTI: 'public.json',
        dialogTitle: name,
      });
    });
  });

  describe('pickBackup', () => {
    const picked = (text: string, size = text.length) => ({ size, text: async () => text });

    it('reads and parses the chosen file', async () => {
      fillSource();
      const backup = createBackup(CREATED);
      mockPickFileAsync.mockResolvedValue(picked(JSON.stringify(backup)));

      await expect(pickBackup()).resolves.toEqual(backup);
    });

    it('takes the first file when the picker returns a list', async () => {
      fillSource();
      const backup = createBackup(CREATED);
      mockPickFileAsync.mockResolvedValue([picked(JSON.stringify(backup))]);

      await expect(pickBackup()).resolves.toEqual(backup);
    });

    it('resolves null when the picker is closed', async () => {
      mockPickFileAsync.mockRejectedValue(new Error('File picking was cancelled by the user'));
      await expect(pickBackup()).resolves.toBeNull();
      mockPickFileAsync.mockRejectedValue(new Error('The file picker was cancelled by the user'));
      await expect(pickBackup()).resolves.toBeNull();
    });

    it('passes on any other picker failure', async () => {
      mockPickFileAsync.mockRejectedValue(new Error('no activity'));
      await expect(pickBackup()).rejects.toThrow('no activity');
    });

    it('refuses a file too large to be a backup without reading it', async () => {
      const text = jest.fn();
      mockPickFileAsync.mockResolvedValue({ size: 6 * 1024 * 1024, text });

      await expect(pickBackup()).rejects.toBeInstanceOf(BackupError);
      expect(text).not.toHaveBeenCalled();
    });

    it('refuses a file that is not a backup', async () => {
      mockPickFileAsync.mockResolvedValue(picked('{"hello":1}'));
      await expect(pickBackup()).rejects.toMatchObject({ reason: 'invalid' });
    });
  });

  describe('messages', () => {
    it('names the backup date in the UI language', () => {
      const backup = { ...createBackup(new Date(2026, 9, 14, 12)) };
      expect(backupDateLabel(backup, 'en')).toBe('Oct 14, 2026');
      expect(backupDateLabel(backup, 'he')).toBe('14 אוקטובר 2026');
    });

    it('maps each failure to its message', () => {
      expect(backupFailureKey(new BackupError('invalid'))).toBe('settings.backupInvalid');
      expect(backupFailureKey(new BackupError('newer'))).toBe('settings.backupNewer');
      expect(backupFailureKey(new Error('disk full'))).toBe('settings.backupFailed');
    });
  });
});
