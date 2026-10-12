import {
  nextWeekEnd,
  previousWeekEnd,
  reportWeekEnd,
  shabbatOf,
  upcomingWeek,
  weekEndFor,
  weekEndOnOrBefore,
  weekStartFor,
  weekSummary,
} from '../weeklyReport';
import type { HistoryInput } from '../historyStats';
import { findMitzvah } from '@/data/mitzvot';
import { CITIES } from '@/data/cities';
import { HebcalService } from '@/services/HebcalService';
import { UserSettings } from '@/types/mitzvah';
import { at } from '@/testing/zmanim';
import { dateKey } from '@/stores/useCompletionsStore';
import { addDays } from '../historyStats';

const JERUSALEM = CITIES[0];
const SETTINGS: UserSettings = { nusach: 'ashkenaz', halachicOpinions: { ksSofZman: 'GRA' }, inIsrael: true };
const MITZVOT = ['shacharit', 'mincha', 'maariv'].map((id) => findMitzvah(id)!);
const SHACHARIT_AND_MAARIV = ['shacharit', 'maariv'].map((id) => findMitzvah(id)!);

const blockAround = (wallClock: string) => HebcalService.holyBlockAt(at(JERUSALEM, wallClock), JERUSALEM)!;
const day = (month: number, date: number, year = 2026) => new Date(year, month - 1, date);

const SHABBAT_NOACH = day(11, 14);
const WEEK_START = day(11, 8);
const MONDAY_AFTER = at(JERUSALEM, '2026-11-16T12:00');
const SATURDAY_NIGHT = at(JERUSALEM, '2026-11-14T21:00');

const ALL = { shacharit: 1, mincha: 1, maariv: 1 };
const COMPLETIONS = {
  '2026-11-08': ALL,
  '2026-11-09': { shacharit: 1 },
  '2026-11-10': ALL,
  '2026-11-12': { shacharit: 1, mincha: 1 },
  '2026-11-15': { shacharit: 1 },
  '2026-11-16': { shacharit: 1 },
};

function input(overrides: Partial<HistoryInput> = {}): HistoryInput {
  return {
    mitzvot: MITZVOT,
    completions: COMPLETIONS,
    checkIns: {},
    location: JERUSALEM,
    settings: SETTINGS,
    ...overrides,
  };
}

describe('weekEndFor', () => {
  it('is the Saturday of a plain Shabbat block', () => {
    const block = blockAround('2026-11-14T12:00');
    expect(block.days).toEqual(['2026-11-14']);
    expect(weekEndFor(block)).toEqual(SHABBAT_NOACH);
  });

  it('runs on to the last day when Yom Tov follows Shabbat: Rosh Hashana 5787, Saturday and Sunday', () => {
    const block = blockAround('2026-09-12T12:00');
    expect(block.days).toEqual(['2026-09-12', '2026-09-13']);
    expect(weekEndFor(block)).toEqual(day(9, 13));
  });

  it('is the Saturday itself when Yom Tov falls on it: the first day of Sukkot 5787', () => {
    const block = blockAround('2026-09-26T12:00');
    expect(block.days).toContain('2026-09-26');
    expect(weekEndFor(block)).toEqual(day(9, 26));
  });

  it('is null for a Yom Tov block in mid-week: Yom Kippur 5787 is a Monday', () => {
    const block = blockAround('2026-09-21T12:00');
    expect(block.days).toEqual(['2026-09-21']);
    expect(weekEndFor(block)).toBeNull();
  });
});

describe('shabbatOf', () => {
  it('maps a week end back to its Saturday', () => {
    expect(shabbatOf(day(11, 14))).toEqual(day(11, 14));
    expect(shabbatOf(day(9, 13))).toEqual(day(9, 12));
  });
});

