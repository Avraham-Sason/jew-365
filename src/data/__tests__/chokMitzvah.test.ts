import { DateTime } from 'luxon';
import { iconFor } from '@/components/MitzvahIcon';
import { CITIES } from '@/data/cities';
import { getAllMitzvot } from '@/data/customMitzvotAdapter';
import { CHOK_LEYISRAEL, MITZVOT, findMitzvah } from '@/data/mitzvot';
import { hasSiddurText, siddurPlace } from '@/data/siddur';
import { rulesFor } from '@/data/taharahPresets';
import { HebcalService } from '@/services/HebcalService';
import { MITZVAH_REMINDER_CATEGORY, MITZVAH_TEXT_CATEGORY } from '@/services/notifications/ids';
import { buildPlan } from '@/services/notifications/plan';
import { buildTriggerTime } from '@/services/notifications/planners/mitzvot';
import type { PlanInput } from '@/services/notifications/types';
import { useChokStore } from '@/stores/useChokStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { installChokFixture } from '@/testing/chok';
import { at, zmanimFor } from '@/testing/zmanim';
import type { Mitzvah, UserSettings } from '@/types/mitzvah';
import type { Location } from '@/types/zmanim';
import { checkInFor, pendingCheckInIds } from '@/utils/checkIn';
import { computeStats, judgeDay } from '@/utils/historyStats';
import { reminderFires } from '@/utils/skipRules';

const JERUSALEM = CITIES[0];
const LOS_ANGELES = CITIES.find((city) => city.nameEn === 'Los Angeles')!;
const LONDON = CITIES.find((city) => city.cityId === 'london')!;
const NEW_YORK = CITIES.find((city) => city.cityId === 'new-york')!;
const IL: UserSettings = { nusach: 'ashkenaz', halachicOpinions: { ksSofZman: 'GRA' }, inIsrael: true };
const ABROAD: UserSettings = { ...IL, inIsrael: false };
const MARK = 1_000;
const DURATION = /[0-9]|שעה|דק/;

beforeEach(() => {
  installChokFixture();
});

afterEach(() => {
  useChokStore.getState().reset();
});

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

const CHOK: Mitzvah = findMitzvah('chok_leyisrael')!;

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
    const trigger = buildTriggerTime(reminder, window, location);
    return reminderFires(trigger, window, location, before) ? clock(trigger, location) : null;
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
  it('is a learning mitzvah, off by default, always last in the registry', () => {
    expect(MITZVOT[MITZVOT.length - 1]).toBe(CHOK);
    expect(CHOK).toBe(CHOK_LEYISRAEL);
    expect(CHOK.name).toEqual({ he: 'חק לישראל', en: 'Chok LeYisrael' });
    expect(CHOK.category).toBe('learning');
    expect(iconFor(CHOK.icon)).toBe('chok');
    expect(CHOK.skipOn).toEqual(['shabbat', 'yomtov']);
    expect(CHOK.nuschaotSupported).toEqual(['ashkenaz', 'sefard', 'edot_hamizrach', 'chabad']);
    expect(useMitzvotStore.getState().activeMitzvot.chok_leyisrael).toEqual({ enabled: false });
  });

  it('has one morning reminder at 09:00 on the clock of the location, with three bodies and no duration', () => {
    expect(CHOK.defaultReminders).toEqual([
      {
        anchor: 'clock',
        offsetMin: 540,
        label: 'זמן לימוד חק לישראל',
        bodyVariants: ['זמן לימוד חק לישראל', 'חק לישראל של היום מחכה לך', 'כמה דקות של תורה עם חק לישראל'],
      },
    ]);
    expect(CHOK.defaultReminders.filter((reminder) => DURATION.test(reminder.label))).toEqual([]);
  });

  it('reaches an install saved before it existed, switched off, through the merge', () => {
    const merge = useMitzvotStore.persist.getOptions().merge!;
    const merged = merge({ activeMitzvot: { tefillin: { enabled: true } } }, useMitzvotStore.getState()).activeMitzvot;
    expect(merged.chok_leyisrael).toEqual({ enabled: false });
    expect(merged.tefillin).toEqual({ enabled: true });
  });
});

