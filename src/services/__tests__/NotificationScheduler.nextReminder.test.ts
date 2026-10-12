jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { HIGH: 'high' },
  AndroidNotificationVisibility: { PUBLIC: 'public' },
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  getStatusAsync: jest.fn(),
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
}));

import { parshiot } from '@hebcal/core';
import { nextReminderAt } from '../NotificationScheduler';
import * as web from '../NotificationScheduler.web';
import { buildPlan } from '@/services/notifications/plan';
import type { ReminderScope } from '@/services/notifications/planners/mitzvot';
import type { PlanInput } from '@/services/notifications/types';
import { CITIES } from '@/data/cities';
import { MITZVOT } from '@/data/mitzvot';
import { rulesFor } from '@/data/taharahPresets';
import { HebcalService } from '@/services/HebcalService';
import { at, zmanimFor } from '@/testing/zmanim';
import type { Mitzvah, Reminder, UserSettings } from '@/types/mitzvah';
import type { Location } from '@/types/zmanim';
import { isQuietAt } from '@/utils/skipRules';

type ChokModules = {
  mitzvot: typeof import('@/data/mitzvot');
  plan: typeof import('@/services/notifications/plan');
  planner: typeof import('@/services/notifications/planners/mitzvot');
};

const JERUSALEM = CITIES[0];
const LONDON = CITIES.find((city) => city.cityId === 'london')!;
const LOS_ANGELES = CITIES.find((city) => city.nameEn === 'Los Angeles')!;
const IL: UserSettings = { nusach: 'ashkenaz', halachicOpinions: { ksSofZman: 'GRA' }, inIsrael: true };
const ABROAD: UserSettings = { ...IL, inIsrael: false };
const MARK = 1_000;
const EVERY_PARASHA: Record<string, number> = Object.fromEntries(
  [...parshiot, 'Vezot Haberakhah'].map((parasha, index) => [parasha, index + 1]),
);

const byId = (id: string) => MITZVOT.find((mitzvah) => mitzvah.id === id)!;
const zmanimOn = (iso: string, location: Location = JERUSALEM) => zmanimFor(at(location, `${iso}T12:00`), location);
const minutes = (instant: Date, delta: number) => new Date(instant.getTime() + delta * 60_000);

function scopeAt(now: Date, overrides: Partial<ReminderScope> = {}): ReminderScope {
  return { now, location: JERUSALEM, settings: IL, completions: {}, skipped: {}, ...overrides };
}

const nextFor = (mitzvah: Mitzvah, now: Date, overrides: Partial<ReminderScope> = {}) =>
  nextReminderAt(mitzvah, mitzvah.defaultReminders, scopeAt(now, overrides));

function planInput(mitzvah: Mitzvah, now: Date, overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    now,
    fromDate: now,
    platform: 'android',
    hasPermission: true,
    language: 'he',
    location: JERUSALEM,
    settings: IL,
    mitzvot: [mitzvah],
    reminderOverrides: {},
    completions: {},
    skipped: {},
    checkIns: {},
    enabledSince: {},
    hilulotEnabled: false,
    roshChodeshEnabled: false,
    weeklyReportEnabled: false,
    taharahEnabled: false,
    taharah: {
      events: [],
      settings: { preset: 'ashkenaz', rules: rulesFor('ashkenaz'), role: 'woman' },
      discreet: true,
      leads: { hefsekLeadMin: 90, bedikaEveningLeadMin: 60, tevilaPrepLeadMin: 180 },
    },
    ...overrides,
  };
}

const plannedNext = (plan: ReturnType<typeof buildPlan>, mitzvahId: string) =>
  plan.find((candidate) => candidate.id.startsWith(`${mitzvahId}__`))?.trigger ?? null;

const TUESDAY = '2026-10-13';
const WEDNESDAY = '2026-10-14';
const FRIDAY = '2026-11-13';
const SATURDAY = '2026-11-14';
const SUNDAY = '2026-11-15';

