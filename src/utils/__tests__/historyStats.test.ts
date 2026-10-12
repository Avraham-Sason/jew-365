import { computeStats, isTrackedInRange, judgeDay, type HistoryInput } from '../historyStats';
import { calendarDay } from '../checkIn';
import { locationNoon } from '../locationDay';
import { Mitzvah } from '@/types/mitzvah';
import { CITIES } from '@/data/cities';
import { findMitzvah } from '@/data/mitzvot';
import { dateKey } from '@/stores/useCompletionsStore';
import { at, zmanimFor } from '@/testing/zmanim';

function fixtureMitzvah(id: string, skipOn: Mitzvah['skipOn'] = []): Mitzvah {
  return {
    id,
    name: { he: id },
    icon: id,
    timeType: 'range-within-day',
    category: 'daily-morning',
    skipOn,
    nuschaotSupported: ['ashkenaz'],
    defaultReminders: [],
    // A morning window on the day the zmanim belong to: the location's, whatever the device zone.
    computeWindow: ({ zmanim }) => ({ start: zmanim.netzHaChama, end: zmanim.sofZmanShmaGra }),
  };
}

const settings = { nusach: 'ashkenaz' as const, halachicOpinions: { ksSofZman: 'GRA' as const }, inIsrael: true };

describe('historyStats', () => {
  it('keeps an item open past midnight while its window still runs', () => {
    const night: Mitzvah = {
      ...fixtureMitzvah('night'),
      computeWindow: () => ({ start: at(CITIES[0], '2026-05-06T20:00'), end: at(CITIES[0], '2026-05-07T03:00') }),
    };
    const input = { mitzvot: [night], completions: {}, location: CITIES[0], settings };
    const day = new Date(2026, 4, 6);
    const verdictAt = (wallClock: string) => judgeDay(day, input, at(CITIES[0], wallClock));
    const pending = { key: '2026-05-06', done: [], missed: [], pending: ['night'] };
    expect(verdictAt('2026-05-07T01:00')).toEqual(pending);
    expect(verdictAt('2026-05-07T04:00')).toEqual(pending);
    expect(verdictAt('2026-05-07T05:00')).toEqual({ key: '2026-05-06', done: [], missed: ['night'], pending: [] });
  });

  it('computes a three-day streak when the fourth day back has a gap', () => {
    const today = at(CITIES[0], '2026-05-07T12:00');
    const stats = computeStats(
      [fixtureMitzvah('daily')],
      {
        '2026-05-07': { daily: Date.now() },
        '2026-05-06': { daily: Date.now() },
        '2026-05-05': { daily: Date.now() },
        '2026-05-03': { daily: Date.now() },
      },
      CITIES[0],
      settings,
      7,
      today,
    );

    expect(stats.streak).toBe(3);
    expect(stats.perMitzvah.daily).toMatchObject({ done: 4, eligible: 7, percent: 57 });
  });

  it('counts a day whose only mark is a retired mitzvah id toward the streak and nowhere else', () => {
    const today = at(CITIES[0], '2026-05-07T12:00');
    const stats = computeStats(
      [fixtureMitzvah('daily')],
      {
        '2026-05-07': { daily: Date.now() },
        '2026-05-06': { tzitzit: Date.now() },
        '2026-05-05': { daily: Date.now() },
      },
      CITIES[0],
      settings,
      7,
      today,
    );

    expect(stats.streak).toBe(3);
    expect(stats.perMitzvah).not.toHaveProperty('tzitzit');
    expect(stats.perMitzvah.daily).toMatchObject({ done: 2, eligible: 7 });
    expect(stats.daily.find((entry) => entry.date === '2026-05-06')).toMatchObject({ doneCount: 0, totalCount: 1 });
  });

  it('keeps a 23:59 completion on that date key', () => {
    const ts = at(CITIES[0], '2026-05-06T23:59').getTime();
    const stats = computeStats(
      [fixtureMitzvah('daily')],
      { '2026-05-06': { daily: ts } },
      CITIES[0],
      settings,
      1,
      at(CITIES[0], '2026-05-06T12:00'),
    );

    expect(stats.daily[0]).toMatchObject({ date: '2026-05-06', doneCount: 1, totalCount: 1 });
  });

  it('removes Shabbat from eligibility for skipOn shabbat mitzvot', () => {
    const stats = computeStats(
      [fixtureMitzvah('weekday', ['shabbat'])],
      {},
      CITIES[0],
      settings,
      1,
      at(CITIES[0], '2026-05-02T12:00'),
    );

    expect(stats.daily[0]).toMatchObject({ date: '2026-05-02', doneCount: 0, totalCount: 0 });
    expect(stats.perMitzvah.weekday).toMatchObject({ done: 0, eligible: 0, percent: 0 });
  });
});

