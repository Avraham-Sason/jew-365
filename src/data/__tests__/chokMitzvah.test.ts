import { parshiot } from '@hebcal/core';
import { DateTime } from 'luxon';
import { iconFor } from '@/components/MitzvahIcon';
import { CITIES } from '@/data/cities';
import { rulesFor } from '@/data/taharahPresets';
import { HebcalService } from '@/services/HebcalService';
import { MITZVAH_REMINDER_CATEGORY, MITZVAH_TEXT_CATEGORY } from '@/services/notifications/ids';
import type { PlanInput } from '@/services/notifications/types';
import { at, zmanimFor } from '@/testing/zmanim';
import type { Mitzvah, UserSettings } from '@/types/mitzvah';
import type { Location } from '@/types/zmanim';

type Modules = {
  mitzvot: typeof import('../mitzvot');
  siddur: typeof import('../siddur');
  adapter: typeof import('../customMitzvotAdapter');
  plan: typeof import('@/services/notifications/plan');
  planner: typeof import('@/services/notifications/planners/mitzvot');
  history: typeof import('@/utils/historyStats');
  checkIn: typeof import('@/utils/checkIn');
  skipRules: typeof import('@/utils/skipRules');
  store: typeof import('@/stores/useMitzvotStore');
};

const EVERY_PARASHA: Record<string, number> = Object.fromEntries(
  [...parshiot, 'Vezot Haberakhah'].map((parasha, index) => [parasha, index + 1]),
);
const JERUSALEM = CITIES[0];
const LOS_ANGELES = CITIES.find((city) => city.nameEn === 'Los Angeles')!;
const LONDON = CITIES.find((city) => city.cityId === 'london')!;
const NEW_YORK = CITIES.find((city) => city.cityId === 'new-york')!;
const IL: UserSettings = { nusach: 'ashkenaz', halachicOpinions: { ksSofZman: 'GRA' }, inIsrael: true };
const ABROAD: UserSettings = { ...IL, inIsrael: false };
const MARK = 1_000;
const DURATION = /[0-9]|שעה|דק/;

function load(assets: Record<string, number>): Modules {
  let modules!: Modules;
  jest.isolateModules(() => {
    jest.doMock('../chokAssets.generated', () => ({ CHOK_ASSETS: assets }));
    modules = {
      mitzvot: require('../mitzvot'),
      siddur: require('../siddur'),
      adapter: require('../customMitzvotAdapter'),
      plan: require('@/services/notifications/plan'),
      planner: require('@/services/notifications/planners/mitzvot'),
      history: require('@/utils/historyStats'),
      checkIn: require('@/utils/checkIn'),
      skipRules: require('@/utils/skipRules'),
      store: require('@/stores/useMitzvotStore'),
    };
  });
  return modules;
}

const day = (iso: string) => {
  const [year, month, date] = iso.split('-').map(Number);
  return new Date(year, month - 1, date);
};
const clock = (instant: Date, location: Location) =>
  DateTime.fromJSDate(instant).setZone(location.tz).toFormat('yyyy-MM-dd HH:mm');
const ctxFor = (location: Location, iso: string, settings: UserSettings) => ({
  date: day(iso),
  location,
  settings,
  zmanim: zmanimFor(at(location, `${iso}T12:00`), location),
});

const WITH_CONTENT = load(EVERY_PARASHA);
const CHOK: Mitzvah = WITH_CONTENT.mitzvot.findMitzvah('chok_leyisrael')!;

function windowOn(location: Location, iso: string, settings: UserSettings, mitzvah: Mitzvah = CHOK) {
  return mitzvah.computeWindow(ctxFor(location, iso, settings));
}

function shownWindow(location: Location, iso: string, settings: UserSettings) {
  const window = windowOn(location, iso, settings);
  return window && [clock(window.start, location), clock(window.end, location)];
}

function fireTimes(location: Location, iso: string, settings: UserSettings) {
  const window = windowOn(location, iso, settings)!;
  const before = new Date(window.start.getTime() - 60_000);
  return CHOK.defaultReminders.map((reminder) => {
    const trigger = WITH_CONTENT.planner.buildTriggerTime(reminder, window, location);
    return WITH_CONTENT.skipRules.reminderFires(trigger, window, location, before) ? clock(trigger, location) : null;
  });
}