describe('nextReminderAt', () => {
  const shacharit = byId('shacharit');
  const tefillin = byId('tefillin');
  const mincha = byId('mincha');

  it('is the first reminder still ahead in the window that is open', () => {
    const tuesday = zmanimOn(TUESDAY);
    expect(nextFor(shacharit, at(JERUSALEM, `${TUESDAY}T03:00`))?.getTime()).toBe(tuesday.netzHaChama.getTime());
    expect(nextFor(shacharit, minutes(tuesday.netzHaChama, 1))?.getTime()).toBe(
      minutes(tuesday.sofZmanTfilaGra, -45).getTime(),
    );
  });

  it('is strictly after now: a reminder due this very instant has fired', () => {
    const netz = zmanimOn(TUESDAY).netzHaChama;
    expect(nextFor(shacharit, netz)?.getTime()).toBe(minutes(zmanimOn(TUESDAY).sofZmanTfilaGra, -45).getTime());
  });

  it("goes on to tomorrow's first reminder once the last of today's has fired", () => {
    const afterLast = minutes(zmanimOn(TUESDAY).sofZmanTfilaGra, -44);
    expect(nextFor(shacharit, afterLast)?.getTime()).toBe(zmanimOn(WEDNESDAY).netzHaChama.getTime());
    expect(nextFor(shacharit, at(JERUSALEM, `${TUESDAY}T23:30`))?.getTime()).toBe(
      zmanimOn(WEDNESDAY).netzHaChama.getTime(),
    );
  });

  it('does the same on a location whose zone is far from the device', () => {
    const afterLast = minutes(zmanimOn(TUESDAY, LOS_ANGELES).sofZmanTfilaGra, -44);
    expect(nextFor(shacharit, afterLast, { location: LOS_ANGELES, settings: ABROAD })?.getTime()).toBe(
      zmanimOn(WEDNESDAY, LOS_ANGELES).netzHaChama.getTime(),
    );
  });

  it('skips a window already marked done or skipped, and goes on to the next', () => {
    const early = at(JERUSALEM, `${TUESDAY}T03:00`);
    const wednesday = zmanimOn(WEDNESDAY).netzHaChama.getTime();
    expect(nextFor(shacharit, early, { completions: { [TUESDAY]: { shacharit: MARK } } })?.getTime()).toBe(wednesday);
    expect(nextFor(shacharit, early, { skipped: { [TUESDAY]: { shacharit: MARK } } })?.getTime()).toBe(wednesday);
    expect(
      nextFor(shacharit, early, {
        completions: { [TUESDAY]: { shacharit: MARK }, [WEDNESDAY]: { shacharit: MARK } },
      })?.getTime(),
    ).toBe(zmanimOn('2026-10-15').netzHaChama.getTime());
    expect(nextFor(shacharit, early, { completions: { [TUESDAY]: { mincha: MARK } } })?.getTime()).toBe(
      zmanimOn(TUESDAY).netzHaChama.getTime(),
    );
  });

  describe('before Shabbat', () => {
    const block = HebcalService.holyBlockOn(at(JERUSALEM, `${SATURDAY}T12:00`), JERUSALEM)!;
    const friday = zmanimOn(FRIDAY);
    const sunday = zmanimOn(SUNDAY);

    it.each([
      ['shacharit', shacharit, minutes(friday.sofZmanTfilaGra, -44), sunday.netzHaChama],
      ['mincha', mincha, minutes(friday.shkia, -59), sunday.minchaGedola],
      ['tefillin', tefillin, minutes(friday.shkia, -44), sunday.misheyakir],
    ])("goes past the block to Sunday's first %s reminder, never to one inside it", (_name, mitzvah, now, expected) => {
      expect(now.getTime()).toBeLessThan(block.start.getTime());
      const next = nextFor(mitzvah, now)!;
      expect(next.getTime()).toBe(expected.getTime());
      expect(isQuietAt(next, JERUSALEM)).toBe(false);
      expect(next.getTime()).toBeGreaterThan(block.end.getTime());
    });

    it('answers the same from inside the block', () => {
      const inside = minutes(block.start, 60);
      expect(isQuietAt(inside, JERUSALEM)).toBe(true);
      expect(nextFor(shacharit, inside)?.getTime()).toBe(sunday.netzHaChama.getTime());
      expect(nextFor(tefillin, inside)?.getTime()).toBe(sunday.misheyakir.getTime());
    });
  });

  it('looks far enough ahead to clear Sukkot in Israel, where tefillin is off through all of chol hamoed', () => {
    expect(HebcalService.isCholHamoed(at(JERUSALEM, '2027-10-19T12:00'), JERUSALEM)).toBe(true);
    const afterErevSukkot = minutes(zmanimOn('2027-10-15').shkia, -44);
    expect(nextFor(tefillin, afterErevSukkot)?.getTime()).toBe(zmanimOn('2027-10-24').misheyakir.getTime());
  });

  it('is null when there is no reminder, when the window never opens and when none fires in range', () => {
    const now = at(JERUSALEM, `${TUESDAY}T03:00`);
    expect(nextReminderAt(shacharit, [], scopeAt(now))).toBeNull();
    expect(
      nextReminderAt({ ...shacharit, computeWindow: () => null }, shacharit.defaultReminders, scopeAt(now)),
    ).toBeNull();
    const outside: Reminder[] = [{ anchor: 'start', offsetMin: 99_999, label: 'late' }];
    expect(nextReminderAt(shacharit, outside, scopeAt(now))).toBeNull();
  });

  it('uses the reminders it is given, not the registry defaults', () => {
    const now = at(JERUSALEM, `${TUESDAY}T03:00`);
    const custom: Reminder[] = [{ anchor: 'start', offsetMin: 20, label: 'custom' }];
    expect(nextReminderAt(shacharit, custom, scopeAt(now))?.getTime()).toBe(
      minutes(zmanimOn(TUESDAY).netzHaChama, 20).getTime(),
    );
  });

  describe('against the scheduler', () => {
    const nows = [
      ['Tuesday before dawn', at(JERUSALEM, `${TUESDAY}T03:00`)],
      ['Tuesday midday', at(JERUSALEM, `${TUESDAY}T12:00`)],
      ['Tuesday night', at(JERUSALEM, `${TUESDAY}T23:00`)],
      ['Friday morning', at(JERUSALEM, `${FRIDAY}T08:00`)],
      ['Friday afternoon', at(JERUSALEM, `${FRIDAY}T14:30`)],
      [
        'Friday just before candle lighting',
        minutes(HebcalService.holyBlockOn(at(JERUSALEM, `${SATURDAY}T12:00`), JERUSALEM)!.start, -5),
      ],
      ['Shabbat midday', at(JERUSALEM, `${SATURDAY}T12:00`)],
      ['Sunday night', at(JERUSALEM, `${SUNDAY}T21:00`)],
    ] as const;

    it.each(nows)('names the first reminder the plan schedules, %s', (_label, now) => {
      for (const mitzvah of [tefillin, shacharit, mincha]) {
        const planned = plannedNext(buildPlan(planInput(mitzvah, now)), mitzvah.id);
        expect(planned).not.toBeNull();
        expect(nextFor(mitzvah, now)?.getTime()).toBe(planned!.getTime());
      }
    });

    it('agrees once today is marked done', () => {
      const now = at(JERUSALEM, `${TUESDAY}T03:00`);
      const completions = { [TUESDAY]: { shacharit: MARK } };
      const planned = plannedNext(buildPlan(planInput(shacharit, now, { completions })), 'shacharit');
      expect(planned?.getTime()).toBe(zmanimOn(WEDNESDAY).netzHaChama.getTime());
      expect(nextFor(shacharit, now, { completions })?.getTime()).toBe(planned!.getTime());
    });
  });

  it('is the same function on the web shim', () => {
    expect(web.nextReminderAt).toBe(nextReminderAt);
  });
});

