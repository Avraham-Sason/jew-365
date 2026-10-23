jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

// The trigger is the one thing a reminder app must get right, so the mock records it (and the
// user-visible text) rather than only identifiers, and it replaces on duplicate identifier the way
// the real expo-notifications API does.
type ScheduleInput = {
  identifier: string;
  content: {
    title?: string;
    body?: string;
    data: Record<string, unknown>;
    categoryIdentifier?: string;
    autoDismiss?: boolean;
    sticky?: boolean;
  };
  trigger?: { type: string; date: Date; channelId?: string };
};

const mockState: {
  pending: ScheduleInput[];
  presented: { request: { identifier: string; content: { data?: Record<string, unknown>; dataString?: string } } }[];
} = { pending: [], presented: [] };
const mockSchedule = jest.fn(async (input: ScheduleInput) => {
  mockState.pending = mockState.pending.filter((p) => p.identifier !== input.identifier);
  mockState.pending.push(input);
  return input.identifier;
});
const mockCancelOne = jest.fn(async (id: string) => {
  mockState.pending = mockState.pending.filter((p) => p.identifier !== id);
});
const mockCancelAll = jest.fn(async () => {
  mockState.pending = [];
});
const mockGetAll = jest.fn(async () => mockState.pending);
const mockGetPresented = jest.fn(async () => mockState.presented);
const mockDismiss = jest.fn(async (_id: string) => {});
const mockSetCategory = jest.fn<Promise<unknown>, [string, unknown[]]>(async () => ({}));
const mockSetChannel = jest.fn<Promise<unknown>, [string, unknown]>(async () => ({}));
const mockRegisterNotificationTask = jest.fn(async (_name: string) => null);

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: (i: unknown) => mockSchedule(i as ScheduleInput),
  cancelAllScheduledNotificationsAsync: () => mockCancelAll(),
  cancelScheduledNotificationAsync: (id: string) => mockCancelOne(id),
  getAllScheduledNotificationsAsync: () => mockGetAll(),
  getPresentedNotificationsAsync: () => mockGetPresented(),
  dismissNotificationAsync: (id: string) => mockDismiss(id),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: (id: string, channel: unknown) => mockSetChannel(id, channel),
  setNotificationCategoryAsync: (identifier: string, actions: unknown[]) => mockSetCategory(identifier, actions),
  registerTaskAsync: (name: string) => mockRegisterNotificationTask(name),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  AndroidImportance: { HIGH: 'high', DEFAULT: 'default' },
  AndroidNotificationVisibility: { PUBLIC: 'public', PRIVATE: 'private' },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
  unregisterTaskAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  getStatusAsync: jest.fn(),
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
}));

import { Platform } from 'react-native';
import { DateTime } from 'luxon';
import {
  ANDROID_CHANNELS,
  MARK_DONE_ACTION,
  MITZVAH_REMINDER_CATEGORY,
  MITZVAH_TEXT_CATEGORY,
  OPEN_TEXT_ACTION,
  NotificationScheduler,
  DAILY_REBUILD_TASK,
  NOTIFICATION_ACTION_TASK,
  PENDING_LIMIT,
  registerDailyRebuildTask,
  registerNotificationActionTask,
  shouldSuppressForCompletion,
  initNotificationHandlers,
  syncNotificationPermissionStatus,
  refreshSchedulingOnForeground,
  LAST_REBUILD_KEY,
  SCHEDULE_FORMAT_KEY,
  notificationTargetFromData,
} from '../NotificationScheduler';
import { StorageService } from '@/services/StorageService';
import { HebcalService } from '@/services/HebcalService';
import { useUserStore } from '@/stores/useUserStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useChokStore } from '@/stores/useChokStore';
import { useCompletionsStore, dateKey } from '@/stores/useCompletionsStore';
import { CITIES } from '@/data/cities';
import { customToMitzvah } from '@/data/customMitzvotAdapter';
import { installChokFixture } from '@/testing/chok';
import { at } from '@/testing/zmanim';
import { t } from '@/i18n';
import type { Mitzvah } from '@/types/mitzvah';
import type { HolyBlock } from '@/types/zmanim';