describe('week navigation', () => {
  it('finds the latest week end whose block has ended, from any day after it', () => {
    expect(weekEndOnOrBefore(day(11, 16), JERUSALEM, MONDAY_AFTER)).toEqual(SHABBAT_NOACH);
    expect(weekEndOnOrBefore(day(11, 20), JERUSALEM, at(JERUSALEM, '2026-11-20T09:00'))).toEqual(SHABBAT_NOACH);
  });

  it('takes the week before while the block of this Saturday has not ended', () => {
    expect(weekEndOnOrBefore(day(11, 14), JERUSALEM, at(JERUSALEM, '2026-11-14T12:00'))).toEqual(day(11, 7));
    expect(weekEndOnOrBefore(day(11, 14), JERUSALEM, blockAround('2026-11-14T12:00').end)).toEqual(SHABBAT_NOACH);
  });

  it('counts the Sunday of a Shabbat and Yom Tov block as that week end', () => {
    const monday = at(JERUSALEM, '2026-09-14T09:00');
    expect(weekEndOnOrBefore(day(9, 14), JERUSALEM, monday)).toEqual(day(9, 13));
    expect(previousWeekEnd(day(9, 13), JERUSALEM, monday)).toEqual(day(9, 5));
    expect(nextWeekEnd(day(9, 5), JERUSALEM, monday)).toEqual(day(9, 13));
  });

  it('opens the latest week without a request, and otherwise the latest week end on or before the requested day', () => {
    expect(reportWeekEnd(null, JERUSALEM, MONDAY_AFTER)).toEqual(SHABBAT_NOACH);
    expect(reportWeekEnd(day(11, 14), JERUSALEM, MONDAY_AFTER)).toEqual(SHABBAT_NOACH);
    expect(reportWeekEnd(day(11, 10), JERUSALEM, MONDAY_AFTER)).toEqual(day(11, 7));
    expect(reportWeekEnd(day(9, 13), JERUSALEM, MONDAY_AFTER)).toEqual(day(9, 13));
  });

  it('never opens a week that has not happened: a future or unreadable request falls back to the latest', () => {
    expect(reportWeekEnd(day(1, 1, 2030), JERUSALEM, MONDAY_AFTER)).toEqual(SHABBAT_NOACH);
    expect(reportWeekEnd(day(11, 21), JERUSALEM, MONDAY_AFTER)).toEqual(SHABBAT_NOACH);
  });

  it('has no next week at the latest one', () => {
    const monday = at(JERUSALEM, '2026-09-14T09:00');
    expect(nextWeekEnd(day(9, 13), JERUSALEM, monday)).toBeNull();
    expect(nextWeekEnd(SHABBAT_NOACH, JERUSALEM, MONDAY_AFTER)).toBeNull();
    expect(nextWeekEnd(day(11, 7), JERUSALEM, MONDAY_AFTER)).toEqual(SHABBAT_NOACH);
    expect(previousWeekEnd(SHABBAT_NOACH, JERUSALEM, MONDAY_AFTER)).toEqual(day(11, 7));
  });

  it('starts a week on the day after the previous week end', () => {
    const afterRoshHashana = at(JERUSALEM, '2026-09-20T09:00');
    expect(weekStartFor(SHABBAT_NOACH, JERUSALEM, MONDAY_AFTER)).toEqual(WEEK_START);
    expect(weekStartFor(day(9, 13), JERUSALEM, afterRoshHashana)).toEqual(day(9, 6));
    expect(weekStartFor(day(9, 19), JERUSALEM, afterRoshHashana)).toEqual(day(9, 14));
    expect(weekStartFor(day(9, 5), JERUSALEM, afterRoshHashana)).toEqual(day(8, 30));
  });
});

