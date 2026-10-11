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
    autoDismiss?: boolean;
    sticky?: boolean;
    sound?: string;
  };
  trigger?: { type: string; date: Date; channelId?: string };
};

const mockState: {
  pending: ScheduleInput[];
  presented: { request: { identifier: string; content: { data?: Record<string, unknown> } } }[];
} = { pending: [], presented: [] };
const mockSchedule = jest.fn(async (input: ScheduleInput) => {
  mockState.pending = mockState.pending.filter((p) => p.identifier !== input.identifier);
  mockState.pending.push(input);
  return input.identifier;
});
const mockCancelAll = jest.fn(async () => {
  mockState.pending = [];
});
const mockDismiss = jest.fn(async (_id: string) => {});
const mockSetCategory = jest.fn<Promise<unknown>, [string, unknown[]]>(async () => ({}));

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: (i: unknown) => mockSchedule(i as ScheduleInput),
  cancelAllScheduledNotificationsAsync: () => mockCancelAll(),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  getAllScheduledNotificationsAsync: jest.fn(async () => mockState.pending),
  getPresentedNotificationsAsync: jest.fn(async () => mockState.presented),
  dismissNotificationAsync: (id: string) => mockDismiss(id),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => ({})),
  setNotificationCategoryAsync: (identifier: string, actions: unknown[]) => mockSetCategory(identifier, actions),
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

import { HDate } from '@hebcal/core';
import { DateTime } from 'luxon';
import {
  MARK_DONE_ACTION,
  NotificationScheduler,
  PendingNotificationMeta,
  SCHEDULE_FORMAT_KEY,
  TAHARAH_BEDIKA_CATEGORY,
  TAHARAH_KIND,
  dismissCompletedPresentedNotifications,
  initNotificationHandlers,
  markDoneFromNotificationData,
  shouldSuppressForCompletion,
  taharahNotificationSettled,
} from '../NotificationScheduler';
import { StorageService } from '@/services/StorageService';
import { HebcalService } from '@/services/HebcalService';
import { useUserStore } from '@/stores/useUserStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { useTaharahStore } from '@/stores/useTaharahStore';
import { CITIES } from '@/data/cities';
import { at, zmanimFor } from '@/testing/zmanim';
import { t } from '@/i18n';
import type { TaharahEventInput } from '@/stores/useTaharahStore';

const JERUSALEM = CITIES[0];
const PINNED_NOW = at(JERUSALEM, '2026-11-11T06:00'); // a plain Wednesday in Cheshvan

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

const absOf = (year: number, month: number, day: number) => new HDate(new Date(year, month - 1, day)).abs();
const absOn = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return absOf(year, month, day);
};
const zmanimOn = (iso: string) => zmanimFor(at(JERUSALEM, `${iso}T12:00`), JERUSALEM);
const blockOn = (iso: string) => HebcalService.holyBlockOn(at(JERUSALEM, `${iso}T12:00`), JERUSALEM)!;
const clock = (instant: Date) => DateTime.fromJSDate(instant).toFormat('HH:mm');
const minutes = (instant: Date, delta: number) => instant.getTime() + delta * 60_000;

const O = absOf(2026, 11, 8); // Sunday 28 Cheshvan 5787

const taharahPending = () => mockState.pending.filter((p) => p.identifier.startsWith('taharah:'));
const pendingOf = (identifier: string) => mockState.pending.find((p) => p.identifier === identifier);
const triggerOf = (p: ScheduleInput) => p.trigger!.date.getTime();

function record(...events: TaharahEventInput[]) {
  const { addEvent } = useTaharahStore.getState();
  events.forEach((event) => addEvent(event));
}

const bedika = (iso: string, slot: 'morning' | 'evening') =>
  ({ type: 'bedika', day: absOn(iso), slot, result: 'clean' }) as const;

// Cleans the seven days after a hefsek on 2026-11-06 (onset 2026-11-02, the earliest hefsek day being
// the fifth): clean days 2026-11-07 .. 2026-11-13, the first tevila night opening on 2026-11-14.
const SHIVA_NEKIIM = [
  { type: 'onset', onah: { abs: absOf(2026, 11, 2), kind: 'day' } },
  { type: 'hefsek', day: absOf(2026, 11, 6), result: 'clean' },
  bedika('2026-11-07', 'morning'),
] as const satisfies readonly TaharahEventInput[];

const TEVILA_ON_SHABBAT = [
  ...SHIVA_NEKIIM,
  ...['08', '09', '10', '11', '12'].map((day) => bedika(`2026-11-${day}`, 'morning')),
] as const satisfies readonly TaharahEventInput[];