// Nothing fires inside a Shabbat / Yom Tov block, so a suite running on the real clock would turn
// vacuous — or fail — whenever it happened to run on Shabbat. Only Date is faked: the scheduler's
// awaits and the completion store's queued microtasks keep running for real.
const PINNED_NOW = at(CITIES[0], '2026-11-11T06:00'); // a plain Wednesday in Cheshvan
beforeAll(() => {
  jest.useFakeTimers({
    now: PINNED_NOW,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
});
afterAll(() => jest.useRealTimers());
afterEach(() => jest.setSystemTime(PINNED_NOW));

// A run on a fixed date, with the clock set to that same moment, as on the device that day.
async function scheduleAt(instant: Date) {
  jest.setSystemTime(instant);
  await NotificationScheduler.scheduleAll(instant);
}

// Always strictly in the future, so `scheduleOne`'s `trigger <= Date.now()` guard cannot be the
// reason a notification is absent — otherwise these tests would pass for the wrong reason. Read on
// the clock of the user's LOCATION, with Luxon weekdays (Monday = 1, Saturday = 6): that is the day
// the scheduler resolves zmanim and Shabbat for. "Friday 20:00, after shkia" on the device's clock
// is Saturday morning in Jerusalem once the device sits in Los Angeles.
function nextWeekdayAt(weekday: number, hour: number): Date {
  const now = DateTime.now().setZone(useUserStore.getState().location.tz);
  let d = now.set({ hour, minute: 0, second: 0, millisecond: 0 });
  while (d.weekday !== weekday || d <= now) d = d.plus({ days: 1 });
  return d.toJSDate();
}

function idsFor(mitzvahId: string, key: string) {
  return mockState.pending.filter((p) => p.identifier.startsWith(`${mitzvahId}__${key}__`));
}

const triggerOf = (pending: ScheduleInput) => pending.trigger!.date.getTime();

// The location's calendar date of an instant, shifted by whole days: the date every reminder of that
// day is keyed by, whatever zone the device runs in.
function locationDayKey(instant: Date, days = 0): string {
  return DateTime.fromJSDate(instant).setZone(useUserStore.getState().location.tz).plus({ days }).toISODate()!;
}

function expectNothingInside(block: HolyBlock) {
  const inside = mockState.pending.filter(
    (p) => triggerOf(p) > block.start.getTime() && triggerOf(p) < block.end.getTime(),
  );
  expect(inside.map((p) => p.identifier)).toEqual([]);
}

function setupEnabled(ids: string[]) {
  const fresh: Record<string, { enabled: boolean }> = {};
  for (const id of Object.keys(useMitzvotStore.getState().activeMitzvot)) {
    fresh[id] = { enabled: ids.includes(id) };
  }
  useMitzvotStore.setState({ activeMitzvot: fresh });
}

describe('NotificationScheduler', () => {
  beforeEach(() => {
    mockState.pending = [];
    mockState.presented = [];
    mockSchedule.mockClear();
    mockCancelOne.mockClear();
    mockCancelAll.mockClear();
    mockGetAll.mockClear();
    mockGetPresented.mockClear();
    mockDismiss.mockClear();
    mockSetCategory.mockClear();
    mockSetChannel.mockClear();
    mockRegisterNotificationTask.mockClear();
    useCompletionsStore.setState({ completions: {}, skipped: {}, checkIns: {}, archivedDays: [] });
    useUserStore.getState().reset();
    useUserStore.getState().setNotificationPermission('granted');
    useUserStore.getState().setLocation(CITIES[0]);
    setupEnabled([]);
  });

  it('6.1 scheduleAll 48h: enabled mitzvot produce pending notifications', async () => {
    setupEnabled(['tefillin', 'shacharit', 'mincha']);
    const future = new Date(Date.now() + 1000);
    await NotificationScheduler.scheduleAll(future);
    expect(mockState.pending.length).toBeGreaterThan(0);
  });

  it('6.2 cancelForMitzvah removes every pending reminder for that mitzvah and date', async () => {
    const date = new Date(2026, 4, 6);
    const key = dateKey(date);
    mockState.pending = [
      {
        identifier: `shacharit__${key}__0`,
        content: { data: { mitzvahId: 'shacharit', dateKey: key, reminderIndex: 0 } },
      },
      {
        identifier: `shacharit__${key}__1`,
        content: { data: { mitzvahId: 'shacharit', dateKey: key, reminderIndex: 1 } },
      },
      {
        identifier: `shacharit__${key}__2`,
        content: { data: { mitzvahId: 'shacharit', dateKey: key, reminderIndex: 2 } },
      },
      { identifier: `mincha__${key}__0`, content: { data: { mitzvahId: 'mincha', dateKey: key, reminderIndex: 0 } } },
      {
        identifier: 'shacharit__2026-05-07__0',
        content: { data: { mitzvahId: 'shacharit', dateKey: '2026-05-07', reminderIndex: 0 } },
      },
    ];

    await NotificationScheduler.cancelForMitzvah('shacharit', date);

    expect(mockState.pending.map((p) => p.identifier)).toEqual([`mincha__${key}__0`, 'shacharit__2026-05-07__0']);
    expect(mockCancelOne).toHaveBeenCalledWith(`shacharit__${key}__0`);
    expect(mockCancelOne).toHaveBeenCalledWith(`shacharit__${key}__1`);
    expect(mockCancelOne).toHaveBeenCalledWith(`shacharit__${key}__2`);
  });

  it('6.2b cancelForMitzvah also clears that mitzvah and date from the notification tray', async () => {
    const date = new Date(2026, 4, 6);
    mockState.presented = [
      {
        request: {
          identifier: 'tefillin__2026-05-06__0',
          content: { data: { mitzvahId: 'tefillin', dateKey: '2026-05-06' } },
        },
      },
      {
        request: {
          identifier: 'tefillin__2026-05-07__0',
          content: { data: { mitzvahId: 'tefillin', dateKey: '2026-05-07' } },
        },
      },
      {
        request: {
          identifier: 'shacharit__2026-05-06__0',
          content: { data: { mitzvahId: 'shacharit', dateKey: '2026-05-06' } },
        },
      },
    ];

    await NotificationScheduler.cancelForMitzvah('tefillin', date);

    expect(mockDismiss.mock.calls.map(([id]) => id)).toEqual(['tefillin__2026-05-06__0']);
  });

  it('6.2c a schedule written by an older build is rebuilt once when the app comes to the foreground', async () => {
    useUserStore.getState().setOnboarded(true);
    setupEnabled(['tefillin']);
    StorageService.set(LAST_REBUILD_KEY, dateKey(new Date()));
    StorageService.delete(SCHEDULE_FORMAT_KEY);
    mockState.pending = [
      {
        identifier: 'tefillin__2026-05-06__0',
        content: {
          data: { mitzvahId: 'tefillin', dateKey: '2026-05-06' },
          categoryIdentifier: MITZVAH_REMINDER_CATEGORY,
        },
      },
    ];

    await refreshSchedulingOnForeground();
    expect(mockCancelAll).toHaveBeenCalledTimes(1);
    expect(mockState.pending.every((p) => p.content.categoryIdentifier === MITZVAH_TEXT_CATEGORY)).toBe(true);

    await refreshSchedulingOnForeground();
    expect(mockCancelAll).toHaveBeenCalledTimes(1);
  });

  it('6.2d a rebuild clears the format stamp before touching the schedule, so an interrupted one is redone', async () => {
    StorageService.set(SCHEDULE_FORMAT_KEY, 2);
    const running = NotificationScheduler.rebuild();
    expect(StorageService.get(SCHEDULE_FORMAT_KEY)).toBeUndefined();
    await running;
    expect(StorageService.get(SCHEDULE_FORMAT_KEY)).toBe(8);
  });

  it('6.3 cancelAll empties pending', async () => {
    setupEnabled(['tefillin']);
    await NotificationScheduler.scheduleAll(new Date(Date.now() + 1000));
    await NotificationScheduler.cancelAll();
    expect(mockState.pending.length).toBe(0);
  });

  // 6.4 and 6.5 were byte-identical `typeof rebuild === 'function'` assertions standing in for
  // subscription coverage; initNotificationHandlers was never actually invoked by any test.
  it('6.4 store changes drive a rebuild, and the teardown unsubscribes them', async () => {
    const rebuild = jest.spyOn(NotificationScheduler, 'rebuild').mockResolvedValue();
    const cancelAll = jest.spyOn(NotificationScheduler, 'cancelAll').mockResolvedValue();
    const teardown = initNotificationHandlers();
    rebuild.mockClear();

    useUserStore.getState().setLocation(CITIES[1]);
    expect(rebuild).toHaveBeenCalledTimes(1);

    useUserStore.getState().setNusach('sefard');
    expect(rebuild).toHaveBeenCalledTimes(2);

    useMitzvotStore.getState().setEnabled('tefillin', true);
    expect(rebuild).toHaveBeenCalledTimes(3);

    useUserStore.getState().setLanguage('en');
    expect(rebuild).toHaveBeenCalledTimes(4);

    useUserStore.getState().setNotificationsEnabled(false);
    expect(cancelAll).toHaveBeenCalled();

    teardown();
    rebuild.mockClear();
    useUserStore.getState().setLocation(CITIES[2]);
    expect(rebuild).not.toHaveBeenCalled();

    rebuild.mockRestore();
    cancelAll.mockRestore();
  });

  it('6.4b installing or deleting the Chok LeYisrael add-on drives a rebuild, and only that', () => {
    const rebuild = jest.spyOn(NotificationScheduler, 'rebuild').mockResolvedValue();
    const teardown = initNotificationHandlers();
    useChokStore.getState().reset();
    rebuild.mockClear();

    useChokStore.getState().setInstalled(installChokFixture());
    expect(rebuild).toHaveBeenCalledTimes(1);

    useChokStore.getState().setChecked(2, 1);
    expect(rebuild).toHaveBeenCalledTimes(1);

    useChokStore.getState().clearInstalled();
    expect(rebuild).toHaveBeenCalledTimes(2);

    teardown();
    rebuild.mockClear();
    useChokStore.getState().setInstalled(installChokFixture());
    expect(rebuild).not.toHaveBeenCalled();

    useChokStore.getState().reset();
    rebuild.mockRestore();
  });

  it('6.5 granting permission after a denial triggers a rebuild', async () => {
    useUserStore.getState().setNotificationPermission('denied');
    const rebuild = jest.spyOn(NotificationScheduler, 'rebuild').mockResolvedValue();

    await syncNotificationPermissionStatus();

    expect(useUserStore.getState().notificationPermission).toBe('granted');
    expect(rebuild).toHaveBeenCalledTimes(1);

    rebuild.mockClear();
    await syncNotificationPermissionStatus();
    expect(rebuild).not.toHaveBeenCalled(); // already granted — no repeat rebuild

    rebuild.mockRestore();
  });

  it('6.6 Shabbat is quiet: nothing fires between candle lighting and tzeit, and Sunday is covered', async () => {
    setupEnabled(['tefillin', 'shacharit', 'mincha', 'maariv', 'candle_lighting', 'havdalah']);
    const saturday = nextWeekdayAt(6, 0); // upcoming Saturday 00:00, so all of Shabbat morning is ahead
    const block = HebcalService.holyBlockAt(saturday, CITIES[0])!;

    await NotificationScheduler.scheduleAll(saturday);

    expectNothingInside(block);
    expect(idsFor('shacharit', locationDayKey(saturday))).toHaveLength(0);
    // The run reached past the block: havdalah and maariv fire at its tzeit, and Sunday is scheduled.
    expect(idsFor('havdalah', locationDayKey(saturday)).map(triggerOf)).toContain(block.end.getTime());
    expect(idsFor('maariv', locationDayKey(saturday)).map(triggerOf)).toContain(block.end.getTime());
    expect(idsFor('tefillin', locationDayKey(saturday, 1)).length).toBeGreaterThan(0);
    expect(idsFor('shacharit', locationDayKey(saturday, 1)).length).toBeGreaterThan(0);
  });

  // Replaces the old "when pending > PENDING_LIMIT only schedule today" test. That guard could
  // never fire in production (rebuild cancels everything first, so pending was always 0) and the
  // test picked tefillin, whose skipOn made it vacuous whenever the suite ran on a Friday.
  it('6.7 caps the schedule and drops the furthest-out reminders, not tomorrow wholesale', async () => {
    expect(PENDING_LIMIT).toBe(60);
    const window = { start: new Date(Date.now() + 60_000), end: new Date(Date.now() + 40 * 60_000) };
    const many: Mitzvah[] = Array.from({ length: 40 }, (_, index) => ({
      id: `bulk_${index}`,
      name: { he: `בדיקה ${index}` },
      icon: 'custom',
      timeType: 'range-within-day',
      category: 'daily-morning',
      skipOn: [],
      nuschaotSupported: ['ashkenaz', 'sefard', 'edot_hamizrach', 'chabad'],
      defaultReminders: [
        { anchor: 'start', offsetMin: 1, label: 'a' },
        { anchor: 'start', offsetMin: 2, label: 'b' },
      ],
      computeWindow: () => window,
    }));

    await NotificationScheduler.scheduleAll(new Date(Date.now() + 1000), many);

    expect(mockState.pending.length).toBeLessThanOrEqual(PENDING_LIMIT);
    expect(mockState.pending.length).toBeGreaterThan(0);
    const triggers = mockSchedule.mock.calls.map((call) => call[0].trigger!.date.getTime());
    expect([...triggers].sort((a, b) => a - b)).toEqual(triggers);
  });

  it('6.8 identifier format: mitzvahId__YYYY-MM-DD__idx unique', async () => {
    setupEnabled(['tefillin']);
    await NotificationScheduler.scheduleAll(new Date(Date.now() + 1000));
    const realIds = mockState.pending.filter((p) => p.identifier.startsWith('tefillin__'));
    for (const p of realIds) {
      expect(p.identifier).toMatch(/^tefillin__\d{4}-\d{2}-\d{2}__\d+$/);
    }
    const set = new Set(realIds.map((p) => p.identifier));
    expect(set.size).toBe(realIds.length);
  });

  it('6.8b a reminder with a nusach text carries the open-text category; both categories are registered', async () => {
    setupEnabled(['tefillin']);
    await NotificationScheduler.scheduleAll(new Date(Date.now() + 1000));
    const tefillin = mockState.pending.find((p) => p.identifier.startsWith('tefillin__'));
    expect(tefillin?.content.categoryIdentifier).toBe(MITZVAH_TEXT_CATEGORY);
    expect(tefillin?.content.data.hasText).toBe(true);
    expect(tefillin?.content.autoDismiss).toBe(true);
    expect(tefillin?.content.sticky).toBe(false);
    const markDone = { identifier: MARK_DONE_ACTION, buttonTitle: 'עשיתי', options: { opensAppToForeground: false } };
    expect(mockSetCategory).toHaveBeenCalledWith(MITZVAH_REMINDER_CATEGORY, [markDone]);
    expect(mockSetCategory).toHaveBeenCalledWith(MITZVAH_TEXT_CATEGORY, [
      { identifier: OPEN_TEXT_ACTION, buttonTitle: 'פתח נוסח', options: { opensAppToForeground: true } },
      markDone,
    ]);
  });

  it('6.8c a reminder with no text keeps the mark-done-only category', async () => {
    const window = { start: new Date(Date.now() + 30 * 60_000), end: new Date(Date.now() + 90 * 60_000) };
    const plain = bulkMitzvah('no_text', [{ anchor: 'start', offsetMin: 1, label: 'x' }], window);
    const withText = {
      ...bulkMitzvah('custom_text', [{ anchor: 'start', offsetMin: 1, label: 'x' }], window),
      isCustom: true,
      contentBlocks: [{ type: 'blessing' as const, he: 'ברוך' }],
    };
    const withLinkOnly = {
      ...bulkMitzvah('custom_link', [{ anchor: 'start', offsetMin: 1, label: 'x' }], window),
      isCustom: true,
      contentBlocks: [{ type: 'link' as const, he: 'קישור', url: 'https://example.org' }],
    };

    await NotificationScheduler.scheduleAll(new Date(Date.now() + 1000), [plain, withText, withLinkOnly]);

    const categoryOf = (id: string) =>
      mockState.pending.find((p) => p.identifier.startsWith(`${id}__`))?.content.categoryIdentifier;
    expect(categoryOf('no_text')).toBe(MITZVAH_REMINDER_CATEGORY);
    expect(categoryOf('custom_text')).toBe(MITZVAH_TEXT_CATEGORY);
    expect(categoryOf('custom_link')).toBe(MITZVAH_REMINDER_CATEGORY);
    const hasTextOf = (id: string) =>
      mockState.pending.find((p) => p.identifier.startsWith(`${id}__`))?.content.data.hasText;
    expect(hasTextOf('no_text')).toBe(false);
    expect(hasTextOf('custom_text')).toBe(true);
    expect(hasTextOf('custom_link')).toBe(false);
  });

  it('6.8d the open-text button label follows the app language', async () => {
    useUserStore.getState().setLanguage('en');
    setupEnabled(['tefillin']);
    await NotificationScheduler.scheduleAll(new Date(Date.now() + 1000));
    expect(mockSetCategory).toHaveBeenCalledWith(MITZVAH_TEXT_CATEGORY, [
      { identifier: OPEN_TEXT_ACTION, buttonTitle: 'Open text', options: { opensAppToForeground: true } },
      { identifier: MARK_DONE_ACTION, buttonTitle: 'Done', options: { opensAppToForeground: false } },
    ]);
  });

  it('6.9 daily-rebuild task is registered (defineTask called)', () => {
    const tm = require('expo-task-manager');
    expect(tm.defineTask).toHaveBeenCalled();
  });

  describe('6.9a the daily rebuild background task', () => {
    const bg = require('expo-background-task');

    beforeEach(() => bg.registerTaskAsync.mockClear());

    it('registers every 60 minutes', async () => {
      await registerDailyRebuildTask();

      expect(DAILY_REBUILD_TASK).toBe('jew-365-daily-rebuild');
      expect(bg.registerTaskAsync).toHaveBeenCalledTimes(1);
      expect(bg.registerTaskAsync).toHaveBeenCalledWith(DAILY_REBUILD_TASK, { minimumInterval: 60 });
    });

    it('survives a failed registration', async () => {
      bg.registerTaskAsync.mockRejectedValueOnce(new Error('native module missing'));

      await expect(registerDailyRebuildTask()).resolves.toBeUndefined();
    });
  });

  it('6.9b registers the background notification action task', async () => {
    await registerNotificationActionTask();

    expect(mockRegisterNotificationTask).toHaveBeenCalledWith(NOTIFICATION_ACTION_TASK);
  });

  it('6.9c background notification action marks the mitzvah done', async () => {
    const tm = require('expo-task-manager');
    const task = tm.defineTask.mock.calls.find(([name]: [string]) => name === NOTIFICATION_ACTION_TASK)?.[1];
    expect(task).toBeDefined();

    await task!({
      data: {
        actionIdentifier: MARK_DONE_ACTION,
        notification: {
          request: {
            identifier: 'shacharit__2026-05-06__0',
            content: {
              data: { mitzvahId: 'shacharit', dateKey: '2026-05-06' },
            },
          },
        },
      },
      error: null,
      executionInfo: { taskName: NOTIFICATION_ACTION_TASK },
    });

    expect(useCompletionsStore.getState().isDone('shacharit', new Date(2026, 4, 6))).toBe(true);
    expect(mockGetAll).toHaveBeenCalled();
    expect(mockDismiss).toHaveBeenCalledWith('shacharit__2026-05-06__0');
  });

  it('6.9d background notification action reads native dataString payloads', async () => {
    const tm = require('expo-task-manager');
    const task = tm.defineTask.mock.calls.find(([name]: [string]) => name === NOTIFICATION_ACTION_TASK)?.[1];
    expect(task).toBeDefined();
    mockState.presented = [
      {
        request: {
          identifier: 'shacharit__2026-05-06__0',
          content: { dataString: JSON.stringify({ mitzvahId: 'shacharit', dateKey: '2026-05-06' }) },
        },
      },
      {
        request: {
          identifier: 'mincha__2026-05-06__0',
          content: { data: { mitzvahId: 'mincha', dateKey: '2026-05-06' } },
        },
      },
    ];

    await task!({
      data: {
        actionIdentifier: MARK_DONE_ACTION,
        notification: {
          request: {
            identifier: 'shacharit__2026-05-06__0',
            content: {
              dataString: JSON.stringify({ mitzvahId: 'shacharit', dateKey: '2026-05-06' }),
            },
          },
        },
      },
      error: null,
      executionInfo: { taskName: NOTIFICATION_ACTION_TASK },
    });

    expect(useCompletionsStore.getState().isDone('shacharit', new Date(2026, 4, 6))).toBe(true);
    expect(mockGetPresented).toHaveBeenCalled();
    expect(mockDismiss).toHaveBeenCalledWith('shacharit__2026-05-06__0');
    expect(mockDismiss).not.toHaveBeenCalledWith('mincha__2026-05-06__0');
  });

  it('6.10 skipped mitzvah is not rescheduled on rebuild', async () => {
    setupEnabled(['tefillin']);
    const future = new Date(Date.now() + 1000);
    const [year, month, day] = locationDayKey(future).split('-').map(Number);
    useCompletionsStore.getState().markSkipped('tefillin', new Date(year, month - 1, day));
    await NotificationScheduler.scheduleAll(future);
    const sameDay = mockState.pending.filter((p) => p.identifier.startsWith('tefillin__' + locationDayKey(future)));
    expect(sameDay.length).toBe(0);
    // Proves the run reached tefillin at all: tomorrow, which is not skipped, is scheduled.
    expect(idsFor('tefillin', locationDayKey(future, 1)).length).toBeGreaterThan(0);
  });

  it('6.10b completed mitzvah is not rescheduled for that date', async () => {
    const today = new Date(Date.now() + 60_000);
    const key = locationDayKey(today);
    const doneMitzvah: Mitzvah = {
      id: 'synthetic_done',
      name: { he: 'בדיקת השלמה', en: 'Completed test' },
      icon: 'custom',
      timeType: 'range-within-day',
      category: 'daily-morning',
      skipOn: [],
      nuschaotSupported: ['ashkenaz', 'sefard', 'edot_hamizrach', 'chabad'],
      defaultReminders: [
        { anchor: 'start', offsetMin: 0, label: 'first' },
        { anchor: 'start', offsetMin: 5, label: 'second' },
      ],
      computeWindow: () => ({
        start: new Date(Date.now() + 60_000),
        end: new Date(Date.now() + 20 * 60_000),
      }),
    };
    useCompletionsStore.setState({
      completions: { [key]: { synthetic_done: Date.now() } },
      skipped: {},
    });

    await NotificationScheduler.scheduleAll(today, [doneMitzvah]);

    const sameDay = mockState.pending.filter((p) => p.identifier.startsWith(`synthetic_done__${key}`));
    expect(sameDay.length).toBe(0);
    // Proves the window was schedulable at all: the next day, not done, carries it.
    expect(idsFor('synthetic_done', locationDayKey(today, 1)).length).toBeGreaterThan(0);
  });

  it('6.10c skipIfDone flag is carried into the scheduled notification payload', async () => {
    const future = new Date(Date.now() + 60_000);
    const mitzvah: Mitzvah = {
      id: 'flag_test',
      name: { he: 'בדיקה', en: 'Flag test' },
      icon: 'custom',
      timeType: 'range-within-day',
      category: 'daily-morning',
      skipOn: [],
      nuschaotSupported: ['ashkenaz', 'sefard', 'edot_hamizrach', 'chabad'],
      defaultReminders: [
        { anchor: 'start', offsetMin: 1, label: 'primary' },
        { anchor: 'start', offsetMin: 2, label: 'nudge', skipIfDone: true },
      ],
      computeWindow: () => ({
        start: new Date(Date.now() + 60_000),
        end: new Date(Date.now() + 20 * 60_000),
      }),
    };

    await NotificationScheduler.scheduleAll(future, [mitzvah]);

    const scheduled = mockState.pending.filter((p) => p.identifier.startsWith('flag_test__'));
    const primary = scheduled.find((p) => p.content.data.reminderIndex === 0);
    const nudge = scheduled.find((p) => p.content.data.reminderIndex === 1);
    expect(primary?.content.data.skipIfDone).toBe(false);
    expect(nudge?.content.data.skipIfDone).toBe(true);
  });

  it('6.10d delivery is suppressed for a skipIfDone reminder once the mitzvah is done', () => {
    const date = new Date(2026, 4, 6);
    const key = dateKey(date);
    const data = { mitzvahId: 'shacharit', dateKey: key, skipIfDone: true };

    expect(shouldSuppressForCompletion(data, `shacharit__${key}__1`)).toBe(false);

    useCompletionsStore.getState().markDone('shacharit', date);
    expect(shouldSuppressForCompletion(data, `shacharit__${key}__1`)).toBe(true);

    // A reminder without skipIfDone still fires even when done.
    expect(shouldSuppressForCompletion({ mitzvahId: 'shacharit', dateKey: key }, `shacharit__${key}__0`)).toBe(false);
  });

  it('6.10e an overnight custom mitzvah is keyed by the day its window starts, also for a reminder after midnight', async () => {
    const overnight = customToMitzvah({
      id: 'custom_overnight',
      name: 'לימוד לילה',
      startHHMM: '22:00',
      endHHMM: '01:00',
      reminders: [
        { anchor: 'start', offsetMin: 0, label: 'a' },
        { anchor: 'start', offsetMin: 150, label: 'b' },
        { anchor: 'end', offsetMin: -15, label: 'c' },
      ],
      skipOn: [],
      createdAt: 1,
    });
    const location = CITIES[0];
    const startDay = locationDayKey(PINNED_NOW);
    const nextDay = locationDayKey(PINNED_NOW, 1);

    await NotificationScheduler.scheduleAll(PINNED_NOW, [overnight]);

    const triggersOn = (key: string) =>
      Object.fromEntries(idsFor('custom_overnight', key).map((p) => [p.identifier, triggerOf(p)]));
    expect(triggersOn(startDay)).toEqual({
      [`custom_overnight__${startDay}__0`]: at(location, `${startDay}T22:00`).getTime(),
      [`custom_overnight__${startDay}__1`]: at(location, `${nextDay}T00:30`).getTime(),
      [`custom_overnight__${startDay}__2`]: at(location, `${nextDay}T00:45`).getTime(),
    });
    expect(idsFor('custom_overnight', nextDay).map((p) => p.identifier)).toEqual(
      expect.arrayContaining([`custom_overnight__${nextDay}__0`, `custom_overnight__${nextDay}__1`]),
    );
    const afterMidnight = mockState.pending.find((p) => p.identifier === `custom_overnight__${startDay}__1`);
    expect(afterMidnight?.content.data.dateKey).toBe(startDay);
    expect(afterMidnight?.content.data.windowEnd).toBe(at(location, `${nextDay}T01:00`).toISOString());
  });

  it('6.10f a rebuild after midnight keeps the reminders still due in a window that opened yesterday', async () => {
    const overnight = customToMitzvah({
      id: 'custom_overnight',
      name: 'לימוד לילה',
      startHHMM: '22:00',
      endHHMM: '01:00',
      reminders: [
        { anchor: 'start', offsetMin: 0, label: 'a' },
        { anchor: 'start', offsetMin: 150, label: 'b' },
        { anchor: 'end', offsetMin: -15, label: 'c' },
      ],
      skipOn: [],
      createdAt: 1,
    });
    const location = CITIES[0];
    const startDay = locationDayKey(PINNED_NOW);
    const nextDay = locationDayKey(PINNED_NOW, 1);
    const rebuildAt = at(location, `${nextDay}T00:10`);
    jest.setSystemTime(rebuildAt);

    await NotificationScheduler.scheduleAll(rebuildAt, [overnight]);

    expect(Object.fromEntries(idsFor('custom_overnight', startDay).map((p) => [p.identifier, triggerOf(p)]))).toEqual({
      [`custom_overnight__${startDay}__1`]: at(location, `${nextDay}T00:30`).getTime(),
      [`custom_overnight__${startDay}__2`]: at(location, `${nextDay}T00:45`).getTime(),
    });
    expect(idsFor('custom_overnight', nextDay).map((p) => p.identifier)).toEqual(
      expect.arrayContaining([`custom_overnight__${nextDay}__0`]),
    );
  });

  it('6.10g a rebuild after midnight plans nothing for a window that opened yesterday once it is marked done', async () => {
    const overnight = customToMitzvah({
      id: 'custom_overnight',
      name: 'לימוד לילה',
      startHHMM: '22:00',
      endHHMM: '01:00',
      reminders: [{ anchor: 'start', offsetMin: 150, label: 'b' }],
      skipOn: [],
      createdAt: 1,
    });
    const location = CITIES[0];
    const startDay = locationDayKey(PINNED_NOW);
    const nextDay = locationDayKey(PINNED_NOW, 1);
    const rebuildAt = at(location, `${nextDay}T00:10`);
    jest.setSystemTime(rebuildAt);
    useCompletionsStore.setState({ completions: { [startDay]: { custom_overnight: rebuildAt.getTime() } } });

    await NotificationScheduler.scheduleAll(rebuildAt, [overnight]);

    expect(idsFor('custom_overnight', startDay)).toHaveLength(0);
  });

  // The skip decision must come from the mitzvah's own window, not from the clock time the rebuild
  // happened to run at. `isShabbat` is instant-sensitive, so a Friday-evening rebuild used to see
  // "Saturday 20:00" (past tzeit) as not-Shabbat and queue tefillin for Shabbat morning.
  it('6.13 a Friday-evening rebuild schedules nothing for Shabbat', async () => {
    setupEnabled(['tefillin', 'shacharit', 'maariv']);
    const fridayEvening = nextWeekdayAt(5, 20); // upcoming Friday 20:00, after shkia

    await NotificationScheduler.scheduleAll(fridayEvening);

    expectNothingInside(HebcalService.holyBlockAt(fridayEvening, CITIES[0])!);
    expect(idsFor('tefillin', locationDayKey(fridayEvening, 1))).toHaveLength(0);
    expect(idsFor('shacharit', locationDayKey(fridayEvening, 1))).toHaveLength(0);
    // Proves the run reached past Shabbat: Sunday morning is already scheduled.
    expect(idsFor('shacharit', locationDayKey(fridayEvening, 2)).length).toBeGreaterThan(0);
  });

  it('6.13c a three-day block is scheduled through to the weekday after it, with nothing inside', async () => {
    setupEnabled(['tefillin', 'shacharit', 'mincha', 'maariv', 'candle_lighting', 'havdalah']);
    const jerusalem = CITIES[0];
    // Wednesday morning, erev Rosh Hashana 5789: Thursday-Friday Yom Tov, then Shabbat.
    const erev = at(jerusalem, '2028-09-20T06:00');
    const block = HebcalService.holyBlockAt(at(jerusalem, '2028-09-22T12:00'), jerusalem)!;
    expect(block.days).toEqual(['2028-09-21', '2028-09-22', '2028-09-23']);

    await scheduleAt(erev);

    expectNothingInside(block);
    const keysOf = (id: string) => [
      ...new Set(
        mockState.pending.filter((p) => p.identifier.startsWith(`${id}__`)).map((p) => p.identifier.split('__')[1]),
      ),
    ];
    expect(keysOf('candle_lighting')).toEqual(['2028-09-20']);
    expect(keysOf('havdalah')).toEqual(['2028-09-23']);
    expect(idsFor('candle_lighting', '2028-09-20').map(triggerOf)).toEqual([block.start.getTime()]);
    expect(idsFor('havdalah', '2028-09-23').map(triggerOf)).toEqual([block.end.getTime()]);
    // Sunday after the block is covered although nothing can reopen the app in between.
    expect(idsFor('tefillin', '2028-09-24').length).toBeGreaterThan(0);
    // One notice for the whole block, an hour before candle lighting.
    const notices = mockState.pending.filter((p) => p.content.data.kind === 'blockNotice');
    expect(notices.map(triggerOf)).toEqual([block.start.getTime() - 60 * 60_000]);
  });

  it('6.13d Shabbat into Yom Tov keeps havdalah for the end of the second day', async () => {
    setupEnabled(['havdalah', 'maariv']);
    const jerusalem = CITIES[0];
    // Friday 2027-10-01: Shabbat is also Rosh Hashana 5788, and the second day is Sunday.
    await scheduleAt(at(jerusalem, '2027-10-01T06:00'));
    const block = HebcalService.holyBlockAt(at(jerusalem, '2027-10-02T12:00'), jerusalem)!;

    expectNothingInside(block);
    expect(idsFor('havdalah', '2027-10-02')).toHaveLength(0);
    expect(idsFor('havdalah', '2027-10-03').map(triggerOf)).toEqual([block.end.getTime()]);
  });

  it('6.13f the candle-lighting reminder offers no text: everything after it is quiet', async () => {
    setupEnabled(['candle_lighting', 'havdalah']);
    await NotificationScheduler.scheduleAll(nextWeekdayAt(5, 6));
    const [lighting] = mockState.pending.filter((p) => p.identifier.startsWith('candle_lighting__'));
    const [havdalah] = mockState.pending.filter((p) => p.identifier.startsWith('havdalah__'));
    expect(lighting.content.categoryIdentifier).toBe(MITZVAH_REMINDER_CATEGORY);
    expect(lighting.content.data.hasText).toBe(false);
    // Havdalah fires at the block's end, when the app is open again, so it keeps its text.
    expect(havdalah.content.categoryIdentifier).toBe(MITZVAH_TEXT_CATEGORY);
    expect(havdalah.content.data.hasText).toBe(true);
  });

  it('6.13g every location day of the horizon is visited once, keyed by its own date, whatever the device zone', async () => {
    setupEnabled(['shacharit']);
    const losAngeles = CITIES.find((city) => city.nameEn === 'Los Angeles')!;
    useUserStore.getState().setLocation(losAngeles);
    // Thursday morning in Los Angeles: Thursday, Friday, Shabbat and Sunday, each exactly once.
    await scheduleAt(at(losAngeles, '2026-11-12T05:00'));
    const keys = mockState.pending
      .filter((p) => p.identifier.startsWith('shacharit__'))
      .map((p) => p.identifier.split('__')[1]);
    expect([...new Set(keys)].sort()).toEqual(['2026-11-12', '2026-11-13', '2026-11-15']);
    expect(new Set(mockState.pending.map((p) => p.identifier)).size).toBe(mockState.pending.length);
  });

  it('6.13e a Thursday rebuild already reaches through Shabbat to Sunday', async () => {
    setupEnabled(['shacharit']);
    const thursday = nextWeekdayAt(4, 6);

    await NotificationScheduler.scheduleAll(thursday);

    expect(idsFor('shacharit', locationDayKey(thursday, 3)).length).toBeGreaterThan(0);
  });

  describe('block notice', () => {
    const jerusalem = CITIES[0];
    const noticesOf = () => mockState.pending.filter((p) => p.content.data.kind === 'blockNotice');

    it('goes out an hour before candle lighting with the lighting and exit times', async () => {
      const friday = nextWeekdayAt(5, 6);
      const block = HebcalService.holyBlockOn(nextWeekdayAt(6, 12), jerusalem)!;

      await NotificationScheduler.scheduleAll(friday);

      const [notice, ...rest] = noticesOf();
      expect(rest).toEqual([]);
      expect(triggerOf(notice)).toBe(block.start.getTime() - 60 * 60_000);
      expect(notice.identifier).toBe(`blockNotice:${block.days[0]}`);
      expect(notice.content.title).toBe(t('holyBlock.title.shabbat'));
      const clock = (instant: Date) => DateTime.fromJSDate(instant).toFormat('HH:mm');
      expect(notice.content.body).toBe(
        t('holyBlock.notice.body', {
          start: clock(block.start),
          exit: t('holyBlock.exit.shabbat'),
          end: clock(block.end),
        }),
      );
      // Not a mitzvah reminder: no category, so no "done" button can mark a fake mitzvah.
      expect(notice.content.categoryIdentifier).toBeUndefined();
      expect(notice.content.data.mitzvahId).toBeUndefined();
    });

    it("names the Omer counts that fall on the block's nights", async () => {
      setupEnabled(['sefirat_haomer']);
      // Friday 2027-04-30 (23 Nisan 5787): Friday night counts day 9.
      await scheduleAt(at(jerusalem, '2027-04-30T06:00'));
      expect(noticesOf()[0].content.body).toContain(t('holyBlock.notice.omerTonight', { count: 9 }));

      mockState.pending = [];
      useUserStore.getState().setLocation(CITIES.find((city) => city.nameEn === 'New York')!);
      // Pesach 5787 abroad: Thursday, Friday and Shabbat. Nights 1 and 2 fall inside the block.
      await scheduleAt(at(useUserStore.getState().location, '2027-04-21T06:00'));
      const notice = noticesOf()[0];
      expect(notice.content.title).toBe(t('holyBlock.title.shabbatYomTov'));
      const on = (count: number, day: string) => t('holyBlock.notice.omerOn', { count, day });
      expect(notice.content.body).toContain(
        t('holyBlock.notice.omerNights', { counts: `${on(1, 'יום חמישי')}, ${on(2, 'יום שישי')}` }),
      );
    });

    // The first Seder has no count: day 1 is the next night, inside the block. Calling it "tonight"
    // sent diaspora users to count on the wrong night.
    it("never calls a later night's count tonight", async () => {
      setupEnabled(['sefirat_haomer']);
      useUserStore.getState().setLocation(CITIES.find((city) => city.nameEn === 'New York')!);
      // Pesach 5788 abroad: Tuesday and Wednesday. Monday night is the first Seder.
      await scheduleAt(at(useUserStore.getState().location, '2028-04-10T06:00'));
      const body = noticesOf()[0].content.body ?? '';
      expect(body).not.toContain(t('holyBlock.notice.omerTonight', { count: 1 }));
      expect(body).toContain(
        t('holyBlock.notice.omerNights', { counts: t('holyBlock.notice.omerOn', { count: 1, day: 'יום שלישי' }) }),
      );
    });

    it('leaves the Omer out when the user does not count it', async () => {
      setupEnabled([]);
      await scheduleAt(at(jerusalem, '2027-04-30T06:00'));
      expect(noticesOf()[0].content.body).not.toContain(t('holyBlock.notice.omerTonight', { count: 9 }));
    });

    it('greets Yom Kippur as Yom Kippur', async () => {
      await scheduleAt(at(jerusalem, '2027-10-10T06:00'));
      const notice = noticesOf()[0];
      expect(notice.content.title).toBe(t('holyBlock.title.yomKippur'));
      expect(notice.content.body).toContain(t('holyBlock.exit.yomKippur'));
    });

    it('is never parsed as a mitzvah reminder', async () => {
      await NotificationScheduler.scheduleAll(nextWeekdayAt(5, 6));
      const notice = noticesOf()[0];
      expect(notificationTargetFromData(notice.content.data, notice.identifier)).toBeNull();
      await NotificationScheduler.cancelForMitzvah('blockNotice', new Date());
      expect(noticesOf()).toHaveLength(1);
    });

    it('is not sent once candle lighting is less than an hour away', async () => {
      const block = HebcalService.holyBlockOn(nextWeekdayAt(6, 12), jerusalem)!;
      jest.setSystemTime(new Date(block.start.getTime() - 30 * 60_000));
      try {
        await NotificationScheduler.scheduleAll(new Date());
        expect(noticesOf()).toHaveLength(0);
      } finally {
        jest.setSystemTime(PINNED_NOW);
      }
    });
  });

  it('6.13b a Thursday-evening rebuild still schedules Friday morning', async () => {
    setupEnabled(['tefillin']);
    const thursdayEvening = nextWeekdayAt(4, 20); // upcoming Thursday 20:00, after shkia

    await NotificationScheduler.scheduleAll(thursdayEvening);

    expect(idsFor('tefillin', locationDayKey(thursdayEvening, 1)).length).toBeGreaterThan(0);
  });

  function bulkMitzvah(
    id: string,
    reminders: Mitzvah['defaultReminders'],
    window: { start: Date; end: Date },
  ): Mitzvah {
    return {
      id,
      name: { he: 'בדיקה', en: 'Test' },
      icon: 'custom',
      timeType: 'range-within-day',
      category: 'daily-morning',
      skipOn: [],
      nuschaotSupported: ['ashkenaz', 'sefard', 'edot_hamizrach', 'chabad'],
      defaultReminders: reminders,
      computeWindow: () => window,
    };
  }

  it('6.14 the trigger is a date trigger at the exact anchor offset, on the app channel', async () => {
    const start = new Date(Date.now() + 30 * 60_000);
    const end = new Date(Date.now() + 120 * 60_000);
    const mitzvah = bulkMitzvah(
      'trigger_test',
      [
        { anchor: 'start', offsetMin: 10, label: 'from start' },
        { anchor: 'end', offsetMin: -45, label: 'before end' },
      ],
      { start, end },
    );

    await NotificationScheduler.scheduleAll(new Date(Date.now() + 1000), [mitzvah]);

    const byIndex = (i: number) => mockState.pending.find((p) => p.content.data.reminderIndex === i)!;
    expect(byIndex(0).trigger).toMatchObject({ type: 'date', channelId: 'default' });
    expect(byIndex(0).trigger!.date.getTime()).toBe(start.getTime() + 10 * 60_000);
    expect(byIndex(1).trigger!.date.getTime()).toBe(end.getTime() - 45 * 60_000);
    for (const pending of mockState.pending) {
      expect(pending.trigger!.date.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it('6.14b every kind of notification is routed to its own Android channel', async () => {
    expect(ANDROID_CHANNELS).toEqual({
      mitzvot: 'default',
      hilulot: 'hilulot',
      roshChodesh: 'rosh-chodesh',
      taharah: 'taharah',
      system: 'system',
    });
    setupEnabled(['shacharit', 'mincha', 'candle_lighting']);
    await scheduleAt(at(CITIES[0], '2026-11-13T06:00')); // Friday, so a block notice and check-in nudges exist
    const channelsOf = (match: (p: ScheduleInput) => boolean) => [
      ...new Set(mockState.pending.filter(match).map((p) => p.trigger!.channelId)),
    ];

    expect(channelsOf((p) => p.identifier.startsWith('shacharit__'))).toEqual(['default']);
    expect(channelsOf((p) => p.identifier.startsWith('candle_lighting__'))).toEqual(['default']);
    expect(channelsOf((p) => p.content.data.kind === 'blockNotice')).toEqual(['default']);
    expect(channelsOf((p) => p.content.data.kind === 'checkin')).toEqual(['system']);
  });

  it('6.14c on Android all five channels exist, the mitzvot one under its original id', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      setupEnabled(['tefillin']);
      await NotificationScheduler.scheduleAll(new Date(Date.now() + 1000));
    } finally {
      restore.restore();
    }

    expect(mockSetChannel.mock.calls.map(([id]) => id)).toEqual([
      'default',
      'hilulot',
      'rosh-chodesh',
      'taharah',
      'system',
    ]);
    const channels = Object.fromEntries(mockSetChannel.mock.calls) as Record<string, Record<string, unknown>>;
    expect(channels.default).toMatchObject({
      name: 'מצוות',
      importance: 'high',
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: 'public',
    });
    expect(channels.hilulot).toMatchObject({
      name: 'הילולות צדיקים',
      importance: 'default',
      lockscreenVisibility: 'public',
    });
    expect(channels.hilulot).not.toHaveProperty('vibrationPattern');
    expect(channels['rosh-chodesh']).toMatchObject({
      name: 'ראש חודש',
      importance: 'default',
      lockscreenVisibility: 'public',
    });
    expect(channels['rosh-chodesh']).not.toHaveProperty('vibrationPattern');
    expect(channels.taharah).toMatchObject({ name: 'טהרה', importance: 'high', lockscreenVisibility: 'private' });
    expect(channels.taharah).not.toHaveProperty('lightColor');
    expect(channels.system).toMatchObject({ name: 'מערכת', importance: 'default' });
  });

  it('6.15 a reminder whose trigger falls outside its own window is never scheduled', async () => {
    const start = new Date(Date.now() + 30 * 60_000);
    const end = new Date(Date.now() + 90 * 60_000); // a one-hour window
    const mitzvah = bulkMitzvah(
      'outside_test',
      [
        { anchor: 'start', offsetMin: 15, label: 'inside' },
        { anchor: 'start', offsetMin: 600, label: 'hours after the window closed' },
      ],
      { start, end },
    );

    await NotificationScheduler.scheduleAll(new Date(Date.now() + 1000), [mitzvah]);

    expect(mockState.pending.filter((p) => p.content.data.reminderIndex === 0).length).toBeGreaterThan(0);
    expect(mockState.pending.filter((p) => p.content.data.reminderIndex === 1)).toHaveLength(0);
  });

  it('6.16 notification text follows the app language', async () => {
    const window = { start: new Date(Date.now() + 30 * 60_000), end: new Date(Date.now() + 90 * 60_000) };
    const mitzvah = bulkMitzvah('lang_test', [{ anchor: 'start', offsetMin: 1, label: 'טקסט עברי' }], window);

    useUserStore.getState().setLanguage('en');
    await NotificationScheduler.scheduleAll(new Date(Date.now() + 1000), [mitzvah]);
    expect(mockState.pending[0].content.title).toBe('Test');
    expect(mockState.pending[0].content.body).not.toMatch(/[֐-׿]/);

    mockState.pending = [];
    useUserStore.getState().setLanguage('he');
    await NotificationScheduler.scheduleAll(new Date(Date.now() + 1000), [mitzvah]);
    expect(mockState.pending[0].content.title).toBe('בדיקה');
    expect(mockState.pending[0].content.body).toBe('טקסט עברי');
  });

  it('6.12 one mitzvah throwing does not abort scheduling for the rest', async () => {
    const future = new Date(Date.now() + 1000);
    const window = { start: new Date(Date.now() + 60_000), end: new Date(Date.now() + 20 * 60_000) };
    const base = {
      name: { he: 'בדיקה' },
      icon: 'custom',
      timeType: 'range-within-day' as const,
      category: 'daily-morning' as const,
      skipOn: [],
      nuschaotSupported: ['ashkenaz', 'sefard', 'edot_hamizrach', 'chabad'] as Mitzvah['nuschaotSupported'],
      defaultReminders: [{ anchor: 'start' as const, offsetMin: 1, label: 'x' }],
    };
    const exploding: Mitzvah = {
      ...base,
      id: 'exploding',
      computeWindow: () => {
        throw new Error('zmanim blew up');
      },
    };
    const healthy: Mitzvah = { ...base, id: 'healthy', computeWindow: () => window };

    await expect(NotificationScheduler.scheduleAll(future, [exploding, healthy])).resolves.toBeUndefined();
    expect(mockState.pending.some((p) => p.identifier.startsWith('healthy__'))).toBe(true);
    expect(mockState.pending.some((p) => p.identifier.startsWith('exploding__'))).toBe(false);
  });

  // Previously asserted that the second rebuild was simply dropped — which was the bug: a toggle
  // made while a rebuild was running never reached the schedule. It must be coalesced into exactly
  // one trailing re-run instead.
  it('6.11 a rebuild requested mid-run is re-run once, not dropped', async () => {
    setupEnabled(['tefillin']);
    await Promise.all([NotificationScheduler.rebuild(), NotificationScheduler.rebuild()]);

    expect(mockCancelAll).toHaveBeenCalledTimes(2);
    const tefillinIds = mockState.pending.filter((p) => p.identifier.startsWith('tefillin__')).map((p) => p.identifier);
    expect(new Set(tefillinIds).size).toBe(tefillinIds.length);
  });

  it('6.11b the trailing re-run observes state changed during the in-flight run', async () => {
    setupEnabled(['tefillin']);
    const first = NotificationScheduler.rebuild();
    setupEnabled(['tefillin', 'shacharit']);
    const second = NotificationScheduler.rebuild();
    await Promise.all([first, second]);

    expect(mockState.pending.some((p) => p.identifier.startsWith('shacharit__'))).toBe(true);
  });

  describe('check-in reminders', () => {
    const jerusalem = CITIES[0];
    // Lets the store's queued side effects run, then waits out the rebuild they started.
    const settled = async () => {
      await new Promise((resolve) => setImmediate(resolve));
      while (NotificationScheduler.inFlight) await NotificationScheduler.inFlight;
      await new Promise((resolve) => setImmediate(resolve));
    };
    const friday = at(jerusalem, '2026-11-13T06:00');
    const shabbat = () => HebcalService.holyBlockAt(at(jerusalem, '2026-11-14T12:00'), jerusalem)!;
    const checkInsOf = () => mockState.pending.filter((p) => p.content.data.kind === 'checkin');

    it('nudges at tzeit, two hours later, and at 20:00 the next day', async () => {
      setupEnabled(['shacharit', 'mincha']);
      await scheduleAt(friday);
      const block = shabbat();
      expect(checkInsOf().map((p) => p.identifier)).toEqual([
        'checkin:2026-11-14:0',
        'checkin:2026-11-14:1',
        'checkin:2026-11-14:2',
      ]);
      expect(checkInsOf().map(triggerOf)).toEqual([
        block.end.getTime(),
        block.end.getTime() + 2 * 3_600_000,
        at(jerusalem, '2026-11-15T20:00').getTime(),
      ]);
      const [first, , last] = checkInsOf();
      expect(first.content.title).toBe(t('checkin.title', { in: t('checkin.in.shabbat') }));
      expect(last.content.body).toBe(t('checkin.notify.2'));
      // Not a mitzvah reminder: no category, and nothing parses it as one.
      expect(first.content.categoryIdentifier).toBeUndefined();
      expect(notificationTargetFromData(first.content.data, first.identifier)).toBeNull();
    });

    it('sends nothing for a check-in that is finished or has nothing left to mark', async () => {
      setupEnabled(['shacharit']);
      useCompletionsStore.setState({ checkIns: { '2026-11-14': 1 } });
      await scheduleAt(friday);
      expect(checkInsOf()).toHaveLength(0);

      mockState.pending = [];
      useCompletionsStore.setState({ checkIns: {}, completions: { '2026-11-14': { shacharit: 1 } } });
      await scheduleAt(friday);
      expect(checkInsOf()).toHaveLength(0);
    });

    it('marking the last mitzvah withdraws the nudges as finishing does', async () => {
      setupEnabled(['shacharit']);
      await scheduleAt(friday);
      expect(checkInsOf()).toHaveLength(3);
      jest.setSystemTime(at(jerusalem, '2026-11-14T20:00'));
      useCompletionsStore.getState().markDone('shacharit', new Date(2026, 10, 14));
      await settled();
      expect(checkInsOf()).toHaveLength(0);
      expect(shouldSuppressForCompletion({ kind: 'checkin', blockId: '2026-11-14' }, 'checkin:2026-11-14:1')).toBe(
        true,
      );
    });

    it('a mitzvah skipped on the erev is settled, not waiting', async () => {
      setupEnabled(['mincha']);
      // Friday's mincha runs into Shabbat, so it is in the check-in — unless it was skipped.
      useCompletionsStore.setState({
        skipped: { '2026-11-13': { mincha: 1 } },
        completions: { '2026-11-14': { mincha: 1 } },
      });
      await scheduleAt(friday);
      expect(checkInsOf()).toHaveLength(0);
    });

    it('moves the last call ahead of a block that opens the next evening', async () => {
      setupEnabled(['shacharit']);
      // Shabbat 2027-10-09 is followed by erev Yom Kippur: Sunday 20:00 is already Yom Kippur.
      await scheduleAt(at(jerusalem, '2027-10-08T06:00'));
      const yomKippur = HebcalService.holyBlockAt(at(jerusalem, '2027-10-11T12:00'), jerusalem)!;
      const last = checkInsOf().find((p) => p.identifier === 'checkin:2027-10-09:2');
      expect(last).toBeDefined();
      // 20:00 on the location's clock, unless that is already inside Yom Kippur: then half an hour before it.
      expect(triggerOf(last!)).toBeLessThanOrEqual(yomKippur.start.getTime() - 30 * 60_000);
      if (HebcalService.holyBlockAt(at(jerusalem, '2027-10-10T20:00'), jerusalem)) {
        expect(triggerOf(last!)).toBe(yomKippur.start.getTime() - 30 * 60_000);
      }
    });

    it('still sends the last call when the app is rebuilt the morning after', async () => {
      setupEnabled(['shacharit']);
      await scheduleAt(at(jerusalem, '2026-11-15T10:00'));
      expect(checkInsOf().map((p) => p.identifier)).toEqual(['checkin:2026-11-14:2']);
    });

    it('finishing the check-in withdraws its nudges from the schedule and the tray, and silences any in flight', async () => {
      setupEnabled(['shacharit']);
      await scheduleAt(friday);
      mockState.presented = [
        {
          request: {
            identifier: 'checkin:2026-11-14:0',
            content: { data: { kind: 'checkin', blockId: '2026-11-14' } },
          },
        },
      ];
      const data = { kind: 'checkin' as const, blockId: '2026-11-14' };
      expect(shouldSuppressForCompletion(data, 'checkin:2026-11-14:1')).toBe(false);

      // Through the store alone: its queued side effect must reach the scheduler.
      useCompletionsStore.getState().finishCheckIn('2026-11-14');
      await settled();

      expect(checkInsOf()).toHaveLength(0);
      expect(mockDismiss).toHaveBeenCalledWith('checkin:2026-11-14:0');
      expect(shouldSuppressForCompletion(data, 'checkin:2026-11-14:1')).toBe(true);
      expect(mockState.pending.some((p) => p.identifier.startsWith('shacharit__'))).toBe(true);
    });
  });
});
