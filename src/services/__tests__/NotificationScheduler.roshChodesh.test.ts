jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

type ScheduleInput = {
  identifier: string;
  content: {
    title?: string;
    body?: string;
    data: Record<string, unknown>;
    categoryIdentifier?: string;
  };
  trigger?: { type: string; date: Date; channelId?: string };
};

const mockState: { pending: ScheduleInput[] } = { pending: [] };
const mockSchedule = jest.fn(async (input: ScheduleInput) => {
  mockState.pending = mockState.pending.filter((p) => p.identifier !== input.identifier);
  mockState.pending.push(input);
  return input.identifier;
});

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: (i: unknown) => mockSchedule(i as ScheduleInput),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {
    mockState.pending = [];
  }),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  getAllScheduledNotificationsAsync: jest.fn(async () => mockState.pending),
  getPresentedNotificationsAsync: jest.fn(async () => []),
  dismissNotificationAsync: jest.fn(async () => {}),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => ({})),
  setNotificationCategoryAsync: jest.fn(async () => ({})),
  registerTaskAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  AndroidImportance: { HIGH: 'high', DEFAULT: 'default' },
  AndroidNotificationVisibility: { PUBLIC: 'public', PRIVATE: 'private' },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  getStatusAsync: jest.fn(),
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
}));

import { HDate, months } from '@hebcal/core';
import { DateTime } from 'luxon';
import { NotificationScheduler, initNotificationHandlers } from '../NotificationScheduler';
import { useUserStore } from '@/stores/useUserStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { CITIES } from '@/data/cities';
import { at, zmanimFor } from '@/testing/zmanim';
import { t } from '@/i18n';

const JERUSALEM = CITIES[0];
const THURSDAY = at(JERUSALEM, '2026-10-08T12:00'); // 27 Tishrei 5787