describe('NotificationScheduler taharah reminders', () => {
  beforeEach(() => {
    mockState.pending = [];
    mockState.presented = [];
    mockSchedule.mockClear();
    mockCancelAll.mockClear();
    mockDismiss.mockClear();
    mockSetCategory.mockClear();
    useCompletionsStore.setState({ completions: {}, skipped: {}, checkIns: {}, archivedDays: [] });
    useUserStore.getState().reset();
    useUserStore.getState().setNotificationPermission('granted');
    useUserStore.getState().setLocation(JERUSALEM);
    useUserStore.getState().setTaharahEnabled(true);
    useTaharahStore.getState().reset();
    const disabled = Object.fromEntries(
      Object.keys(useMitzvotStore.getState().activeMitzvot).map((id) => [id, { enabled: false }]),
    );
    useMitzvotStore.setState({ activeMitzvot: disabled });
  });

  it('1 schedules nothing while the feature is off, and the same events schedule once it is on', async () => {
    record({ type: 'onset', onah: { abs: O, kind: 'day' } });
    useUserStore.getState().setTaharahEnabled(false);
    await NotificationScheduler.rebuild();
    expect(taharahPending().map((p) => p.identifier)).toEqual([]);

    useUserStore.getState().setTaharahEnabled(true);
    await NotificationScheduler.rebuild();
    expect(taharahPending().map((p) => p.identifier)).toEqual([`taharah:hefsek:${O + 4}`]);
  });

  it('2 reminds the hefsek on the earliest day, shkia minus the lead, with discreet text', async () => {
    record({ type: 'onset', onah: { abs: O, kind: 'day' } });
    await NotificationScheduler.rebuild();

    const hefsek = taharahPending().filter((p) => p.identifier.startsWith('taharah:hefsek:'));
    expect(hefsek.map((p) => p.identifier)).toEqual([`taharah:hefsek:${absOn('2026-11-12')}`]);
    expect(absOn('2026-11-12')).toBe(O + 4);

    const shkia = zmanimOn('2026-11-12').shkia;
    const [reminder] = hefsek;
    expect(triggerOf(reminder)).toBe(minutes(shkia, -90));
    expect(reminder.trigger!.channelId).toBe('taharah');
    expect(reminder.content.title).toBe(t('taharah.notify.discreetTitle'));
    expect(reminder.content.body).toBe(t('taharah.notify.discreet.untilBody', { time: clock(shkia) }));
    expect(reminder.content.categoryIdentifier).toBeUndefined();
    expect(reminder.content.data).toEqual({ kind: TAHARAH_KIND, taharah: { task: 'hefsek', day: O + 4 } });
  });

  it('3 spells the hefsek out when discreet notifications are off', async () => {
    record({ type: 'onset', onah: { abs: O, kind: 'day' } });
    useTaharahStore.getState().setDiscreetNotifications(false);
    await NotificationScheduler.rebuild();

    const reminder = pendingOf(`taharah:hefsek:${O + 4}`)!;
    expect(reminder.content.title).toBe(t('taharah.notify.title.hefsek'));
    expect(reminder.content.body).toBe(t('taharah.notify.body.hefsek', { time: clock(zmanimOn('2026-11-12').shkia) }));
  });

  describe('Friday', () => {
    it('4 moves the hefsek reminders that would fall inside Shabbat to one reminder ten minutes before candle lighting', async () => {
      jest.setSystemTime(at(JERUSALEM, '2026-11-13T06:00'));
      record({ type: 'onset', onah: { abs: O - 1, kind: 'day' } });
      useTaharahStore.getState().setLeads({ hefsekLeadMin: 5 });
      useTaharahStore.getState().setDiscreetNotifications(false);
      await NotificationScheduler.rebuild();

      const shkia = zmanimOn('2026-11-13').shkia;
      const block = HebcalService.holyBlockAt(shkia, JERUSALEM)!;
      expect(minutes(shkia, -5)).toBeGreaterThan(block.start.getTime());

      expect(pendingOf(`taharah:hefsek:${absOn('2026-11-13')}`)).toBeUndefined();
      expect(pendingOf(`taharah:hefsek:${absOn('2026-11-14')}`)).toBeUndefined();
      const merged = pendingOf('taharah:preBlock:2026-11-14')!;
      expect(triggerOf(merged)).toBe(minutes(block.start, -10));
      expect(merged.content.body).toBe(t('taharah.notify.title.hefsek'));
      expect(pendingOf(`taharah:hefsek:${absOn('2026-11-15')}`)).toBeDefined();
      expect(
        taharahPending().filter((p) => triggerOf(p) > block.start.getTime() && triggerOf(p) < block.end.getTime()),
      ).toEqual([]);
    });

    it('4b keeps the lead when the reminder still falls before candle lighting', async () => {
      jest.setSystemTime(at(JERUSALEM, '2026-11-13T06:00'));
      record({ type: 'onset', onah: { abs: O - 1, kind: 'day' } });
      await NotificationScheduler.rebuild();

      const friday = pendingOf(`taharah:hefsek:${absOn('2026-11-13')}`)!;
      expect(triggerOf(friday)).toBe(minutes(zmanimOn('2026-11-13').shkia, -90));
    });
  });

  describe('shiva nekiim', () => {
    it('5 reminds the morning and evening bedika of today, until one is marked', async () => {
      record(...SHIVA_NEKIIM);
      await NotificationScheduler.rebuild();

      const today = absOn('2026-11-11');
      const { netzHaChama, shkia } = zmanimOn('2026-11-11');
      const morning = pendingOf(`taharah:bedikaMorning:${today}`)!;
      const evening = pendingOf(`taharah:bedikaEvening:${today}`)!;
      expect(triggerOf(morning)).toBe(minutes(netzHaChama, 30));
      expect(triggerOf(evening)).toBe(minutes(shkia, -60));
      expect(morning.content.categoryIdentifier).toBe(TAHARAH_BEDIKA_CATEGORY);
      expect(evening.content.categoryIdentifier).toBe(TAHARAH_BEDIKA_CATEGORY);
      expect(morning.trigger!.channelId).toBe('taharah');
      expect(evening.trigger!.channelId).toBe('taharah');
      expect(morning.content.data).toEqual({ kind: TAHARAH_KIND, taharah: { task: 'bedikaMorning', day: today } });
      expect(mockSetCategory).toHaveBeenCalledWith(TAHARAH_BEDIKA_CATEGORY, [
        {
          identifier: MARK_DONE_ACTION,
          buttonTitle: t('taharah.notify.markDone'),
          options: { opensAppToForeground: false },
        },
      ]);

      useTaharahStore.getState().addEvent(bedika('2026-11-11', 'morning'));
      await NotificationScheduler.rebuild();
      expect(pendingOf(`taharah:bedikaMorning:${today}`)).toBeUndefined();
      expect(pendingOf(`taharah:bedikaEvening:${today}`)).toBeDefined();
    });

    it('5b names the clean day in the title and body when discreet notifications are off', async () => {
      record(...SHIVA_NEKIIM);
      useTaharahStore.getState().setDiscreetNotifications(false);
      await NotificationScheduler.rebuild();

      const today = absOn('2026-11-11');
      const shkia = zmanimOn('2026-11-11').shkia;
      const morning = pendingOf(`taharah:bedikaMorning:${today}`)!;
      const evening = pendingOf(`taharah:bedikaEvening:${today}`)!;
      expect(morning.content.title).toBe(t('taharah.notify.title.bedikaMorning', { day: 5 }));
      expect(morning.content.body).toBe(t('taharah.notify.body.bedikaMorning', { day: 5 }));
      expect(evening.content.title).toBe(t('taharah.notify.title.bedikaEvening', { day: 5 }));
      expect(evening.content.body).toBe(t('taharah.notify.body.bedikaEvening', { time: clock(shkia) }));
    });

    it('5c uses the evening lead from the store', async () => {
      record(...SHIVA_NEKIIM);
      useTaharahStore.getState().setLeads({ bedikaEveningLeadMin: 20 });
      await NotificationScheduler.rebuild();

      const evening = pendingOf(`taharah:bedikaEvening:${absOn('2026-11-11')}`)!;
      expect(triggerOf(evening)).toBe(minutes(zmanimOn('2026-11-11').shkia, -20));
    });
  });

  describe('tevila on Shabbat', () => {
    beforeEach(() => jest.setSystemTime(at(JERUSALEM, '2026-11-12T06:00')));

    it('6 replaces the tevila reminder with a preparation reminder before candle lighting', async () => {
      record(...TEVILA_ON_SHABBAT);
      useTaharahStore.getState().setDiscreetNotifications(false);
      await NotificationScheduler.rebuild();

      const night = absOn('2026-11-14');
      const block = blockOn('2026-11-14');
      const tzeit = zmanimOn('2026-11-13').tzeitHakochavim;
      expect(tzeit.getTime()).toBeGreaterThan(block.start.getTime());
      expect(tzeit.getTime()).toBeLessThan(block.end.getTime());

      expect(pendingOf(`taharah:tevila:${night}`)).toBeUndefined();
      expect(triggerOf(pendingOf(`taharah:tevila:${night + 1}`)!)).toBe(block.end.getTime());
      const prep = pendingOf(`taharah:tevilaPrep:${night}`)!;
      expect(triggerOf(prep)).toBe(minutes(tzeit, -180));
      expect(triggerOf(prep)).toBeLessThan(block.start.getTime());
      expect(prep.content.title).toBe(t('taharah.notify.title.tevilaPrep'));
      expect(prep.content.body).toBe(t('taharah.notify.body.tevilaPrepShabbat', { time: clock(block.start) }));
      expect(prep.content.categoryIdentifier).toBeUndefined();
      expect(prep.content.data).toEqual({ kind: TAHARAH_KIND, taharah: { task: 'tevilaPrep', day: night } });
    });

    it('6b merges preparation leads that fall inside Shabbat into one reminder ten minutes before candle lighting', async () => {
      record(...TEVILA_ON_SHABBAT);
      useTaharahStore.getState().setDiscreetNotifications(false);
      useTaharahStore.getState().setLeads({ tevilaPrepLeadMin: 10 });
      await NotificationScheduler.rebuild();

      const block = blockOn('2026-11-14');
      expect(minutes(zmanimOn('2026-11-13').tzeitHakochavim, -10)).toBeGreaterThan(block.start.getTime());
      expect(pendingOf(`taharah:tevilaPrep:${absOn('2026-11-14')}`)).toBeUndefined();
      expect(pendingOf(`taharah:tevilaPrep:${absOn('2026-11-15')}`)).toBeUndefined();
      const merged = pendingOf('taharah:preBlock:2026-11-14')!;
      expect(triggerOf(merged)).toBe(minutes(block.start, -10));
      expect(merged.content.body).toBe(t('taharah.notify.title.tevilaPrep'));
    });

    it('6c shows only the deadline in discreet mode', async () => {
      record(...TEVILA_ON_SHABBAT);
      await NotificationScheduler.rebuild();

      const prep = pendingOf(`taharah:tevilaPrep:${absOn('2026-11-14')}`)!;
      expect(prep.content.title).toBe(t('taharah.notify.discreetTitle'));
      expect(prep.content.body).toBe(
        t('taharah.notify.discreet.untilBody', { time: clock(blockOn('2026-11-14').start) }),
      );
    });
  });

  it('6d keeps both the preparation and the tevila reminder on an ordinary night', async () => {
    jest.setSystemTime(at(JERUSALEM, '2026-11-11T06:00'));
    record(
      { type: 'onset', onah: { abs: absOf(2026, 10, 31), kind: 'day' } },
      { type: 'hefsek', day: absOf(2026, 11, 4), result: 'clean' },
      bedika('2026-11-05', 'morning'),
      bedika('2026-11-06', 'morning'),
      bedika('2026-11-07', 'morning'),
      bedika('2026-11-08', 'morning'),
      bedika('2026-11-09', 'morning'),
      bedika('2026-11-10', 'morning'),
    );
    useTaharahStore.getState().setDiscreetNotifications(false);
    await NotificationScheduler.rebuild();

    const night = absOn('2026-11-12');
    const tzeit = zmanimOn('2026-11-11').tzeitHakochavim;
    const prep = pendingOf(`taharah:tevilaPrep:${night}`)!;
    const tevila = pendingOf(`taharah:tevila:${night}`)!;
    expect(triggerOf(prep)).toBe(minutes(tzeit, -180));
    expect(triggerOf(tevila)).toBe(tzeit.getTime());
    expect(prep.content.body).toBe(t('taharah.notify.body.tevilaPrep', { time: clock(tzeit) }));
    expect(tevila.content.title).toBe(t('taharah.notify.title.tevila'));
    expect(tevila.content.body).toBe(t('taharah.notify.body.tevila', { time: clock(tzeit) }));
    expect(tevila.content.categoryIdentifier).toBeUndefined();
  });

  describe('perisha', () => {
    const P = absOf(2026, 9, 15);
    const L = absOf(2026, 10, 13);

    function seedCompletedCycle() {
      record(
        { type: 'onset', onah: { abs: P, kind: 'day' } },
        { type: 'onset', onah: { abs: L, kind: 'day' } },
        { type: 'hefsek', day: L + 4, result: 'clean' },
        ...[5, 6, 7, 8, 9, 10, 11].map((offset): TaharahEventInput => ({
          type: 'bedika',
          day: L + offset,
          slot: 'morning',
          result: 'clean',
        })),
        { type: 'tevila', day: L + 12 },
      );
    }

    it('7 reminds the onah beinonit at its start and a required bedika before it ends', async () => {
      seedCompletedCycle();
      useTaharahStore.getState().setDiscreetNotifications(false);
      await NotificationScheduler.rebuild();

      const today = absOn('2026-11-11');
      expect(today).toBe(L + 29);
      const { netzHaChama, shkia } = zmanimOn('2026-11-11');
      expect(netzHaChama.getTime()).toBeGreaterThan(PINNED_NOW.getTime());

      const perisha = pendingOf(`taharah:perisha:${today}:day`)!;
      expect(triggerOf(perisha)).toBe(netzHaChama.getTime());
      expect(perisha.content.title).toBe(t('taharah.notify.title.perisha'));
      expect(perisha.content.body).toContain(t('taharah.reason.onahBeinonit'));
      expect(perisha.content.body).toBe(
        t('taharah.notify.body.perisha', { reasons: t('taharah.reason.onahBeinonit'), time: clock(shkia) }),
      );
      expect(perisha.content.data).toEqual({
        kind: TAHARAH_KIND,
        taharah: { task: 'perisha', day: today, onah: 'day' },
      });
      expect(perisha.content.categoryIdentifier).toBeUndefined();

      const veset = pendingOf(`taharah:bedikaVeset:${today}:day`)!;
      expect(triggerOf(veset)).toBe(minutes(shkia, -60));
      expect(veset.content.title).toBe(t('taharah.notify.title.bedikaVeset'));
      expect(veset.content.body).toBe(t('taharah.notify.body.bedikaVeset', { time: clock(shkia) }));
      expect(veset.content.data).toEqual({
        kind: TAHARAH_KIND,
        taharah: { task: 'bedikaVeset', day: today, onah: 'day' },
      });
    });

    it('7e defers a perisha night that opens at motzaei Shabbat shkia to the block end instead of pulling it before Shabbat', async () => {
      jest.setSystemTime(at(JERUSALEM, '2026-11-13T06:00'));
      const N = absOf(2026, 11, 15);
      record(
        { type: 'onset', onah: { abs: N - 29 - 28, kind: 'night' } },
        { type: 'onset', onah: { abs: N - 29, kind: 'night' } },
        { type: 'hefsek', day: N - 25, result: 'clean' },
        ...[24, 23, 22, 21, 20, 19, 18].map((back): TaharahEventInput => ({
          type: 'bedika',
          day: N - back,
          slot: 'morning',
          result: 'clean',
        })),
        { type: 'tevila', day: N - 17 },
      );
      await NotificationScheduler.rebuild();

      const block = blockOn('2026-11-14');
      const night = pendingOf(`taharah:perisha:${N}:night`)!;
      expect(night).toBeDefined();
      expect(triggerOf(night)).toBe(block.end.getTime());
      expect(pendingOf('taharah:preBlock:2026-11-14')?.content.body ?? '').not.toContain(
        t('taharah.notify.title.perisha'),
      );
      expect(
        taharahPending().filter((p) => triggerOf(p) > block.start.getTime() && triggerOf(p) < block.end.getTime()),
      ).toEqual([]);
    });

    it('7b asks for no bedika on an onah that is only a haflaga', async () => {
      seedCompletedCycle();
      jest.setSystemTime(at(JERUSALEM, '2026-11-10T05:00'));
      await NotificationScheduler.rebuild();

      expect(L + 28).toBe(absOn('2026-11-10'));
      expect(pendingOf(`taharah:perisha:${L + 28}:day`)).toBeDefined();
      expect(pendingOf(`taharah:bedikaVeset:${L + 28}:day`)).toBeUndefined();
      expect(pendingOf(`taharah:bedikaVeset:${L + 29}:day`)).toBeDefined();
    });

    it('7d adds the disputed line when the yom hachodesh is in dispute', async () => {
      const onset = absOf(2026, 6, 15); // 30 Sivan, followed by a 29-day Tammuz
      record(
        { type: 'onset', onah: { abs: onset, kind: 'day' } },
        { type: 'hefsek', day: onset + 4, result: 'clean' },
        ...[5, 6, 7, 8, 9, 10, 11].map((offset): TaharahEventInput => ({
          type: 'bedika',
          day: onset + offset,
          slot: 'morning',
          result: 'clean',
        })),
        { type: 'tevila', day: onset + 12 },
      );
      useTaharahStore.getState().setDiscreetNotifications(false);
      jest.setSystemTime(at(JERUSALEM, '2026-07-15T04:00'));
      await NotificationScheduler.rebuild();

      const day = absOn('2026-07-15');
      expect(day).toBe(onset + 30);
      const perisha = pendingOf(`taharah:perisha:${day}:day`)!;
      const reasons = `${t('taharah.reason.yomHachodesh')} · ${t('taharah.reason.onahBeinonit')}`;
      expect(perisha.content.body).toBe(
        `${t('taharah.notify.body.perisha', { reasons, time: clock(zmanimOn('2026-07-15').shkia) })}
${t('taharah.disputed')}`,
      );
    });

    it('7c asks at ten o clock whether the period arrived on the furthest onah beinonit day', async () => {
      seedCompletedCycle();
      jest.setSystemTime(at(JERUSALEM, '2026-11-13T05:00'));
      await NotificationScheduler.rebuild();

      const expected = pendingOf(`taharah:expectOnset:${L + 31}`)!;
      expect(L + 31).toBe(absOn('2026-11-13'));
      expect(triggerOf(expected)).toBe(at(JERUSALEM, '2026-11-13T10:00').getTime());
      expect(expected.content.body).toBe(t('taharah.notify.discreet.body'));
    });
  });

  describe('husband', () => {
    it('8 gets no bedika reminders but keeps the tevila ones', async () => {
      record(...SHIVA_NEKIIM);
      await NotificationScheduler.rebuild();
      expect(taharahPending().some((p) => p.identifier.startsWith('taharah:bedika'))).toBe(true);

      useTaharahStore.getState().setRole('husband');
      await NotificationScheduler.rebuild();
      expect(taharahPending().filter((p) => p.identifier.startsWith('taharah:bedika'))).toEqual([]);

      jest.setSystemTime(at(JERUSALEM, '2026-11-12T06:00'));
      record(...TEVILA_ON_SHABBAT.slice(3));
      await NotificationScheduler.rebuild();
      expect(pendingOf(`taharah:tevilaPrep:${absOn('2026-11-14')}`)).toBeDefined();
    });
  });

  describe('marking from the notification', () => {
    const today = () => absOn('2026-11-11');
    const morning = (): PendingNotificationMeta => ({
      kind: TAHARAH_KIND,
      taharah: { task: 'bedikaMorning', day: today() },
    });
    const evening = (): PendingNotificationMeta => ({
      kind: TAHARAH_KIND,
      taharah: { task: 'bedikaEvening', day: today() },
    });

    it('9 records a clean bedika and settles the notification', async () => {
      record(...SHIVA_NEKIIM);
      expect(shouldSuppressForCompletion(morning())).toBe(false);
      expect(taharahNotificationSettled(morning())).toBe(false);

      const eventsBefore = useTaharahStore.getState().events.length;
      const handled = await markDoneFromNotificationData(morning(), `taharah:bedikaMorning:${today()}`);

      expect(handled).toBe(true);
      const { events } = useTaharahStore.getState();
      expect(events).toHaveLength(eventsBefore + 1);
      expect(events[events.length - 1]).toMatchObject({
        type: 'bedika',
        day: today(),
        slot: 'morning',
        result: 'clean',
      });
      expect(mockDismiss).toHaveBeenCalledWith(`taharah:bedikaMorning:${today()}`);
      expect(shouldSuppressForCompletion(morning())).toBe(true);
      expect(shouldSuppressForCompletion(evening())).toBe(false);
    });

    it('9b does not record the same bedika twice', async () => {
      record(...SHIVA_NEKIIM);
      await markDoneFromNotificationData(morning(), 'a');
      const count = useTaharahStore.getState().events.length;

      expect(await markDoneFromNotificationData(morning(), 'a')).toBe(true);
      expect(useTaharahStore.getState().events).toHaveLength(count);
    });

    it('9c leaves a result recorded in the app alone', async () => {
      record(...SHIVA_NEKIIM, { type: 'bedika', day: today(), slot: 'evening', result: 'doubtful' });
      const count = useTaharahStore.getState().events.length;

      await markDoneFromNotificationData(evening(), 'a');
      expect(useTaharahStore.getState().events).toHaveLength(count);
    });

    it('9d never marks a hefsek or a tevila from a notification', async () => {
      record({ type: 'onset', onah: { abs: O, kind: 'day' } });
      const count = useTaharahStore.getState().events.length;

      for (const task of [
        'hefsek',
        'tevila',
        'tevilaPrep',
        'perisha',
        'bedikaVeset',
        'expectOnset',
        'postBlock',
        'preBlock',
      ] as const) {
        expect(await markDoneFromNotificationData({ kind: TAHARAH_KIND, taharah: { task, day: O + 4 } }, 'x')).toBe(
          false,
        );
      }
      expect(useTaharahStore.getState().events).toHaveLength(count);
    });

    it('9e clears a settled notification from the tray', async () => {
      record(...SHIVA_NEKIIM, bedika('2026-11-11', 'morning'));
      mockState.presented = [
        {
          request: {
            identifier: `taharah:bedikaMorning:${today()}`,
            content: { data: morning() as Record<string, unknown> },
          },
        },
        {
          request: {
            identifier: `taharah:bedikaEvening:${today()}`,
            content: { data: evening() as Record<string, unknown> },
          },
        },
      ];

      await dismissCompletedPresentedNotifications();

      expect(mockDismiss.mock.calls.map(([id]) => id)).toEqual([`taharah:bedikaMorning:${today()}`]);
    });
  });

  describe('settled notifications', () => {
    it('10a holds a hefsek reminder until a hefsek is recorded', () => {
      record({ type: 'onset', onah: { abs: O, kind: 'day' } });
      const reminder: PendingNotificationMeta = { kind: TAHARAH_KIND, taharah: { task: 'hefsek', day: O + 4 } };
      expect(taharahNotificationSettled(reminder)).toBe(false);

      record({ type: 'hefsek', day: O + 4, result: 'clean' });
      expect(taharahNotificationSettled(reminder)).toBe(true);
    });

    it('10b holds a tevila reminder until the tevila is recorded, and never settles a perisha', () => {
      record(...TEVILA_ON_SHABBAT);
      const night = absOn('2026-11-14');
      jest.setSystemTime(at(JERUSALEM, '2026-11-12T06:00'));
      const tevila: PendingNotificationMeta = { kind: TAHARAH_KIND, taharah: { task: 'tevila', day: night } };
      const perisha: PendingNotificationMeta = {
        kind: TAHARAH_KIND,
        taharah: { task: 'perisha', day: night, onah: 'night' },
      };
      expect(taharahNotificationSettled(tevila)).toBe(false);

      record({ type: 'tevila', day: night });
      expect(taharahNotificationSettled(tevila)).toBe(true);
      expect(taharahNotificationSettled(perisha)).toBe(false);
      expect(taharahNotificationSettled({ ...perisha, kind: undefined })).toBe(false);
    });

    it('10c settles the expected-onset question once a later onset is recorded', () => {
      const L = absOf(2026, 10, 13);
      record({ type: 'onset', onah: { abs: L, kind: 'day' } });
      const question: PendingNotificationMeta = { kind: TAHARAH_KIND, taharah: { task: 'expectOnset', day: L + 31 } };
      expect(taharahNotificationSettled(question)).toBe(false);

      record({ type: 'onset', onah: { abs: L + 31, kind: 'day' } });
      expect(taharahNotificationSettled(question)).toBe(true);
    });
  });

  describe('after a block', () => {
    const SHABBAT = '2026-11-07';
    const WEEK = [
      { type: 'onset', onah: { abs: absOf(2026, 10, 29), kind: 'day' } },
      { type: 'hefsek', day: absOf(2026, 11, 2), result: 'clean' },
      ...['03', '04', '05', '06', '08', '09'].flatMap((day): TaharahEventInput[] => [
        bedika(`2026-11-${day}`, 'morning'),
        bedika(`2026-11-${day}`, 'evening'),
      ]),
    ] as const satisfies readonly TaharahEventInput[];

    beforeEach(() => jest.setSystemTime(at(JERUSALEM, `${SHABBAT}T16:00`)));

    it('11 nudges to mark the bedikot Shabbat left open, until they are all marked', async () => {
      record(...WEEK);
      useTaharahStore.getState().setDiscreetNotifications(false);
      await NotificationScheduler.rebuild();

      const block = blockOn(SHABBAT);
      expect(block.end.getTime()).toBeGreaterThan(Date.now());
      const nudge = pendingOf(`taharah:postBlock:${SHABBAT}`)!;
      expect(triggerOf(nudge)).toBe(minutes(block.end, 15));
      expect(nudge.content.title).toBe(t('taharah.notify.title.postBlock'));
      expect(nudge.content.body).toBe(t('taharah.notify.body.postBlock', { in: t('checkin.in.shabbat') }));
      expect(nudge.content.categoryIdentifier).toBeUndefined();
      expect(nudge.content.data).toEqual({
        kind: TAHARAH_KIND,
        taharah: { task: 'postBlock', day: absOn(SHABBAT) },
      });
      const meta = nudge.content.data as PendingNotificationMeta;
      expect(taharahNotificationSettled(meta)).toBe(false);

      useTaharahStore.getState().addEvent(bedika(SHABBAT, 'morning'));
      await NotificationScheduler.rebuild();
      expect(pendingOf(`taharah:postBlock:${SHABBAT}`)).toBeDefined();
      expect(taharahNotificationSettled(meta)).toBe(false);

      useTaharahStore.getState().addEvent(bedika(SHABBAT, 'evening'));
      await NotificationScheduler.rebuild();
      expect(pendingOf(`taharah:postBlock:${SHABBAT}`)).toBeUndefined();
      expect(taharahNotificationSettled(meta)).toBe(true);
    });

    it('11b says nothing about the unmarked day in discreet mode', async () => {
      record(...WEEK);
      await NotificationScheduler.rebuild();

      const nudge = pendingOf(`taharah:postBlock:${SHABBAT}`)!;
      expect(nudge.content.title).toBe(t('taharah.notify.discreetTitle'));
      expect(nudge.content.body).toBe(t('taharah.notify.discreet.body'));
    });

    it('11c does not nudge a husband', async () => {
      record(...WEEK);
      useTaharahStore.getState().setRole('husband');
      await NotificationScheduler.rebuild();

      expect(pendingOf(`taharah:postBlock:${SHABBAT}`)).toBeUndefined();
    });

    it('11d fires nothing inside the block itself', async () => {
      record(...WEEK);
      await NotificationScheduler.rebuild();

      const block = blockOn(SHABBAT);
      expect(
        taharahPending().filter((p) => triggerOf(p) > block.start.getTime() && triggerOf(p) < block.end.getTime()),
      ).toEqual([]);
    });
  });

  describe('one reminder for what a block pushes onto the same instant', () => {
    const FRIDAY = '2026-11-13';
    const SHABBAT = '2026-11-14';
    const SUNDAY = '2026-11-15';

    // Clean days 2026-11-11 .. 2026-11-17: Friday is the third, Shabbat the fourth.
    const COUNT_ACROSS_SHABBAT = [
      { type: 'onset', onah: { abs: absOf(2026, 11, 6), kind: 'day' } },
      { type: 'hefsek', day: absOf(2026, 11, 10), result: 'clean' },
      bedika('2026-11-11', 'morning'),
    ] as const satisfies readonly TaharahEventInput[];

    const preBlockPending = () => taharahPending().filter((p) => p.identifier.startsWith('taharah:preBlock:'));

    beforeEach(() => jest.setSystemTime(at(JERUSALEM, `${FRIDAY}T06:00`)));

    it('14 merges the two Shabbat bedikot into one reminder ten minutes before candle lighting', async () => {
      record(...COUNT_ACROSS_SHABBAT);
      useTaharahStore.getState().setDiscreetNotifications(false);
      await NotificationScheduler.rebuild();

      const block = blockOn(SHABBAT);
      const day = absOn(SHABBAT);
      const merged = pendingOf(`taharah:preBlock:${SHABBAT}`)!;
      expect(preBlockPending()).toEqual([merged]);
      expect(triggerOf(merged)).toBe(minutes(block.start, -10));
      expect(merged.content.title).toBe(t('taharah.notify.title.preBlock', { in: t('checkin.in.shabbat') }));
      expect(merged.content.body).toBe(
        [t('taharah.notify.title.bedikaMorning', { day: 4 }), t('taharah.notify.title.bedikaEvening', { day: 4 })].join(
          '\n',
        ),
      );
      expect(merged.content.categoryIdentifier).toBeUndefined();
      expect(merged.trigger!.channelId).toBe('taharah');
      expect(merged.content.data).toEqual({ kind: TAHARAH_KIND, taharah: { task: 'preBlock', day } });
      expect(pendingOf(`taharah:bedikaMorning:${day}`)).toBeUndefined();
      expect(pendingOf(`taharah:bedikaEvening:${day}`)).toBeUndefined();
      expect(
        taharahPending().filter((p) => triggerOf(p) > block.start.getTime() && triggerOf(p) < block.end.getTime()),
      ).toEqual([]);
    });

    // Its own text would name a deadline inside Shabbat, where nothing can be done about it.
    it('14b sends a lone shifted reminder as the pre-block notice too', async () => {
      jest.setSystemTime(at(JERUSALEM, '2026-11-12T06:00'));
      record(...TEVILA_ON_SHABBAT);
      useTaharahStore.getState().setDiscreetNotifications(false);
      await NotificationScheduler.rebuild();

      const block = blockOn(SHABBAT);
      const tzeit = zmanimOn(SHABBAT).tzeitHakochavim;
      const night = absOn(SHABBAT) + 1;
      expect(minutes(tzeit, -180)).toBeGreaterThan(block.start.getTime());
      expect(pendingOf(`taharah:tevilaPrep:${night}`)).toBeUndefined();
      const merged = pendingOf(`taharah:preBlock:${SHABBAT}`)!;
      expect(preBlockPending()).toEqual([merged]);
      expect(triggerOf(merged)).toBe(minutes(block.start, -10));
      expect(merged.content.title).toBe(t('taharah.notify.title.preBlock', { in: t('checkin.in.shabbat') }));
      expect(merged.content.body).toBe(t('taharah.notify.title.tevilaPrep'));
      expect(merged.content.data).toEqual({ kind: TAHARAH_KIND, taharah: { task: 'preBlock', day: absOn(SHABBAT) } });
      expect(triggerOf(pendingOf(`taharah:tevilaPrep:${absOn(SHABBAT)}`)!)).toBe(
        minutes(zmanimOn(FRIDAY).tzeitHakochavim, -180),
      );
    });

    it('14c shows only the neutral text when discreet notifications are on', async () => {
      record(...COUNT_ACROSS_SHABBAT);
      await NotificationScheduler.rebuild();

      const merged = pendingOf(`taharah:preBlock:${SHABBAT}`)!;
      expect(merged.content.title).toBe(t('taharah.notify.discreetTitle'));
      expect(merged.content.body).toBe(t('taharah.notify.discreet.preBlock', { in: t('checkin.in.shabbat') }));
    });

    it('14d leaves the reminders that were not shifted exactly as they were', async () => {
      record(...COUNT_ACROSS_SHABBAT);
      await NotificationScheduler.rebuild();

      const { netzHaChama, shkia } = zmanimOn(FRIDAY);
      const friday = absOn(FRIDAY);
      expect(triggerOf(pendingOf(`taharah:bedikaMorning:${friday}`)!)).toBe(minutes(netzHaChama, 30));
      expect(triggerOf(pendingOf(`taharah:bedikaEvening:${friday}`)!)).toBe(minutes(shkia, -60));
      const sunday = absOn(SUNDAY);
      expect(triggerOf(pendingOf(`taharah:bedikaMorning:${sunday}`)!)).toBe(minutes(zmanimOn(SUNDAY).netzHaChama, 30));
      expect(pendingOf(`taharah:postBlock:${SHABBAT}`)).toBeDefined();
    });

    it('14e keeps the Friday hefsek on its own lead while the Shabbat one becomes the pre-block notice', async () => {
      record({ type: 'onset', onah: { abs: O - 1, kind: 'day' } });
      await NotificationScheduler.rebuild();

      const block = blockOn(SHABBAT);
      const friday = pendingOf(`taharah:hefsek:${absOn(FRIDAY)}`)!;
      expect(triggerOf(friday)).toBe(minutes(zmanimOn(FRIDAY).shkia, -90));
      expect(triggerOf(friday)).toBeLessThan(block.start.getTime());
      expect(pendingOf(`taharah:hefsek:${absOn(SHABBAT)}`)).toBeUndefined();
      const merged = pendingOf(`taharah:preBlock:${SHABBAT}`)!;
      expect(preBlockPending()).toEqual([merged]);
      expect(triggerOf(merged)).toBe(minutes(block.start, -10));
    });

    it('14f appends the disputed line once, however many of the merged reminders are in dispute', async () => {
      const onset = absOf(2026, 12, 10); // 30 Kislev, followed by a 29-day Tevet
      record(
        { type: 'onset', onah: { abs: onset, kind: 'day' } },
        { type: 'hefsek', day: onset + 4, result: 'clean' },
        ...[5, 6, 7, 8, 9, 10, 11].map((offset): TaharahEventInput => ({
          type: 'bedika',
          day: onset + offset,
          slot: 'morning',
          result: 'clean',
        })),
        { type: 'tevila', day: onset + 12 },
      );
      useTaharahStore.getState().setDiscreetNotifications(false);
      jest.setSystemTime(at(JERUSALEM, '2027-01-08T06:00'));
      await NotificationScheduler.rebuild();

      const block = blockOn('2027-01-09');
      const merged = pendingOf('taharah:preBlock:2027-01-09')!;
      expect(pendingOf(`taharah:perisha:${onset + 30}:day`)).toBeUndefined();
      expect(triggerOf(merged)).toBe(minutes(block.start, -10));
      expect(merged.content.body).toBe(
        [t('taharah.notify.title.perisha'), t('taharah.notify.title.bedikaVeset'), t('taharah.disputed')].join('\n'),
      );
      expect(merged.content.body!.split(t('taharah.disputed'))).toHaveLength(2);
    });

    it('14g never settles a merged reminder, and a tap on it marks nothing', async () => {
      record(...COUNT_ACROSS_SHABBAT);
      const merged: PendingNotificationMeta = {
        kind: TAHARAH_KIND,
        taharah: { task: 'preBlock', day: absOn(SHABBAT) },
      };
      expect(taharahNotificationSettled(merged)).toBe(false);
      expect(shouldSuppressForCompletion(merged)).toBe(false);

      const count = useTaharahStore.getState().events.length;
      expect(await markDoneFromNotificationData(merged, 'taharah:preBlock')).toBe(false);
      expect(useTaharahStore.getState().events).toHaveLength(count);
    });
  });

  describe('rebuilds', () => {
    it('12 raises the schedule format stamp so an update rebuilds once', async () => {
      await NotificationScheduler.rebuild();
      expect(StorageService.get(SCHEDULE_FORMAT_KEY)).toBe(8);
    });

    it('13 the taharah store and the opt-in drive a rebuild, and the teardown unsubscribes them', () => {
      const rebuild = jest.spyOn(NotificationScheduler, 'rebuild').mockResolvedValue();
      const teardown = initNotificationHandlers();
      rebuild.mockClear();

      useTaharahStore.getState().addEvent({ type: 'onset', onah: { abs: O, kind: 'day' } });
      expect(rebuild).toHaveBeenCalledTimes(1);
      useTaharahStore.getState().setPreset('chabad');
      expect(rebuild).toHaveBeenCalledTimes(2);
      useTaharahStore.getState().setDiscreetNotifications(false);
      expect(rebuild).toHaveBeenCalledTimes(3);
      useTaharahStore.getState().setLeads({ hefsekLeadMin: 30 });
      expect(rebuild).toHaveBeenCalledTimes(4);
      useTaharahStore.getState().setLeads({ bedikaEveningLeadMin: 30 });
      expect(rebuild).toHaveBeenCalledTimes(5);
      useTaharahStore.getState().setLeads({ tevilaPrepLeadMin: 30 });
      expect(rebuild).toHaveBeenCalledTimes(6);
      useTaharahStore.getState().setLockEnabled(false);
      expect(rebuild).toHaveBeenCalledTimes(6);

      useUserStore.getState().setTaharahEnabled(false);
      expect(rebuild).toHaveBeenCalledTimes(7);
      useTaharahStore.getState().addEvent({ type: 'onset', onah: { abs: O + 1, kind: 'day' } });
      expect(rebuild).toHaveBeenCalledTimes(7);

      teardown();
      rebuild.mockClear();
      useUserStore.getState().setTaharahEnabled(true);
      useTaharahStore.getState().addEvent({ type: 'onset', onah: { abs: O + 2, kind: 'day' } });
      expect(rebuild).not.toHaveBeenCalled();
      rebuild.mockRestore();
    });
  });
});
