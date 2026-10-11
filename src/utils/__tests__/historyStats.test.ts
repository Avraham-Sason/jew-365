import { computeStats, isTrackedInRange, judgeDay } from '../historyStats';
import { Mitzvah } from '@/types/mitzvah';
import { CITIES } from '@/data/cities';
import { dateKey } from '@/stores/useCompletionsStore';

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
      computeWindow: () => ({ start: new Date(2026, 4, 6, 20), end: new Date(2026, 4, 7, 3) }),
    };
    const input = { mitzvot: [night], completions: {}, location: CITIES[0], settings };
    const day = new Date(2026, 4, 6);
    expect(judgeDay(day, input, new Date(2026, 4, 7, 1))).toEqual({
      key: '2026-05-06',
      done: [],
      missed: [],
      pending: ['night'],
    });
    expect(judgeDay(day, input, new Date(2026, 4, 7, 4))).toEqual({
      key: '2026-05-06',
      done: [],
      missed: ['night'],
      pending: [],
    });
  });

  it('computes a three-day streak when the fourth day back has a gap', () => {
    const today = new Date(2026, 4, 7);
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
    const today = new Date(2026, 4, 7);
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
    const ts = new Date(2026, 4, 6, 23, 59).getTime();
    const stats = computeStats(
      [fixtureMitzvah('daily')],
      { '2026-05-06': { daily: ts } },
      CITIES[0],
      settings,
      1,
      new Date(2026, 4, 6),
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
      new Date(2026, 4, 2),
    );

    expect(stats.daily[0]).toMatchObject({ date: '2026-05-02', doneCount: 0, totalCount: 0 });
    expect(stats.perMitzvah.weekday).toMatchObject({ done: 0, eligible: 0, percent: 0 });
  });
});

describe('historyStats tracking range', () => {
  const location = CITIES[0];
  const now = new Date(2026, 4, 7, 8);

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
      new Date(2026, 4, 2),
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
    expect(streakAt(weekdays, new Date(2026, 10, 15, 8))).toBe(3);
  });

  it('a Shabbat marked in the check-in counts like any other day', () => {
    expect(streakAt({ ...weekdays, ...done('2026-11-14') }, new Date(2026, 10, 15, 8))).toBe(4);
  });

  it('a Shabbat left unmarked breaks the streak once the check-in closes', () => {
    expect(streakAt({ ...weekdays, ...done('2026-11-15') }, new Date(2026, 10, 16, 8))).toBe(1);
  });

  it('finishing the check-in early closes it at once', () => {
    expect(streakAt(weekdays, new Date(2026, 10, 15, 8), { checkIns: { '2026-11-14': 1 } })).toBe(0);
  });

  it('counts an item toward its percentage only once it can no longer be marked', () => {
    const stats = computeStats(mitzvot, weekdays, location, settings, 7, new Date(2026, 10, 15, 8));
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
    expect(computeStats(mitzvot, done(...keys), location, settings, 30, new Date(2026, 10, 15, 20)).streak).toBe(45);
  });

  it('a skipped Shabbat mitzvah is settled as not done, not left waiting', () => {
    const stats = computeStats(mitzvot, weekdays, location, settings, 7, new Date(2026, 10, 15, 8), {
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
    const enabledSince = { later: new Date(2026, 10, 15, 9).getTime() };
    const stats = computeStats([mitzvot[0], later], marked, location, settings, 7, new Date(2026, 10, 15, 20), {
      enabledSince,
    });
    expect(stats.streak).toBe(5);
    expect(stats.perMitzvah.later.eligible).toBe(0);
  });

  it('with nothing enabled the walk does not wander across empty days', () => {
    const sparse = done('2026-11-15', '2026-11-01');
    expect(computeStats([], sparse, location, settings, 30, new Date(2026, 10, 15, 20)).streak).toBe(1);
  });

  it('reaches past retention through the archive of kept days', () => {
    const recent = done('2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15');
    const now = new Date(2026, 10, 15, 20);
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