describe('while the add-on is not installed', () => {
  beforeEach(() => {
    useChokStore.getState().reset();
  });

  it('is still listed, switched off, but has no window or text', () => {
    expect(MITZVOT.map((mitzvah) => mitzvah.id)).toContain('chok_leyisrael');
    expect(findMitzvah('chok_leyisrael')).toBe(CHOK);
    expect(getAllMitzvot().map((mitzvah) => mitzvah.id)).toContain('chok_leyisrael');
    expect(useMitzvotStore.getState().activeMitzvot.chok_leyisrael).toEqual({ enabled: false });
    expect(windowOn(JERUSALEM, '2026-12-14', IL)).toBeNull();
    expect(hasSiddurText(CHOK, 'ashkenaz', day('2026-12-14'), siddurPlace(JERUSALEM, true))).toBe(false);
  });

  it('plans nothing for it even with every mitzvah switched on', () => {
    const plan = buildPlan(planInput({ mitzvot: MITZVOT }));
    expect(plan.some((candidate) => candidate.id.startsWith('chok_leyisrael'))).toBe(false);
  });

  it('gets its window back when the add-on is installed, and loses it again when it is deleted', () => {
    expect(windowOn(JERUSALEM, '2026-12-14', IL)).toBeNull();
    installChokFixture();
    expect(windowOn(JERUSALEM, '2026-12-14', IL)).not.toBeNull();
    useChokStore.getState().reset();
    expect(windowOn(JERUSALEM, '2026-12-14', IL)).toBeNull();
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

describe('the default reminder at 09:00 on the clock of the location', () => {
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
    [JERUSALEM, IL],
    [LOS_ANGELES, ABROAD],
  ] as const)('fires at 09:00 on a weekday, an erev and a Friday in %s, %s', (location, settings) => {
    for (const iso of ['2026-12-14', '2027-06-14', '2026-12-18', '2027-06-18', '2027-04-21']) {
      expect(fireTimes(location, iso, settings)).toEqual([`${iso} 09:00`]);
    }
  });

  it.each([
    ['Jerusalem', JERUSALEM, IL],
    ['London', LONDON, ABROAD],
    ['New York', NEW_YORK, ABROAD],
  ] as const)('fires at 09:00 on one ordinary weekday of every month in %s', (_name, location, settings) => {
    for (const iso of ORDINARY_TUESDAYS) {
      expect(fireTimes(location, iso, settings)).toEqual([`${iso} 09:00`]);
    }
  });

  it.each([
    ['Jerusalem', JERUSALEM, IL],
    ['New York', NEW_YORK, ABROAD],
  ] as const)('fires on every Friday of the year in %s, before candle lighting', (_name, location, settings) => {
    const fridays = fridaysFrom('2026-10-02', 52).filter((iso) => windowOn(location, iso, settings));
    expect(fridays.length).toBeGreaterThan(40);
    for (const iso of fridays) {
      expect(fireTimes(location, iso, settings)).toEqual([`${iso} 09:00`]);
    }
  });

  it('plans the Friday reminder in London, offering the text', () => {
    const now = at(LONDON, '2027-06-17T03:00');
    const candidates = buildPlan(planInput({ now, fromDate: now, location: LONDON, settings: ABROAD })).filter(
      (candidate) => candidate.id.startsWith('chok_leyisrael__'),
    );
    expect(candidates.map((candidate) => [candidate.id, clock(candidate.trigger, LONDON)])).toEqual([
      ['chok_leyisrael__2027-06-17__0', '2027-06-17 09:00'],
      ['chok_leyisrael__2027-06-18__0', '2027-06-18 09:00'],
      ['chok_leyisrael__2027-06-20__0', '2027-06-20 09:00'],
    ]);
    const friday = candidates.find((candidate) => candidate.id === 'chok_leyisrael__2027-06-18__0')!;
    expect(friday.categoryIdentifier).toBe(MITZVAH_TEXT_CATEGORY);
    expect(friday.data).toMatchObject({ dateKey: '2027-06-18', reminderIndex: 0, hasText: true });
  });

  it('stays quiet once the day is marked done', () => {
    const now = at(LONDON, '2027-06-17T03:00');
    const completions = { '2027-06-18': { chok_leyisrael: MARK } };
    const ids = buildPlan(planInput({ now, fromDate: now, location: LONDON, settings: ABROAD, completions }))
      .filter((candidate) => candidate.id.startsWith('chok_leyisrael__2027-06-18'))
      .map((candidate) => candidate.id);
    expect(ids).toEqual([]);
  });
});

describe('hasSiddurText', () => {
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

  it('offers none for a week whose parashiyot are not all in the installed add-on', () => {
    installChokFixture(['Noach', 'Vayakhel']);
    const place = siddurPlace(JERUSALEM, true);
    expect(hasSiddurText(CHOK, 'ashkenaz', day('2026-10-12'), place)).toBe(true);
    expect(hasSiddurText(CHOK, 'ashkenaz', day('2026-10-19'), place)).toBe(false);
    expect(hasSiddurText(CHOK, 'ashkenaz', day('2028-03-20'), place)).toBe(false);
  });
});

describe('the scheduler', () => {
  const chokCandidates = (input: PlanInput) =>
    buildPlan(input).filter((candidate) => candidate.id.startsWith('chok_leyisrael__'));

  it('plans the one reminder on weekdays and on Friday, each offering the text', () => {
    const candidates = chokCandidates(planInput());
    expect(candidates.map((candidate) => [candidate.id, clock(candidate.trigger, JERUSALEM)])).toEqual([
      ['chok_leyisrael__2026-12-17__0', '2026-12-17 09:00'],
      ['chok_leyisrael__2026-12-18__0', '2026-12-18 09:00'],
      ['chok_leyisrael__2026-12-20__0', '2026-12-20 09:00'],
    ]);
    expect(new Set(candidates.map((candidate) => candidate.categoryIdentifier))).toEqual(
      new Set([MITZVAH_TEXT_CATEGORY]),
    );
    expect(candidates[0].data).toMatchObject({
      mitzvahId: 'chok_leyisrael',
      dateKey: '2026-12-17',
      reminderIndex: 0,
      hasText: true,
    });
  });

  it('plans the same abroad', () => {
    const now = at(LOS_ANGELES, '2027-06-17T03:00');
    const candidates = chokCandidates(planInput({ now, fromDate: now, location: LOS_ANGELES, settings: ABROAD }));
    expect(candidates.map((candidate) => [candidate.id, clock(candidate.trigger, LOS_ANGELES)])).toEqual([
      ['chok_leyisrael__2027-06-17__0', '2027-06-17 09:00'],
      ['chok_leyisrael__2027-06-18__0', '2027-06-18 09:00'],
      ['chok_leyisrael__2027-06-20__0', '2027-06-20 09:00'],
    ]);
  });

  it('skips Yom Tov, and a day already marked', () => {
    const now = at(JERUSALEM, '2027-04-20T03:00');
    const completions = { '2027-04-25': { chok_leyisrael: MARK } };
    const candidates = chokCandidates(planInput({ now, fromDate: now, completions }));
    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'chok_leyisrael__2027-04-20__0',
      'chok_leyisrael__2027-04-21__0',
      'chok_leyisrael__2027-04-23__0',
    ]);
  });

  it('gives mark-done only when the week has no asset', () => {
    installChokFixture(['Noach']);
    const candidates = chokCandidates(planInput());
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map((candidate) => candidate.categoryIdentifier))).toEqual(
      new Set([MITZVAH_REMINDER_CATEGORY]),
    );
    expect(candidates.every((candidate) => candidate.data.hasText === false)).toBe(true);
  });
});