describe('historyStats tracking range', () => {
  const location = CITIES[0];
  const now = at(location, '2026-05-07T08:00');

  function windowOn(id: string, ...keys: string[]): Mitzvah {
    const base = fixtureMitzvah(id);
    return { ...base, computeWindow: (ctx) => (keys.includes(dateKey(ctx.date)) ? base.computeWindow(ctx) : null) };
  }

  it('a mitzvah with no window on any day of the range is not tracked', () => {
    const stats = computeStats([windowOn('omer')], {}, location, settings, 7, now);
    expect(stats.perMitzvah.omer).toEqual({ done: 0, eligible: 0, pending: 0, percent: 0 });
    expect(isTrackedInRange(stats.perMitzvah.omer)).toBe(false);
  });

  it('a mitzvah whose window is open only today is tracked while still pending', () => {
    const stats = computeStats([windowOn('today', '2026-05-07')], {}, location, settings, 7, now);
    expect(stats.perMitzvah.today).toEqual({ done: 0, eligible: 0, pending: 1, percent: 0 });
    expect(isTrackedInRange(stats.perMitzvah.today)).toBe(true);
  });

  it('a decided mitzvah is tracked, missed or done', () => {
    const stats = computeStats(
      [windowOn('missed', '2026-05-06'), windowOn('kept', '2026-05-06')],
      { '2026-05-06': { kept: Date.now() } },
      location,
      settings,
      7,
      now,
    );
    expect(stats.perMitzvah.missed).toMatchObject({ done: 0, eligible: 1, pending: 0, percent: 0 });
    expect(stats.perMitzvah.kept).toMatchObject({ done: 1, eligible: 1, pending: 0, percent: 100 });
    expect(isTrackedInRange(stats.perMitzvah.missed)).toBe(true);
    expect(isTrackedInRange(stats.perMitzvah.kept)).toBe(true);
  });

  it('a mitzvah skipped on every day of the range is not tracked', () => {
    const stats = computeStats(
      [fixtureMitzvah('weekday', ['shabbat'])],
      {},
      location,
      settings,
      1,
      at(location, '2026-05-02T12:00'),
    );
    expect(isTrackedInRange(stats.perMitzvah.weekday)).toBe(false);
  });
});

describe('historyStats around Shabbat', () => {
  const mitzvot = [fixtureMitzvah('daily')];
  const location = CITIES[0];
  const done = (...keys: string[]) => Object.fromEntries(keys.map((key) => [key, { daily: 1 }]));
  // Wednesday to Friday marked; Shabbat Noach 5787 is 2026-11-14.
  const weekdays = done('2026-11-11', '2026-11-12', '2026-11-13');
  const streakAt = (completions: ReturnType<typeof done>, now: Date, extra = {}) =>
    computeStats(mitzvot, completions, location, settings, 7, now, extra).streak;

  it('a Shabbat waiting for its check-in neither counts nor breaks', () => {
    expect(streakAt(weekdays, at(location, '2026-11-15T08:00'))).toBe(3);
  });

  it('a Shabbat marked in the check-in counts like any other day', () => {
    expect(streakAt({ ...weekdays, ...done('2026-11-14') }, at(location, '2026-11-15T08:00'))).toBe(4);
  });

  it('a Shabbat left unmarked breaks the streak once the check-in closes', () => {
    expect(streakAt({ ...weekdays, ...done('2026-11-15') }, at(location, '2026-11-16T08:00'))).toBe(1);
  });

  it('finishing the check-in early closes it at once', () => {
    expect(streakAt(weekdays, at(location, '2026-11-15T08:00'), { checkIns: { '2026-11-14': 1 } })).toBe(0);
  });

  it('counts an item toward its percentage only once it can no longer be marked', () => {
    const stats = computeStats(mitzvot, weekdays, location, settings, 7, at(location, '2026-11-15T08:00'));
    // Mon and Tue missed, Wed-Fri done; Shabbat waits for its check-in and today is still open.
    expect(stats.perMitzvah.daily).toMatchObject({ done: 3, eligible: 5, percent: 60 });
    const shabbat = stats.daily.find((day) => day.date === '2026-11-14')!;
    expect(shabbat).toMatchObject({ doneCount: 0, totalCount: 1, pendingCount: 1 });
    // Sunday morning, so "yesterday" is that Shabbat: nothing is missed there yet.
    expect(stats.missedYesterday).toEqual([]);
  });

  it('is not capped by the 30-day window', () => {
    const keys = Array.from({ length: 45 }, (_, back) => {
      const day = new Date(2026, 10, 15 - back);
      return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    });
    expect(computeStats(mitzvot, done(...keys), location, settings, 30, at(location, '2026-11-15T20:00')).streak).toBe(
      45,
    );
  });

  it('a skipped Shabbat mitzvah is settled as not done, not left waiting', () => {
    const stats = computeStats(mitzvot, weekdays, location, settings, 7, at(location, '2026-11-15T08:00'), {
      skipped: { '2026-11-14': { daily: 1 } },
    });
    expect(stats.daily.find((day) => day.date === '2026-11-14')).toMatchObject({
      pendingCount: 0,
      doneCount: 0,
      totalCount: 1,
    });
    expect(stats.streak).toBe(0);
  });

  it('a mitzvah switched on later is not judged on the days before', () => {
    const later = fixtureMitzvah('later');
    const marked = done('2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15');
    const enabledSince = { later: at(location, '2026-11-15T09:00').getTime() };
    const stats = computeStats([mitzvot[0], later], marked, location, settings, 7, at(location, '2026-11-15T20:00'), {
      enabledSince,
    });
    expect(stats.streak).toBe(5);
    expect(stats.perMitzvah.later.eligible).toBe(0);
  });

  it('with nothing enabled the walk does not wander across empty days', () => {
    const sparse = done('2026-11-15', '2026-11-01');
    expect(computeStats([], sparse, location, settings, 30, at(location, '2026-11-15T20:00')).streak).toBe(1);
  });

  it('reaches past retention through the archive of kept days', () => {
    const recent = done('2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15');
    const now = at(location, '2026-11-15T20:00');
    const kept = computeStats(mitzvot, recent, location, settings, 30, now, {
      archivedDays: [['2025-10-01', '2026-11-10']],
    });
    const days = Math.round((new Date(2026, 10, 15).getTime() - new Date(2025, 9, 1).getTime()) / 86_400_000) + 1;
    expect(kept.streak).toBe(days);
    const gap = computeStats(mitzvot, recent, location, settings, 30, now, {
      archivedDays: [['2025-10-01', '2026-11-09']],
    });
    expect(gap.streak).toBe(5);
  });
});