function planInput(overrides: Partial<PlanInput> = {}): PlanInput {
  const now = overrides.now ?? at(JERUSALEM, '2026-12-17T04:00');
  return {
    now,
    fromDate: now,
    platform: 'android',
    hasPermission: true,
    language: 'he',
    location: JERUSALEM,
    settings: IL,
    mitzvot: [CHOK],
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

describe('the chok_leyisrael registry entry', () => {
  it('is a learning mitzvah, off by default, last in the registry while the content exists', () => {
    const { mitzvot, store } = WITH_CONTENT;
    expect(mitzvot.MITZVOT[mitzvot.MITZVOT.length - 1]).toBe(CHOK);
    expect(CHOK).toBe(mitzvot.CHOK_LEYISRAEL);
    expect(CHOK.name).toEqual({ he: 'חק לישראל', en: 'Chok LeYisrael' });
    expect(CHOK.category).toBe('learning');
    expect(iconFor(CHOK.icon)).toBe('chok');
    expect(CHOK.skipOn).toEqual(['shabbat', 'yomtov']);
    expect(CHOK.nuschaotSupported).toEqual(['ashkenaz', 'sefard', 'edot_hamizrach', 'chabad']);
    expect(store.useMitzvotStore.getState().activeMitzvot.chok_leyisrael).toEqual({ enabled: false });
  });

  it('has a morning reminder with three bodies and an evening one only when not done, none naming a duration', () => {
    expect(CHOK.defaultReminders).toEqual([
      {
        anchor: 'start',
        offsetMin: 240,
        label: 'זמן לימוד חק לישראל',
        bodyVariants: ['זמן לימוד חק לישראל', 'חק לישראל של היום מחכה לך', 'כמה דקות של תורה עם חק לישראל'],
      },
      { anchor: 'clock', offsetMin: 20 * 60 + 30, label: 'תזכורת — עדיין לא למדת חק לישראל', skipIfDone: true },
    ]);
    expect(CHOK.defaultReminders.filter((reminder) => DURATION.test(reminder.label))).toEqual([]);
  });

  it('reaches an install saved before it existed, switched off, through the merge', () => {
    const { useMitzvotStore } = WITH_CONTENT.store;
    const { merge } = useMitzvotStore.persist.getOptions();
    const merged = merge!({ activeMitzvot: { tefillin: { enabled: true } } }, useMitzvotStore.getState()).activeMitzvot;
    expect(merged.chok_leyisrael).toEqual({ enabled: false });
    expect(merged.tefillin).toEqual({ enabled: true });
  });
});

describe('while the generated map is empty', () => {
  const EMPTY = load({});

  it('is listed nowhere and has no window or text', () => {
    const chok = EMPTY.mitzvot.CHOK_LEYISRAEL;
    expect(EMPTY.mitzvot.MITZVOT.map((mitzvah) => mitzvah.id)).not.toContain('chok_leyisrael');
    expect(EMPTY.mitzvot.findMitzvah('chok_leyisrael')).toBeUndefined();
    expect(EMPTY.adapter.getAllMitzvot().map((mitzvah) => mitzvah.id)).not.toContain('chok_leyisrael');
    expect(EMPTY.store.useMitzvotStore.getState().activeMitzvot).not.toHaveProperty('chok_leyisrael');
    expect(windowOn(JERUSALEM, '2026-12-14', IL, chok)).toBeNull();
    const place = EMPTY.siddur.siddurPlace(JERUSALEM, true);
    expect(EMPTY.siddur.hasSiddurText(chok, 'ashkenaz', day('2026-12-14'), place)).toBe(false);
  });

  it('plans nothing for it even with every mitzvah switched on', () => {
    const plan = EMPTY.plan.buildPlan(planInput({ mitzvot: EMPTY.mitzvot.MITZVOT }));
    expect(plan.some((candidate) => candidate.id.startsWith('chok_leyisrael'))).toBe(false);
  });
});

describe('computeWindow', () => {
  it.each([
    ['a weekday in December', JERUSALEM, IL, '2026-12-14', ['2026-12-14 05:13', '2026-12-15 05:13']],
    ['a weekday in June', JERUSALEM, IL, '2027-06-14', ['2027-06-14 04:05', '2027-06-15 04:05']],
    ['Thursday, through Thursday night', JERUSALEM, IL, '2026-12-17', ['2026-12-17 05:14', '2026-12-18 05:15']],
    ['Friday in December', JERUSALEM, IL, '2026-12-18', ['2026-12-18 05:15', '2026-12-18 15:58']],
    ['Friday in June', JERUSALEM, IL, '2027-06-18', ['2027-06-18 04:05', '2027-06-18 19:06']],
    ['erev Pesach', JERUSALEM, IL, '2027-04-21', ['2027-04-21 04:47', '2027-04-21 18:32']],
    ['erev Yom Kippur', JERUSALEM, IL, '2026-09-20', ['2026-09-20 05:13', '2026-09-20 17:58']],
    ['a weekday of chol hamoed', JERUSALEM, IL, '2027-04-26', ['2027-04-26 04:41', '2027-04-27 04:40']],
    ['the Friday of chol hamoed', JERUSALEM, IL, '2027-04-23', ['2027-04-23 04:45', '2027-04-23 18:33']],
    ['chol hamoed before the seventh day', JERUSALEM, IL, '2027-04-27', ['2027-04-27 04:40', '2027-04-27 18:36']],
    ['Thursday of Vezot Haberakhah', JERUSALEM, IL, '2026-10-01', ['2026-10-01 05:20', '2026-10-02 05:21']],
    ['a weekday in December', LOS_ANGELES, ABROAD, '2026-12-14', ['2026-12-14 05:30', '2026-12-15 05:31']],
    ['a weekday in June', LOS_ANGELES, ABROAD, '2027-06-14', ['2027-06-14 04:09', '2027-06-15 04:09']],
    ['Thursday, through Thursday night', LOS_ANGELES, ABROAD, '2026-12-17', ['2026-12-17 05:32', '2026-12-18 05:33']],
    ['Friday in December', LOS_ANGELES, ABROAD, '2026-12-18', ['2026-12-18 05:33', '2026-12-18 16:26']],
    ['Friday in June', LOS_ANGELES, ABROAD, '2027-06-18', ['2027-06-18 04:09', '2027-06-18 19:46']],
    ['erev Pesach', LOS_ANGELES, ABROAD, '2027-04-21', ['2027-04-21 04:55', '2027-04-21 19:09']],
    ['a weekday of chol hamoed', LOS_ANGELES, ABROAD, '2027-04-26', ['2027-04-26 04:48', '2027-04-27 04:47']],
    ['chol hamoed before the seventh day', LOS_ANGELES, ABROAD, '2027-04-27', ['2027-04-27 04:47', '2027-04-27 19:13']],
  ] as const)('%s in %s: alot to the next alot or to candle lighting', (_label, location, settings, iso, expected) => {
    expect(shownWindow(location, iso, settings)).toEqual(expected);
  });

  it.each([
    ['Shabbat', JERUSALEM, IL, '2026-12-19'],
    ['the first day of Pesach', JERUSALEM, IL, '2027-04-22'],
    ['the seventh day of Pesach', JERUSALEM, IL, '2027-04-28'],
    ['Yom Kippur', JERUSALEM, IL, '2026-09-21'],
    ['the Friday of Vezot Haberakhah', JERUSALEM, IL, '2026-10-02'],
    ['Shabbat', LOS_ANGELES, ABROAD, '2026-12-19'],
    ['the second day of Pesach', LOS_ANGELES, ABROAD, '2027-04-23'],
    ['the eighth day of Pesach', LOS_ANGELES, ABROAD, '2027-04-29'],
    ['the Friday of Vezot Haberakhah', LOS_ANGELES, ABROAD, '2026-10-02'],
  ] as const)('has no window on %s in %s', (_label, location, settings, iso) => {
    expect(windowOn(location, iso, settings)).toBeNull();
  });

  it('ends at the next alot, or at the start of the block that opens that evening', () => {
    const monday = windowOn(JERUSALEM, '2026-12-14', IL)!;
    const mondayZmanim = zmanimFor(at(JERUSALEM, '2026-12-14T12:00'), JERUSALEM);
    const tuesdayZmanim = zmanimFor(at(JERUSALEM, '2026-12-15T12:00'), JERUSALEM);
    expect(monday.start.getTime()).toBe(mondayZmanim.alotHaShachar.getTime());
    expect(monday.end.getTime()).toBe(tuesdayZmanim.alotHaShachar.getTime());
    const friday = windowOn(JERUSALEM, '2026-12-18', IL)!;
    const shabbat = HebcalService.holyBlockOn(at(JERUSALEM, '2026-12-19T12:00'), JERUSALEM)!;
    expect(friday.end.getTime()).toBe(shabbat.start.getTime());
  });
});

describe('default reminders', () => {
  it.each([
    [JERUSALEM, IL, '2026-12-14', ['2026-12-14 09:13', '2026-12-14 20:30']],
    [JERUSALEM, IL, '2027-06-14', ['2027-06-14 08:05', '2027-06-14 20:30']],
    [LOS_ANGELES, ABROAD, '2026-12-14', ['2026-12-14 09:30', '2026-12-14 20:30']],
    [LOS_ANGELES, ABROAD, '2027-06-14', ['2027-06-14 08:09', '2027-06-14 20:30']],
  ] as const)(
    'fire four hours after alot and at 20:30 on the clock of the location on a weekday in %s, %s',
    (location, settings, iso, expected) => {
      expect(fireTimes(location, iso, settings)).toEqual(expected);
    },
  );

  it.each([
    [JERUSALEM, IL, '2026-12-18', ['2026-12-18 09:15', null]],
    [JERUSALEM, IL, '2027-06-18', ['2027-06-18 08:05', null]],
    [JERUSALEM, IL, '2027-04-21', ['2027-04-21 08:47', null]],
    [LOS_ANGELES, ABROAD, '2026-12-18', ['2026-12-18 09:33', null]],
    [LOS_ANGELES, ABROAD, '2027-06-18', ['2027-06-18 08:09', null]],
    [LOS_ANGELES, ABROAD, '2027-04-21', ['2027-04-21 08:55', null]],
  ] as const)('drop the evening one on an erev in %s, %s', (location, settings, iso, expected) => {
    expect(fireTimes(location, iso, settings)).toEqual(expected);
  });
});

describe('the evening reminder at 20:30 on the clock of the location', () => {
  const EVENING = 1;
  const ORDINARY_TUESDAYS = [
    '2026-10-13',
    '2026-11-10',
    '2026-12-08',
    '2027-01-12',
    '2027-02-09',
    '2027-03-09',
    '2027-04-13',
    '2027-05-11',
    '2027-06-08',
    '2027-07-13',
    '2027-08-10',
    '2027-09-14',
  ];
  const fridaysFrom = (first: string, weeks: number) =>
    Array.from({ length: weeks }, (_, week) => DateTime.fromISO(first).plus({ weeks: week }).toISODate()!);

  it.each([
    ['Jerusalem', JERUSALEM, IL],
    ['London', LONDON, ABROAD],
    ['New York', NEW_YORK, ABROAD],
  ] as const)('fires at 20:30 on one ordinary weekday of every month in %s', (_name, location, settings) => {
    for (const iso of ORDINARY_TUESDAYS) {
      expect(fireTimes(location, iso, settings)[EVENING]).toBe(`${iso} 20:30`);
    }
  });

  it.each([
    ['Jerusalem', JERUSALEM, IL],
    ['New York', NEW_YORK, ABROAD],
  ] as const)(
    'is dropped on every Friday of the year in %s, where candle lighting is before 20:30',
    (_name, location, settings) => {
      const fridays = fridaysFrom('2026-10-02', 52).filter((iso) => windowOn(location, iso, settings));
      expect(fridays.length).toBeGreaterThan(40);
      for (const iso of fridays) {
        expect(fireTimes(location, iso, settings)[EVENING]).toBeNull();
      }
    },
  );

  it.each([
    ['Jerusalem', JERUSALEM, IL, ['2027-04-21', '2027-04-27', '2027-06-10']],
    ['New York', NEW_YORK, ABROAD, ['2027-04-21', '2027-04-27', '2027-06-10']],
    ['London', LONDON, ABROAD, ['2027-04-21', '2027-04-27']],
  ] as const)(
    'is dropped on the erev of Yom Tov in %s, whose window ends at candle lighting',
    (_name, location, settings, erevs) => {
      for (const iso of erevs) {
        expect(fireTimes(location, iso, settings)).toEqual([expect.any(String), null]);
      }
    },
  );

  it.each([
    ['2026-12-18', ['2026-12-18 15:32'], null],
    ['2027-05-14', ['2027-05-14 20:24'], null],
    ['2027-05-21', ['2027-05-21 20:34'], '2027-05-21 20:30'],
    ['2027-06-18', ['2027-06-18 21:00'], '2027-06-18 20:30'],
    ['2027-07-30', ['2027-07-30 20:32'], '2027-07-30 20:30'],
    ['2027-08-06', ['2027-08-06 20:20'], null],
  ] as const)('on London Friday %s candle lighting is %j and the reminder is %j', (iso, [candleLighting], evening) => {
    expect(shownWindow(LONDON, iso, ABROAD)![1]).toBe(candleLighting);
    expect(fireTimes(LONDON, iso, ABROAD)[EVENING]).toBe(evening);
  });

  it('plans the summer Friday evening reminder in London before candle lighting, offering the text', () => {
    const now = at(LONDON, '2027-06-17T03:00');
    const candidates = WITH_CONTENT.plan
      .buildPlan(planInput({ now, fromDate: now, location: LONDON, settings: ABROAD }))
      .filter((candidate) => candidate.id.startsWith('chok_leyisrael__'));
    expect(candidates.map((candidate) => [candidate.id, clock(candidate.trigger, LONDON)])).toEqual([
      ['chok_leyisrael__2027-06-17__0', '2027-06-17 07:30'],
      ['chok_leyisrael__2027-06-17__1', '2027-06-17 20:30'],
      ['chok_leyisrael__2027-06-18__0', '2027-06-18 07:30'],
      ['chok_leyisrael__2027-06-18__1', '2027-06-18 20:30'],
      ['chok_leyisrael__2027-06-20__0', '2027-06-20 07:30'],
      ['chok_leyisrael__2027-06-20__1', '2027-06-20 20:30'],
    ]);
    const friday = candidates.find((candidate) => candidate.id === 'chok_leyisrael__2027-06-18__1')!;
    expect(friday.categoryIdentifier).toBe(MITZVAH_TEXT_CATEGORY);
    expect(friday.data).toMatchObject({ dateKey: '2027-06-18', reminderIndex: 1, skipIfDone: true, hasText: true });
  });

  it('stays quiet once the day is marked done, as before', () => {
    const now = at(LONDON, '2027-06-17T03:00');
    const completions = { '2027-06-18': { chok_leyisrael: MARK } };
    const ids = WITH_CONTENT.plan
      .buildPlan(planInput({ now, fromDate: now, location: LONDON, settings: ABROAD, completions }))
      .filter((candidate) => candidate.id.startsWith('chok_leyisrael__2027-06-18'))
      .map((candidate) => candidate.id);
    expect(ids).toEqual([]);
  });
});

describe('hasSiddurText', () => {
  const { hasSiddurText, siddurPlace } = WITH_CONTENT.siddur;
  const israel = siddurPlace(JERUSALEM, true);
  const abroad = siddurPlace(LOS_ANGELES, false);

  it('offers the text on a day with a portion whose week has every asset', () => {
    expect(hasSiddurText(CHOK, 'ashkenaz', day('2026-12-14'), israel)).toBe(true);
    expect(hasSiddurText(CHOK, 'edot_hamizrach', day('2026-12-18'), israel)).toBe(true);
    expect(hasSiddurText(CHOK, 'ashkenaz', day('2026-10-01'), israel)).toBe(true);
    expect(hasSiddurText(CHOK, 'ashkenaz', day('2027-04-23'), israel)).toBe(true);
  });

  it('offers none on Shabbat, Yom Tov, Yom Kippur or the Friday of Vezot Haberakhah', () => {
    expect(hasSiddurText(CHOK, 'ashkenaz', day('2026-12-19'), israel)).toBe(false);
    expect(hasSiddurText(CHOK, 'ashkenaz', day('2027-04-22'), israel)).toBe(false);
    expect(hasSiddurText(CHOK, 'ashkenaz', day('2027-04-23'), abroad)).toBe(false);
    expect(hasSiddurText(CHOK, 'ashkenaz', day('2026-09-21'), israel)).toBe(false);
    expect(hasSiddurText(CHOK, 'ashkenaz', day('2026-10-02'), israel)).toBe(false);
  });

  it('offers none for a week whose parashiyot are not all in the map', () => {
    const partial = load({ Noach: 1, Vayakhel: 2 });
    const chok = partial.mitzvot.CHOK_LEYISRAEL;
    const place = partial.siddur.siddurPlace(JERUSALEM, true);
    expect(partial.siddur.hasSiddurText(chok, 'ashkenaz', day('2026-10-12'), place)).toBe(true);
    expect(partial.siddur.hasSiddurText(chok, 'ashkenaz', day('2026-10-19'), place)).toBe(false);
    expect(partial.siddur.hasSiddurText(chok, 'ashkenaz', day('2028-03-20'), place)).toBe(false);
  });
});

describe('the scheduler', () => {
  const chokCandidates = (input: PlanInput) =>
    WITH_CONTENT.plan.buildPlan(input).filter((candidate) => candidate.id.startsWith('chok_leyisrael__'));

  it('plans both reminders on weekdays and only the morning one on Friday, each offering the text', () => {
    const candidates = chokCandidates(planInput());
    expect(candidates.map((candidate) => [candidate.id, clock(candidate.trigger, JERUSALEM)])).toEqual([
      ['chok_leyisrael__2026-12-17__0', '2026-12-17 09:14'],
      ['chok_leyisrael__2026-12-17__1', '2026-12-17 20:30'],
      ['chok_leyisrael__2026-12-18__0', '2026-12-18 09:15'],
      ['chok_leyisrael__2026-12-20__0', '2026-12-20 09:16'],
      ['chok_leyisrael__2026-12-20__1', '2026-12-20 20:30'],
    ]);
    expect(new Set(candidates.map((candidate) => candidate.categoryIdentifier))).toEqual(
      new Set([MITZVAH_TEXT_CATEGORY]),
    );
    expect(candidates[1].data).toMatchObject({
      mitzvahId: 'chok_leyisrael',
      dateKey: '2026-12-17',
      reminderIndex: 1,
      skipIfDone: true,
      hasText: true,
    });
  });

  it('plans the same abroad', () => {
    const now = at(LOS_ANGELES, '2027-06-17T03:00');
    const candidates = chokCandidates(planInput({ now, fromDate: now, location: LOS_ANGELES, settings: ABROAD }));
    expect(candidates.map((candidate) => [candidate.id, clock(candidate.trigger, LOS_ANGELES)])).toEqual([
      ['chok_leyisrael__2027-06-17__0', '2027-06-17 08:09'],
      ['chok_leyisrael__2027-06-17__1', '2027-06-17 20:30'],
      ['chok_leyisrael__2027-06-18__0', '2027-06-18 08:09'],
      ['chok_leyisrael__2027-06-20__0', '2027-06-20 08:10'],
      ['chok_leyisrael__2027-06-20__1', '2027-06-20 20:30'],
    ]);
  });

  it('skips Yom Tov and the evening of its erev, and a day already marked', () => {
    const now = at(JERUSALEM, '2027-04-20T03:00');
    const completions = { '2027-04-25': { chok_leyisrael: MARK } };
    const candidates = chokCandidates(planInput({ now, fromDate: now, completions }));
    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'chok_leyisrael__2027-04-20__0',
      'chok_leyisrael__2027-04-20__1',
      'chok_leyisrael__2027-04-21__0',
      'chok_leyisrael__2027-04-23__0',
    ]);
  });

  it('gives mark-done only when the week has no asset', () => {
    const partial = load({ Noach: 1 });
    const candidates = partial.plan
      .buildPlan(planInput({ mitzvot: [partial.mitzvot.CHOK_LEYISRAEL] }))
      .filter((candidate) => candidate.id.startsWith('chok_leyisrael__'));
    expect(candidates).toHaveLength(5);
    expect(new Set(candidates.map((candidate) => candidate.categoryIdentifier))).toEqual(
      new Set([MITZVAH_REMINDER_CATEGORY]),
    );
    expect(candidates.every((candidate) => candidate.data.hasText === false)).toBe(true);
  });
});