describe('history, the streak and the check-in', () => {
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
    const mincha = findMitzvah('mincha')!;
    const block = HebcalService.holyBlockOn(at(JERUSALEM, '2026-12-19T12:00'), JERUSALEM)!;
    expect(windowOn(JERUSALEM, '2026-12-18', IL)!.end.getTime()).toBe(block.start.getTime());
    const checkIn = checkInFor(
      block,
      { mitzvot: [CHOK, mincha], completions: {}, checkIns: {}, location: JERUSALEM, settings: IL },
      block.end,
    )!;
    expect(checkIn.days.map((entry) => [entry.key, entry.items.map((item) => item.mitzvah.id)])).toEqual([
      ['2026-12-18', ['chok_leyisrael', 'mincha']],
      ['2026-12-19', ['mincha']],
    ]);
    expect(pendingCheckInIds(checkIn, '2026-12-18')).toEqual(new Set(['chok_leyisrael', 'mincha']));
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
    const settled = checkInFor(block, marked, block.end)!;
    expect(settled.days[0].items).toMatchObject([{ mitzvah: { id: 'chok_leyisrael' }, done: true }]);
    expect(settled.finished).toBe(true);
  });

  it('puts the erev Yom Tov window in that Yom Tov check-in, and the Friday of chol hamoed in the Shabbat one', () => {
    const input = { mitzvot: [CHOK], completions: {}, checkIns: {}, location: JERUSALEM, settings: IL };
    const pesach = HebcalService.holyBlockOn(at(JERUSALEM, '2027-04-22T12:00'), JERUSALEM)!;
    expect(windowOn(JERUSALEM, '2027-04-21', IL)!.end.getTime()).toBe(pesach.start.getTime());
    const yomTov = checkInFor(pesach, input, pesach.end)!;
    expect(yomTov.days.map((entry) => [entry.key, entry.items.map((item) => item.mitzvah.id)])).toEqual([
      ['2027-04-21', ['chok_leyisrael']],
    ]);
    expect(judgeDay(day('2027-04-21'), input, at(JERUSALEM, '2027-04-23T12:00')).pending).toEqual(['chok_leyisrael']);
    const shabbat = HebcalService.holyBlockOn(at(JERUSALEM, '2027-04-24T12:00'), JERUSALEM)!;
    const cholHamoed = checkInFor(shabbat, input, shabbat.end)!;
    expect(cholHamoed.days.map((entry) => entry.key)).toEqual(['2027-04-23']);
  });
});
