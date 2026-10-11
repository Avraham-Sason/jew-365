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

import { NotificationScheduler, initNotificationHandlers } from '../NotificationScheduler';
import { useUserStore } from '@/stores/useUserStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { CITIES } from '@/data/cities';
import { HebcalService } from '@/services/HebcalService';
import { at } from '@/testing/zmanim';

const JERUSALEM = CITIES[0];
const THURSDAY = at(JERUSALEM, '2026-10-08T12:00');

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

const REPORT_DELAY_MS = 45 * 60_000;
const reportIds = () => mockState.pending.filter((p) => p.identifier.startsWith('report:')).map((p) => p.identifier);
const pendingOf = (identifier: string) => mockState.pending.find((p) => p.identifier === identifier)!;
const blockAround = (wallClock: string) => HebcalService.holyBlockAt(at(JERUSALEM, wallClock), JERUSALEM)!;
const rebuildAt = async (now: Date | string) => {
  jest.setSystemTime(typeof now === 'string' ? at(JERUSALEM, now) : now);
  await NotificationScheduler.rebuild();
};

describe('NotificationScheduler weekly report', () => {
  beforeEach(() => {
    mockState.pending = [];
    mockSchedule.mockClear();
    useCompletionsStore.setState({ completions: {}, skipped: {}, checkIns: {}, archivedDays: [] });
    useUserStore.getState().reset();
    useUserStore.getState().setNotificationPermission('granted');
    useUserStore.getState().setLocation(JERUSALEM);
    const disabled = Object.fromEntries(
      Object.keys(useMitzvotStore.getState().activeMitzvot).map((id) => [id, { enabled: false }]),
    );
    useMitzvotStore.setState({ activeMitzvot: disabled });
  });

  it('1 is on by default and schedules one report for the Shabbat in the horizon, on the system channel', async () => {
    expect(useUserStore.getState().weeklyReportEnabled).toBe(true);
    await NotificationScheduler.rebuild();

    expect(reportIds()).toEqual(['report:2026-10-10']);
    const report = pendingOf('report:2026-10-10');
    expect(report.trigger!.date.getTime()).toBe(blockAround('2026-10-10T12:00').end.getTime() + REPORT_DELAY_MS);
    expect(report.trigger!.channelId).toBe('system');
    expect(report.content.title).toBe('סיכום השבוע מוכן');
    expect(report.content.body).toBe('מה סימנת השבוע, במה להשתפר ומה מחכה בשבוע הבא');
    expect(report.content.categoryIdentifier).toBeUndefined();
    expect(report.content.data).toEqual({ kind: 'report', report: { week: '2026-10-10' } });
  });

  it('2 schedules nothing while the setting is off', async () => {
    useUserStore.getState().setWeeklyReportEnabled(false);
    await NotificationScheduler.rebuild();
    expect(reportIds()).toEqual([]);
  });

  it('3 words the notice in English in the English UI', async () => {
    useUserStore.getState().setLanguage('en');
    await NotificationScheduler.rebuild();

    const report = pendingOf('report:2026-10-10');
    expect(report.content.title).toBe('Your weekly report is ready');
    expect(report.content.body).toBe('What you marked this week, what to improve and what next week holds');
  });

  it('4 fires after the first check-in nudge and before the second, so the two do not collide', async () => {
    useMitzvotStore.setState({
      activeMitzvot: {
        ...useMitzvotStore.getState().activeMitzvot,
        shacharit: { enabled: true },
        mincha: { enabled: true },
      },
    });
    await NotificationScheduler.rebuild();

    const { end } = blockAround('2026-10-10T12:00');
    const sequence = mockState.pending
      .filter((p) => /^(checkin|report):/.test(p.identifier))
      .sort((a, b) => a.trigger!.date.getTime() - b.trigger!.date.getTime());
    expect(sequence.map((p) => [p.identifier, p.trigger!.date.getTime()])).toEqual([
      ['checkin:2026-10-10:0', end.getTime()],
      ['report:2026-10-10', end.getTime() + REPORT_DELAY_MS],
      ['checkin:2026-10-10:1', end.getTime() + 120 * 60_000],
      ['checkin:2026-10-10:2', new Date(2026, 9, 11, 20).getTime()],
    ]);
  });

  it('5 names a Rosh Hashana that follows Shabbat by its last day, at the Sunday exit', async () => {
    await rebuildAt('2026-09-10T12:00');

    expect(reportIds()).toEqual(['report:2026-09-13']);
    const block = blockAround('2026-09-12T12:00');
    expect(block.days).toEqual(['2026-09-12', '2026-09-13']);
    expect(pendingOf('report:2026-09-13').trigger!.date.getTime()).toBe(block.end.getTime() + REPORT_DELAY_MS);
    expect(pendingOf('report:2026-09-13').content.data).toEqual({ kind: 'report', report: { week: '2026-09-13' } });
  });

  it('6 plans nothing for a Yom Tov block in mid-week, and drops the report of a Shabbat already past', async () => {
    await rebuildAt('2026-09-20T12:00');
    expect(blockAround('2026-09-21T12:00').days).toEqual(['2026-09-21']);
    expect(reportIds()).toEqual([]);
  });

  it('7 still plans the report after the exit while its 45 minutes run, and drops it once they have', async () => {
    const { end } = blockAround('2026-10-10T12:00');

    await rebuildAt(new Date(end.getTime() + 5 * 60_000));
    expect(reportIds()).toEqual(['report:2026-10-10']);

    await rebuildAt(new Date(end.getTime() + 50 * 60_000));
    expect(reportIds()).toEqual([]);
  });

  it('8 rebuilds when the setting is switched, and the teardown unsubscribes', () => {
    const rebuild = jest.spyOn(NotificationScheduler, 'rebuild').mockResolvedValue();
    const teardown = initNotificationHandlers();
    rebuild.mockClear();

    useUserStore.getState().setWeeklyReportEnabled(false);
    expect(rebuild).toHaveBeenCalledTimes(1);
    useUserStore.getState().setWeeklyReportEnabled(true);
    expect(rebuild).toHaveBeenCalledTimes(2);

    teardown();
    useUserStore.getState().setWeeklyReportEnabled(false);
    expect(rebuild).toHaveBeenCalledTimes(2);
    rebuild.mockRestore();
  });
});