describe('the weeks around Rosh Hashana 5787', () => {
  const now = at(JERUSALEM, '2026-09-20T09:00');
  const reportDays = (weekEnd: Date) =>
    weekSummary(input({ completions: {} }), weekStartFor(weekEnd, JERUSALEM, now), weekEnd, now).days.map(
      (entry) => entry.key,
    );

  it('reports the Sunday of Shabbat and Yom Tov in the week that ends on it, and opens the next week on Monday', () => {
    expect(reportDays(day(9, 13))).toEqual([
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
    expect(reportDays(day(9, 19))).toEqual([
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
    ]);
  });

  it('puts every day of three consecutive weeks in exactly one report', () => {
    const covered = [day(9, 5), day(9, 13), day(9, 19)].flatMap(reportDays);
    const expected = Array.from({ length: 21 }, (_, offset) => dateKey(addDays(day(8, 30), offset)));
    expect(covered).toEqual(expected);
  });
});

describe('weekSummary', () => {
  it('judges the seven days ending at the week end once the check-in has closed', () => {
    const summary = weekSummary(input(), WEEK_START, SHABBAT_NOACH, MONDAY_AFTER);

    expect(summary.weekEnd).toBe('2026-11-14');
    expect(summary.days).toEqual([
      { key: '2026-11-08', done: 3, missed: 0, pending: 0 },
      { key: '2026-11-09', done: 1, missed: 2, pending: 0 },
      { key: '2026-11-10', done: 3, missed: 0, pending: 0 },
      { key: '2026-11-11', done: 0, missed: 3, pending: 0 },
      { key: '2026-11-12', done: 2, missed: 1, pending: 0 },
      { key: '2026-11-13', done: 0, missed: 3, pending: 0 },
      { key: '2026-11-14', done: 0, missed: 3, pending: 0 },
    ]);
    expect([summary.done, summary.missed, summary.pending, summary.checkInPending]).toEqual([9, 12, 0, 0]);
    expect(summary.perMitzvah).toEqual([
      { id: 'maariv', done: 2, missed: 5, pending: 0 },
      { id: 'mincha', done: 3, missed: 4, pending: 0 },
      { id: 'shacharit', done: 4, missed: 3, pending: 0 },
    ]);
    expect(summary.improve).toEqual({ id: 'maariv', missed: 5 });
    expect(summary.bestDay).toBe('2026-11-08');
    expect(summary.streak).toBe(2);
  });

  it('keeps the Shabbat items waiting while the check-in is open, and settles them once it is finished', () => {
    const open = weekSummary(input(), WEEK_START, SHABBAT_NOACH, SATURDAY_NIGHT);

    expect(open.days.slice(-2)).toEqual([
      { key: '2026-11-13', done: 0, missed: 1, pending: 2 },
      { key: '2026-11-14', done: 0, missed: 0, pending: 3 },
    ]);
    expect([open.done, open.missed, open.pending]).toEqual([9, 7, 5]);
    expect(open.perMitzvah).toEqual([
      { id: 'maariv', done: 2, missed: 3, pending: 2 },
      { id: 'mincha', done: 3, missed: 2, pending: 2 },
      { id: 'shacharit', done: 4, missed: 2, pending: 1 },
    ]);
    expect(open.improve).toEqual({ id: 'maariv', missed: 3 });
    expect(open.streak).toBe(1);

    const finished = weekSummary(input({ checkIns: { '2026-11-14': 1 } }), WEEK_START, SHABBAT_NOACH, SATURDAY_NIGHT);
    expect(finished.days.slice(-2)).toEqual([
      { key: '2026-11-13', done: 0, missed: 3, pending: 0 },
      { key: '2026-11-14', done: 0, missed: 2, pending: 1 },
    ]);
    expect([finished.done, finished.missed, finished.pending]).toEqual([9, 11, 1]);
  });

  it('settles a skipped item at once as a miss, and ignores a mitzvah switched on after the week', () => {
    const skipped = weekSummary(
      input({ skipped: { '2026-11-13': { mincha: 1 } } }),
      WEEK_START,
      SHABBAT_NOACH,
      SATURDAY_NIGHT,
    );
    expect(skipped.days[5]).toEqual({ key: '2026-11-13', done: 0, missed: 2, pending: 1 });

    const lateMaariv = weekSummary(
      input({ enabledSince: { maariv: MONDAY_AFTER.getTime() } }),
      WEEK_START,
      SHABBAT_NOACH,
      MONDAY_AFTER,
    );
    expect(lateMaariv.perMitzvah.map((entry) => entry.id).sort()).toEqual(['mincha', 'shacharit']);
  });

  it('has no best day and nothing to improve in a week with no mitzvot, or a week without a miss', () => {
    const empty = weekSummary(input({ mitzvot: [], completions: {} }), WEEK_START, SHABBAT_NOACH, MONDAY_AFTER);
    expect(empty).toMatchObject({
      done: 0,
      missed: 0,
      pending: 0,
      perMitzvah: [],
      bestDay: null,
      improve: null,
      streak: 0,
    });

    const everyDay = Object.fromEntries(
      ['08', '09', '10', '11', '12', '13', '14'].map((date) => [`2026-11-${date}`, ALL]),
    );
    const perfect = weekSummary(input({ completions: everyDay }), WEEK_START, SHABBAT_NOACH, MONDAY_AFTER);
    expect([perfect.done, perfect.missed, perfect.pending]).toEqual([21, 0, 0]);
    expect(perfect.improve).toBeNull();
    expect(perfect.bestDay).toBe('2026-11-08');
  });

  describe('the check-in count', () => {
    const exit = blockAround('2026-11-14T12:00').end;
    const afterExit = new Date(exit.getTime() + 60_000);
    const beforeExit = new Date(exit.getTime() - 60_000);
    const waiting = { mitzvot: SHACHARIT_AND_MAARIV, completions: { '2026-11-13': { maariv: 1 } } };

    it('counts only what the open check-in waits for, while every open window counts as pending', () => {
      const open = weekSummary(input(waiting), WEEK_START, SHABBAT_NOACH, afterExit);
      expect(open.checkInPending).toBe(1);
      expect(open.pending).toBe(2);
    });

    it('drops to zero once the check-in is finished, though tonight is still open', () => {
      const finished = weekSummary(
        input({ ...waiting, checkIns: { '2026-11-14': 1 } }),
        WEEK_START,
        SHABBAT_NOACH,
        afterExit,
      );
      expect(finished.checkInPending).toBe(0);
      expect(finished.pending).toBe(1);
    });

    it('is zero when everything in the check-in is marked, and before the block has ended', () => {
      const marked = { '2026-11-13': { maariv: 1 }, '2026-11-14': { shacharit: 1 } };
      expect(
        weekSummary(input({ ...waiting, completions: marked }), WEEK_START, SHABBAT_NOACH, afterExit).checkInPending,
      ).toBe(0);
      expect(weekSummary(input(waiting), WEEK_START, SHABBAT_NOACH, beforeExit).checkInPending).toBe(0);
    });
  });

  describe('the night after Shabbat', () => {
    const justAfterMidnight = at(JERUSALEM, '2026-11-15T00:30');
    const maarivOnly = [findMitzvah('maariv')!];

    it('is filed under Saturday until alot: a mark is Saturday’s, and an unmarked maariv is still open', () => {
      const marked = weekSummary(
        input({ mitzvot: maarivOnly, completions: { '2026-11-14': { maariv: 1 } } }),
        WEEK_START,
        SHABBAT_NOACH,
        justAfterMidnight,
      );
      expect(marked.days[6]).toEqual({ key: '2026-11-14', done: 1, missed: 0, pending: 0 });
      const unmarked = weekSummary(
        input({ mitzvot: maarivOnly, completions: {} }),
        WEEK_START,
        SHABBAT_NOACH,
        justAfterMidnight,
      );
      expect(unmarked.days[6]).toEqual({ key: '2026-11-14', done: 0, missed: 0, pending: 1 });
    });

    it('still reports the week that Shabbat closed', () => {
      expect(reportWeekEnd(null, JERUSALEM, justAfterMidnight)).toEqual(SHABBAT_NOACH);
    });
  });

  it('has no best day while nothing was marked', () => {
    const none = weekSummary(input({ completions: {} }), WEEK_START, SHABBAT_NOACH, MONDAY_AFTER);
    expect(none.bestDay).toBeNull();
    expect(none.missed).toBe(21);
    expect(none.improve).toEqual({ id: 'maariv', missed: 7 });
  });
});

describe('upcomingWeek', () => {
  const SATURDAY = day(10, 10);
  const off = { inIsrael: true, enabled: false };

  it('lists the days of the next week that hold something, from the calendar', () => {
    expect(upcomingWeek(SATURDAY, JERUSALEM, 'he', off)).toEqual([
      { key: '2026-10-11', labels: ['ראש חודש חשון'] },
      { key: '2026-10-12', labels: ['ראש חודש חשון'] },
    ]);
    expect(upcomingWeek(SATURDAY, JERUSALEM, 'en', off)).toEqual([
      { key: '2026-10-11', labels: ['Rosh Chodesh Cheshvan'] },
      { key: '2026-10-12', labels: ['Rosh Chodesh Cheshvan'] },
    ]);
  });

  it('adds the hilulot of a day while the switch is on, in the language asked for', () => {
    const on = { inIsrael: true, enabled: true };
    expect(upcomingWeek(SATURDAY, JERUSALEM, 'he', on)).toEqual([
      { key: '2026-10-11', labels: ['ראש חודש חשון'] },
      { key: '2026-10-12', labels: ['ראש חודש חשון'] },
      { key: '2026-10-14', labels: ['הילולת רבי ישראל מרוז׳ין, הרב עובדיה יוסף'] },
    ]);
    expect(upcomingWeek(SATURDAY, JERUSALEM, 'en', on).pop()).toEqual({
      key: '2026-10-14',
      labels: ['Hilula of Rebbe Yisrael of Ruzhin, Rabbi Ovadia Yosef'],
    });
  });

  it('is empty in an ordinary week', () => {
    expect(upcomingWeek(day(11, 21), JERUSALEM, 'he', { inIsrael: true, enabled: false })).toEqual([]);
  });

  it('starts on the day after the week end and stops at the next Shabbat: the week after Rosh Hashana 5787', () => {
    expect(upcomingWeek(day(9, 13), JERUSALEM, 'en', off).map((event) => event.key)).toEqual(['2026-09-14']);
  });

  it('runs on to the last day of a Yom Tov that follows the next Shabbat: the week before Rosh Hashana 5787', () => {
    expect(upcomingWeek(day(9, 5), JERUSALEM, 'en', off).map((event) => event.key)).toEqual([
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
  });

  it('lists chol hamoed, Hoshana Raba and Shmini Atzeret: the week after the first day of Sukkot 5787', () => {
    const events = upcomingWeek(day(9, 26), JERUSALEM, 'he', off);
    expect(events.map((event) => event.key)).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    events.slice(0, 5).forEach((event) => expect(event.labels.join(' ')).toContain('חוה״מ'));
    expect(events[5].labels.join(' ')).toContain('הושענא רבה');
    expect(events[6].labels.join(' ')).toContain('שמיני עצרת');
  });

  it('lists the erev of a chag: the week after Shabbat Shuva 5787 opens with Erev Yom Kippur', () => {
    const events = upcomingWeek(day(9, 19), JERUSALEM, 'he', off);
    expect(events[0]).toEqual({ key: '2026-09-20', labels: ['ערב יום כפור'] });
    expect(events[1].key).toBe('2026-09-21');
    expect(events[1].labels.join(' ')).toContain('יום כפור');
    expect(events.map((event) => event.key)).toContain('2026-09-25');
  });
});