describe('the night belongs to the evening before', () => {
  const location = CITIES[0];
  const maariv = findMitzvah('maariv')!;
  const shacharit = findMitzvah('shacharit')!;
  const alotOf = (key: string) => zmanimFor(locationNoon(calendarDay(key), location), location).alotHaShachar;
  const JUNE_14 = calendarDay('2027-06-14');
  const verdictAt = (instant: Date, extra: Partial<HistoryInput> = {}) =>
    judgeDay(JUNE_14, { mitzvot: [maariv, shacharit], completions: {}, location, settings, ...extra }, instant);

  it('files a maariv marked at 00:30 under the evening it belongs to, and judges the day before as over', () => {
    const stats = computeStats(
      [maariv],
      { '2027-06-14': { maariv: at(location, '2027-06-15T00:30').getTime() } },
      location,
      settings,
      2,
      at(location, '2027-06-15T00:30'),
    );
    expect(stats.daily.map((entry) => entry.date)).toEqual(['2027-06-13', '2027-06-14']);
    expect(stats.daily[1]).toMatchObject({ doneCount: 1, totalCount: 1, pendingCount: 0 });
    expect(stats.daily[0]).toMatchObject({ doneCount: 0, totalCount: 1, pendingCount: 0 });
    expect(stats.streak).toBe(1);
  });

  it('keeps the streak through an unmarked evening until alot, then breaks it', () => {
    const streakAt = (wallClock: string) =>
      computeStats([maariv], { '2027-06-13': { maariv: 1 } }, location, settings, 3, at(location, wallClock)).streak;
    expect(streakAt('2027-06-15T00:20')).toBe(1);
    expect(streakAt('2027-06-15T04:30')).toBe(0);
  });

  it('leaves every item of the evening open until the next alot, then calls it missed', () => {
    const pending = { key: '2027-06-14', done: [], missed: [], pending: ['maariv', 'shacharit'] };
    const missed = { key: '2027-06-14', done: [], missed: ['maariv', 'shacharit'], pending: [] };
    const alot = alotOf('2027-06-15');
    expect(verdictAt(at(location, '2027-06-15T00:20'))).toEqual(pending);
    expect(verdictAt(at(location, '2027-06-15T01:30'))).toEqual(pending);
    expect(verdictAt(new Date(alot.getTime() - 1))).toEqual(pending);
    expect(verdictAt(alot)).toEqual(missed);
    expect(verdictAt(at(location, '2027-06-15T04:30'))).toEqual(missed);
  });

  it('does not judge a mitzvah on an evening that ended before it was switched on', () => {
    const duringTheNight = { maariv: at(location, '2027-06-15T00:10').getTime() };
    expect(verdictAt(at(location, '2027-06-15T04:30'), { enabledSince: duringTheNight }).missed).toContain('maariv');
    const afterAlot = { maariv: at(location, '2027-06-15T04:20').getTime() };
    const verdict = verdictAt(at(location, '2027-06-15T04:30'), { enabledSince: afterAlot });
    expect([...verdict.done, ...verdict.missed, ...verdict.pending]).not.toContain('maariv');
  });
});