beforeAll(() => {
  jest.useFakeTimers({
    now: THURSDAY,
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
afterEach(() => jest.setSystemTime(THURSDAY));

const shkiaOn = (iso: string) => zmanimFor(at(JERUSALEM, `${iso}T12:00`), JERUSALEM).shkia;
const noticeIds = () =>
  mockState.pending.filter((p) => p.identifier.startsWith('roshChodesh:')).map((p) => p.identifier);
const pendingOf = (identifier: string) => mockState.pending.find((p) => p.identifier === identifier)!;
const weekday = (iso: string, locale: 'he' | 'en' = 'he') => DateTime.fromISO(iso).setLocale(locale).toFormat('cccc');
const dayAbs = (day: number, month: number, year = 5787) => new HDate(day, month, year).abs();
const idOf = (abs: number, when: 'before' | 'evening' | 'day') => `roshChodesh:${abs}:${when}`;
const blockLines = (identifier: string) => pendingOf(identifier).content.body!.split('\n');
const rebuildAt = async (wallClock: string) => {
  jest.setSystemTime(at(JERUSALEM, wallClock));
  await NotificationScheduler.rebuild();
};

const TISHREI_30 = dayAbs(30, months.TISHREI);
const CHESHVAN_1 = dayAbs(1, months.CHESHVAN);
const NISAN_1 = dayAbs(1, months.NISAN);

describe('NotificationScheduler Rosh Chodesh notices', () => {
  beforeEach(() => {
    mockState.pending = [];
    mockSchedule.mockClear();
    useCompletionsStore.setState({ completions: {}, skipped: {}, checkIns: {}, archivedDays: [] });
    useUserStore.getState().reset();
    useUserStore.getState().setNotificationPermission('granted');
    useUserStore.getState().setLocation(JERUSALEM);
    useUserStore.getState().setRoshChodeshEnabled(true);
    const disabled = Object.fromEntries(
      Object.keys(useMitzvotStore.getState().activeMitzvot).map((id) => [id, { enabled: false }]),
    );
    useMitzvotStore.setState({ activeMitzvot: disabled });
  });

  it('1 schedules nothing while the setting is off', async () => {
    useUserStore.getState().setRoshChodeshEnabled(false);
    await NotificationScheduler.rebuild();
    expect(noticeIds()).toEqual([]);
  });

  it('2 notifies three days before at 20:00 and on the day at 07:00, with no mark-done button', async () => {
    await NotificationScheduler.rebuild();

    expect(noticeIds()).toEqual([idOf(CHESHVAN_1, 'before'), idOf(TISHREI_30, 'day')]);

    const before = pendingOf(idOf(CHESHVAN_1, 'before'));
    expect(before.trigger!.date.getTime()).toBe(at(JERUSALEM, '2026-10-08T20:00').getTime());
    expect(before.trigger!.channelId).toBe('rosh-chodesh');
    expect(before.content.title).toBe('ראש חודש חשון בעוד שלושה ימים');
    expect(before.content.body).toBe(`נכנס ב${weekday('2026-10-10')} בשקיעה.`);
    expect(before.content.body).toBe('נכנס ביום שבת בשקיעה.');
    expect(before.content.categoryIdentifier).toBeUndefined();
    expect(before.content.data).toEqual({ kind: 'roshChodesh', roshChodesh: { day: CHESHVAN_1, when: 'before' } });

    const day = pendingOf(idOf(TISHREI_30, 'day'));
    expect(day.trigger!.date.getTime()).toBe(at(JERUSALEM, '2026-10-11T07:00').getTime());
    expect(day.trigger!.channelId).toBe('rosh-chodesh');
    expect(day.content.title).toBe('היום ראש חודש חשון');
    expect(day.content.body).toBe('יעלה ויבוא, הלל ומוסף בשחרית.');
    expect(day.content.categoryIdentifier).toBeUndefined();
    expect(day.content.data).toEqual({ kind: 'roshChodesh', roshChodesh: { day: TISHREI_30, when: 'day' } });
  });

  it('3 leaves the evening notice out when it would fall inside Shabbat and names it in the pre-block notice', async () => {
    await NotificationScheduler.rebuild();

    expect(noticeIds()).not.toContain(idOf(CHESHVAN_1, 'evening'));
    expect(blockLines('blockNotice:2026-10-10')).toContain(
      t('holyBlock.notice.roshChodeshOn', { month: 'חשון', day: weekday('2026-10-10') }),
    );
    expect(blockLines('blockNotice:2026-10-10')).toContain('ראש חודש חשון נכנס ביום שבת בשקיעה');
  });

  it('4 fires the notice of the day on both days of a two-day Rosh Chodesh', async () => {
    await rebuildAt('2026-10-11T06:00');

    expect(noticeIds()).toEqual([idOf(TISHREI_30, 'day'), idOf(CHESHVAN_1, 'day')]);
    expect(pendingOf(idOf(TISHREI_30, 'day')).trigger!.date.getTime()).toBe(
      at(JERUSALEM, '2026-10-11T07:00').getTime(),
    );
    expect(pendingOf(idOf(CHESHVAN_1, 'day')).trigger!.date.getTime()).toBe(
      at(JERUSALEM, '2026-10-12T07:00').getTime(),
    );
    expect(pendingOf(idOf(CHESHVAN_1, 'day')).content.title).toBe('היום ראש חודש חשון');
    expect(pendingOf(idOf(CHESHVAN_1, 'day')).content.data).toEqual({
      kind: 'roshChodesh',
      roshChodesh: { day: CHESHVAN_1, when: 'day' },
    });
  });

  it('5 keeps only the second day once the first has begun', async () => {
    await rebuildAt('2026-10-11T12:00');
    expect(noticeIds()).toEqual([idOf(CHESHVAN_1, 'day')]);
  });

  it('6 drops a notice whose time has passed', async () => {
    await rebuildAt('2026-10-08T21:00');
    expect(noticeIds()).toEqual([idOf(TISHREI_30, 'day')]);
  });

  it('7 words the notices and the pre-block line in English in the English UI', async () => {
    useUserStore.getState().setLanguage('en');
    await NotificationScheduler.rebuild();

    const before = pendingOf(idOf(CHESHVAN_1, 'before'));
    expect(before.content.title).toBe('Rosh Chodesh Cheshvan in three days');
    expect(before.content.body).toBe('It begins on Saturday at sunset.');
    expect(pendingOf(idOf(TISHREI_30, 'day')).content.title).toBe('Today is Rosh Chodesh Cheshvan');
    expect(blockLines('blockNotice:2026-10-10')).toContain('Rosh Chodesh Cheshvan begins on Saturday at sunset');
  });

  it('8 leaves the pre-block notice without Rosh Chodesh lines while the setting is off', async () => {
    useUserStore.getState().setRoshChodeshEnabled(false);
    await NotificationScheduler.rebuild();
    expect(blockLines('blockNotice:2026-10-10')).toHaveLength(1);
  });

  describe('a one-day Rosh Chodesh', () => {
    it('9 leads on the weekday it enters, fires the evening notice at shkia and one notice on the day', async () => {
      await rebuildAt('2027-04-05T12:00');
      expect(noticeIds()).toEqual([idOf(NISAN_1, 'before')]);
      expect(pendingOf(idOf(NISAN_1, 'before')).trigger!.date.getTime()).toBe(
        at(JERUSALEM, '2027-04-05T20:00').getTime(),
      );
      expect(pendingOf(idOf(NISAN_1, 'before')).content.body).toBe(`נכנס ב${weekday('2027-04-07')} בשקיעה.`);
      expect(pendingOf(idOf(NISAN_1, 'before')).content.title).toBe('ראש חודש ניסן בעוד שלושה ימים');

      await rebuildAt('2027-04-07T12:00');
      expect(noticeIds()).toEqual([idOf(NISAN_1, 'evening'), idOf(NISAN_1, 'day')]);
      const evening = pendingOf(idOf(NISAN_1, 'evening'));
      expect(evening.trigger!.date.getTime()).toBe(shkiaOn('2027-04-07').getTime());
      expect(evening.trigger!.channelId).toBe('rosh-chodesh');
      expect(evening.content.title).toBe('הערב נכנס ראש חודש ניסן');
      expect(evening.content.body).toBe('יעלה ויבוא בתפילה ובברכת המזון מהערב.');
      expect(evening.content.data).toEqual({ kind: 'roshChodesh', roshChodesh: { day: NISAN_1, when: 'evening' } });
      expect(pendingOf(idOf(NISAN_1, 'day')).trigger!.date.getTime()).toBe(at(JERUSALEM, '2027-04-08T07:00').getTime());
      expect(pendingOf(idOf(NISAN_1, 'day')).content.data).toEqual({
        kind: 'roshChodesh',
        roshChodesh: { day: NISAN_1, when: 'day' },
      });

      await rebuildAt('2027-04-08T12:00');
      expect(noticeIds()).toEqual([]);
    });
  });

  describe('a Rosh Chodesh on Shabbat', () => {
    it('10 fires nothing inside the block and names the month, entering tonight and falling on Shabbat, in the pre-block notice', async () => {
      await rebuildAt('2027-01-08T06:00');

      expect(noticeIds()).toEqual([]);
      expect(blockLines('blockNotice:2027-01-09').slice(1)).toEqual([
        t('holyBlock.notice.roshChodeshTonight', { month: 'שבט' }),
        t('holyBlock.notice.roshChodeshDay', { month: 'שבט', day: weekday('2027-01-09') }),
      ]);
      expect(blockLines('blockNotice:2027-01-09').slice(1)).toEqual([
        'הלילה נכנס ראש חודש שבט',
        'ראש חודש שבט ביום שבת',
      ]);
    });
  });

  describe('a lead notice swallowed by Shabbat', () => {
    const TAMUZ_1 = dayAbs(1, months.TAMUZ); // Rosh Chodesh Tamuz begins Sunday evening 2027-07-04

    it('11 moves from Friday 20:00 into the pre-block notice and keeps the evening notice', async () => {
      await rebuildAt('2027-07-02T06:00');

      expect(noticeIds()).toEqual([idOf(TAMUZ_1, 'evening')]);
      expect(pendingOf(idOf(TAMUZ_1, 'evening')).trigger!.date.getTime()).toBe(shkiaOn('2027-07-04').getTime());
      expect(blockLines('blockNotice:2027-07-03')).toContain(
        t('holyBlock.notice.roshChodeshOn', { month: 'תמוז', day: weekday('2027-07-04') }),
      );
    });
  });

  it('12 writes the two Adars of a leap year apart', async () => {
    await rebuildAt('2027-02-07T06:00');
    const adarI = dayAbs(1, months.ADAR_I);
    expect(noticeIds()).toEqual([idOf(dayAbs(30, months.SHVAT), 'day'), idOf(adarI, 'day')]);
    expect(pendingOf(idOf(adarI, 'day')).content.title).toBe('היום ראש חודש אדר א׳');

    await rebuildAt('2027-03-09T06:00');
    const adarII = dayAbs(1, months.ADAR_II);
    expect(noticeIds()).toEqual([idOf(dayAbs(30, months.ADAR_I), 'day'), idOf(adarII, 'day')]);
    expect(pendingOf(idOf(adarII, 'day')).content.title).toBe('היום ראש חודש אדר ב׳');
  });

  it('13 rebuilds when the setting is switched, and the teardown unsubscribes', () => {
    const rebuild = jest.spyOn(NotificationScheduler, 'rebuild').mockResolvedValue();
    const teardown = initNotificationHandlers();
    rebuild.mockClear();

    useUserStore.getState().setRoshChodeshEnabled(false);
    expect(rebuild).toHaveBeenCalledTimes(1);
    useUserStore.getState().setRoshChodeshEnabled(true);
    expect(rebuild).toHaveBeenCalledTimes(2);

    teardown();
    useUserStore.getState().setRoshChodeshEnabled(false);
    expect(rebuild).toHaveBeenCalledTimes(2);
    rebuild.mockRestore();
  });
});