describe('history, the streak and the check-in', () => {
  const { computeStats, judgeDay } = WITH_CONTENT.history;
  const since = { chok_leyisrael: at(JERUSALEM, '2026-12-01T12:00').getTime() };
  const statsWith = (completions: Record<string, Record<string, number>>) =>
    computeStats([CHOK], completions, JERUSALEM, IL, 4, at(JERUSALEM, '2026-12-17T12:00'), { enabledSince: since });

  it('turns a missed day into a done one when its make-up is marked', () => {
    const before = statsWith({
      '2026-12-13': { chok_leyisrael: MARK },
      '2026-12-15': { chok_leyisrael: MARK },
      '2026-12-16': { chok_leyisrael: MARK },
    });
    expect(before.daily.find((entry) => entry.date === '2026-12-14')).toEqual({
      date: '2026-12-14',
      doneCount: 0,
      totalCount: 1,
      pendingCount: 0,
    });
    expect(before.streak).toBe(2);

    const after = statsWith({
      '2026-12-13': { chok_leyisrael: MARK },
      '2026-12-14': { chok_leyisrael: MARK },
      '2026-12-15': { chok_leyisrael: MARK },
      '2026-12-16': { chok_leyisrael: MARK },
    });
    expect(after.daily.find((entry) => entry.date === '2026-12-14')).toEqual({
      date: '2026-12-14',
      doneCount: 1,
      totalCount: 1,
      pendingCount: 0,
    });
    expect(after.perMitzvah.chok_leyisrael).toEqual({ done: 3, eligible: 3, pending: 1, percent: 100 });
    expect(after.streak).toBe(4);
  });

  it('keeps a Yom Tov make-up out of the day and mitzvah counts, and counts the day in the streak like any mark', () => {
    const stats = computeStats(
      [CHOK],
      { '2027-04-22': { chok_leyisrael: MARK } },
      JERUSALEM,
      IL,
      2,
      at(JERUSALEM, '2027-04-23T12:00'),
      { enabledSince: { chok_leyisrael: at(JERUSALEM, '2027-04-01T12:00').getTime() } },
    );
    expect(stats.daily).toEqual([
      { date: '2027-04-22', doneCount: 0, totalCount: 0, pendingCount: 0 },
      { date: '2027-04-23', doneCount: 0, totalCount: 1, pendingCount: 1 },
    ]);
    expect(stats.perMitzvah.chok_leyisrael).toEqual({ done: 0, eligible: 0, pending: 1, percent: 0 });
    expect(stats.streak).toBe(1);
  });

  it('keeps the day open until the next alot', () => {
    const input = { mitzvot: [CHOK], completions: {}, location: JERUSALEM, settings: IL };
    expect(judgeDay(day('2026-12-14'), input, at(JERUSALEM, '2026-12-15T03:00')).pending).toEqual(['chok_leyisrael']);
    expect(judgeDay(day('2026-12-14'), input, at(JERUSALEM, '2026-12-16T12:00')).missed).toEqual(['chok_leyisrael']);
    const alot = zmanimFor(at(JERUSALEM, '2026-12-15T12:00'), JERUSALEM).alotHaShachar;
    expect(judgeDay(day('2026-12-14'), input, new Date(alot.getTime() - 1)).pending).toEqual(['chok_leyisrael']);
    expect(judgeDay(day('2026-12-14'), input, alot).missed).toEqual(['chok_leyisrael']);
  });

  it('puts the Friday window, which ends at candle lighting, in the check-in of that Shabbat', () => {
    const mincha = WITH_CONTENT.mitzvot.findMitzvah('mincha')!;
    const block = HebcalService.holyBlockOn(at(JERUSALEM, '2026-12-19T12:00'), JERUSALEM)!;
    expect(windowOn(JERUSALEM, '2026-12-18', IL)!.end.getTime()).toBe(block.start.getTime());
    const checkIn = WITH_CONTENT.checkIn.checkInFor(
      block,
      { mitzvot: [CHOK, mincha], completions: {}, checkIns: {}, location: JERUSALEM, settings: IL },
      block.end,
    )!;
    expect(checkIn.days.map((entry) => [entry.key, entry.items.map((item) => item.mitzvah.id)])).toEqual([
      ['2026-12-18', ['chok_leyisrael', 'mincha']],
      ['2026-12-19', ['mincha']],
    ]);
    expect(WITH_CONTENT.checkIn.pendingCheckInIds(checkIn, '2026-12-18')).toEqual(
      new Set(['chok_leyisrael', 'mincha']),
    );
  });

  it('keeps an unmarked Friday pending until the check-in is finished or its deadline, and a mark fills the day', () => {
    const input = { mitzvot: [CHOK], completions: {}, checkIns: {}, location: JERUSALEM, settings: IL };
    const sunday = at(JERUSALEM, '2026-12-20T12:00');
    expect(judgeDay(day('2026-12-18'), input, sunday)).toEqual({
      key: '2026-12-18',
      done: [],
      missed: [],
      pending: ['chok_leyisrael'],
    });
    expect(judgeDay(day('2026-12-18'), { ...input, checkIns: { '2026-12-19': MARK } }, sunday).missed).toEqual([
      'chok_leyisrael',
    ]);
    expect(judgeDay(day('2026-12-18'), input, at(JERUSALEM, '2026-12-21T12:00')).missed).toEqual(['chok_leyisrael']);
    const deadline = zmanimFor(at(JERUSALEM, '2026-12-21T12:00'), JERUSALEM).alotHaShachar;
    expect(judgeDay(day('2026-12-18'), input, new Date(deadline.getTime() - 1)).pending).toEqual(['chok_leyisrael']);
    expect(judgeDay(day('2026-12-18'), input, deadline).missed).toEqual(['chok_leyisrael']);
    const marked = { ...input, completions: { '2026-12-18': { chok_leyisrael: MARK } } };
    expect(judgeDay(day('2026-12-18'), marked, sunday).done).toEqual(['chok_leyisrael']);
    const block = HebcalService.holyBlockOn(at(JERUSALEM, '2026-12-19T12:00'), JERUSALEM)!;
    const settled = WITH_CONTENT.checkIn.checkInFor(block, marked, block.end)!;
    expect(settled.days[0].items).toMatchObject([{ mitzvah: { id: 'chok_leyisrael' }, done: true }]);
    expect(settled.finished).toBe(true);
  });

  it('puts the erev Yom Tov window in that Yom Tov check-in, and the Friday of chol hamoed in the Shabbat one', () => {
    const input = { mitzvot: [CHOK], completions: {}, checkIns: {}, location: JERUSALEM, settings: IL };
    const pesach = HebcalService.holyBlockOn(at(JERUSALEM, '2027-04-22T12:00'), JERUSALEM)!;
    expect(windowOn(JERUSALEM, '2027-04-21', IL)!.end.getTime()).toBe(pesach.start.getTime());
    const yomTov = WITH_CONTENT.checkIn.checkInFor(pesach, input, pesach.end)!;
    expect(yomTov.days.map((entry) => [entry.key, entry.items.map((item) => item.mitzvah.id)])).toEqual([
      ['2027-04-21', ['chok_leyisrael']],
    ]);
    expect(judgeDay(day('2027-04-21'), input, at(JERUSALEM, '2027-04-23T12:00')).pending).toEqual(['chok_leyisrael']);
    const shabbat = HebcalService.holyBlockOn(at(JERUSALEM, '2027-04-24T12:00'), JERUSALEM)!;
    const cholHamoed = WITH_CONTENT.checkIn.checkInFor(shabbat, input, shabbat.end)!;
    expect(cholHamoed.days.map((entry) => entry.key)).toEqual(['2027-04-23']);
  });
});