describe('nextReminderAt for Chok LeYisrael', () => {
  let chok!: ChokModules;
  jest.isolateModules(() => {
    jest.doMock('../../data/chokAssets.generated', () => ({ CHOK_ASSETS: EVERY_PARASHA }));
    chok = {
      mitzvot: require('@/data/mitzvot'),
      plan: require('@/services/notifications/plan'),
      planner: require('@/services/notifications/planners/mitzvot'),
    };
  });
  const CHOK = chok.mitzvot.findMitzvah('chok_leyisrael')!;
  const morning = (iso: string) => minutes(zmanimOn(iso).alotHaShachar, 240);
  const evening = (iso: string) => at(JERUSALEM, `${iso}T20:30`);
  const nextChok = (now: Date, overrides: Partial<ReminderScope> = {}) =>
    chok.planner.nextReminderAt(CHOK, CHOK.defaultReminders, scopeAt(now, overrides));

  it('is the morning reminder while the day has not started, and the evening one once it has fired', () => {
    expect(nextChok(at(JERUSALEM, '2026-12-14T04:00'))?.getTime()).toBe(morning('2026-12-14').getTime());
    expect(nextChok(minutes(morning('2026-12-14'), 1))?.getTime()).toBe(evening('2026-12-14').getTime());
  });

  it("goes on to the next learning day's first reminder after the evening one", () => {
    const afterEvening = minutes(evening('2026-12-14'), 30);
    expect(afterEvening.getTime()).toBeLessThan(zmanimOn('2026-12-15').alotHaShachar.getTime());
    expect(nextChok(afterEvening)?.getTime()).toBe(morning('2026-12-15').getTime());
    expect(nextChok(at(JERUSALEM, '2026-12-15T02:00'))?.getTime()).toBe(morning('2026-12-15').getTime());
  });

  it('goes past Shabbat: Thursday night to Friday, and Friday, which has no evening reminder, to Sunday', () => {
    expect(nextChok(minutes(evening('2026-12-17'), 30))?.getTime()).toBe(morning('2026-12-18').getTime());
    const sunday = nextChok(minutes(morning('2026-12-18'), 1))!;
    expect(sunday.getTime()).toBe(morning('2026-12-20').getTime());
    expect(isQuietAt(sunday, JERUSALEM)).toBe(false);
  });

  it('skips a day marked done', () => {
    const now = at(JERUSALEM, '2026-12-14T04:00');
    expect(nextChok(now, { completions: { '2026-12-14': { chok_leyisrael: MARK } } })?.getTime()).toBe(
      morning('2026-12-15').getTime(),
    );
  });

  it('names the 20:30 reminder on the clock of the location, the Friday one too where candle lighting is later', () => {
    const london = { location: LONDON, settings: ABROAD };
    const morningIn = (iso: string) => minutes(zmanimOn(iso, LONDON).alotHaShachar, 240);
    const afterMorning = (iso: string) => minutes(morningIn(iso), 1);
    expect(nextChok(afterMorning('2027-06-17'), london)?.getTime()).toBe(at(LONDON, '2027-06-17T20:30').getTime());
    expect(nextChok(at(LONDON, '2027-06-17T21:00'), london)?.getTime()).toBe(morningIn('2027-06-18').getTime());
    expect(nextChok(afterMorning('2027-06-18'), london)?.getTime()).toBe(at(LONDON, '2027-06-18T20:30').getTime());
    for (const now of [afterMorning('2027-06-17'), at(LONDON, '2027-06-17T21:00'), afterMorning('2027-06-18')]) {
      const planned = plannedNext(chok.plan.buildPlan(planInput(CHOK, now, london)), 'chok_leyisrael');
      expect(nextChok(now, london)?.getTime()).toBe(planned!.getTime());
    }
  });

  it('agrees with the plan', () => {
    for (const now of [
      at(JERUSALEM, '2026-12-14T04:00'),
      minutes(morning('2026-12-14'), 1),
      minutes(evening('2026-12-14'), 30),
      minutes(evening('2026-12-17'), 30),
      minutes(morning('2026-12-18'), 1),
    ]) {
      const planned = plannedNext(chok.plan.buildPlan(planInput(CHOK, now)), 'chok_leyisrael');
      expect(nextChok(now)?.getTime()).toBe(planned!.getTime());
    }
  });
});
