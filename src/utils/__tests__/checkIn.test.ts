import {
  calendarDay,
  checkInDeadline,
  checkInFor,
  checkInId,
  checkInLastDay,
  checkInPending,
  latestCheckIn,
  overlapsBlock,
  pendingCheckInIds,
} from '../checkIn';
import { judgeDay } from '../historyStats';
import { locationNoon } from '../locationDay';
import { findMitzvah } from '@/data/mitzvot';
import { CITIES, findCityById } from '@/data/cities';
import { HebcalService } from '@/services/HebcalService';
import { Mitzvah, UserSettings } from '@/types/mitzvah';
import { Location } from '@/types/zmanim';
import { at, zmanimFor } from '@/testing/zmanim';

const JERUSALEM = CITIES[0];
const LOS_ANGELES = findCityById('los-angeles')!;
const LONGYEARBYEN: Location = {
  name: 'Longyearbyen',
  lat: 78.2232,
  lng: 15.6267,
  tz: 'Arctic/Longyearbyen',
  inIsrael: false,
};
const SETTINGS: UserSettings = { nusach: 'ashkenaz', halachicOpinions: { ksSofZman: 'GRA' }, inIsrael: true };
const MITZVOT = ['tefillin', 'shacharit', 'mincha', 'maariv', 'candle_lighting', 'havdalah'].map((id) =>
  findMitzvah(id)!,
);
// Shabbat Bereishit 5787 is 2026-10-10; this is Shabbat Noach.
const SHABBAT = at(JERUSALEM, '2026-11-14T12:00');
const block = HebcalService.holyBlockAt(SHABBAT, JERUSALEM)!;
const input = (overrides = {}) => ({
  mitzvot: MITZVOT,
  completions: {},
  checkIns: {},
  location: JERUSALEM,
  settings: SETTINGS,
  ...overrides,
});
const alotOf = (key: string, location: Location) =>
  zmanimFor(locationNoon(calendarDay(key), location), location).alotHaShachar;
const idsOn = (checkIn: ReturnType<typeof checkInFor>, key: string) =>
  checkIn!.days.find((day) => day.key === key)?.items.map((item) => item.mitzvah.id) ?? [];

describe('checkIn', () => {
  it("asks about everything that could not be marked: the block's own day and what the erev ran into it", () => {
    const checkIn = checkInFor(block, input(), at(JERUSALEM, '2026-11-14T20:00'))!;
    expect(checkIn.days.map((day) => day.key)).toEqual(['2026-11-13', '2026-11-14']);
    // Friday: mincha runs to shkia and candle lighting starts with the block; shacharit ended long
    // before, and tefillin ends at shkia too, after lighting.
    expect(idsOn(checkIn, '2026-11-13')).toEqual(
      expect.arrayContaining(['mincha', 'candle_lighting', 'maariv', 'tefillin']),
    );
    expect(idsOn(checkIn, '2026-11-13')).not.toContain('shacharit');
    // Shabbat: no tefillin (skipOn), and maariv and havdalah open at the block's tzeit — after it.
    expect(idsOn(checkIn, '2026-11-14')).toEqual(expect.arrayContaining(['shacharit', 'mincha']));
    expect(idsOn(checkIn, '2026-11-14')).not.toContain('tefillin');
    expect(idsOn(checkIn, '2026-11-14')).not.toContain('maariv');
    expect(idsOn(checkIn, '2026-11-14')).not.toContain('havdalah');
  });

  it('counts a window that ends exactly at candle lighting as reaching into the block', () => {
    const lighting = block.start.getTime();
    const morning = new Date(lighting - 10 * 3_600_000);
    expect(overlapsBlock({ start: morning, end: block.start }, block)).toBe(true);
    expect(overlapsBlock({ start: morning, end: new Date(lighting - 1) }, block)).toBe(false);
    expect(overlapsBlock({ start: block.end, end: new Date(block.end.getTime() + 3_600_000) }, block)).toBe(false);
  });

  it('asks about a window that ends at candle lighting on the erev of Shabbat and of Yom Tov, and keeps it pending', () => {
    const untilLighting: Mitzvah = {
      id: 'until_lighting',
      name: { he: 'עד ההדלקה' },
      icon: 'custom',
      timeType: 'range-within-day',
      category: 'daily-allday',
      skipOn: [],
      nuschaotSupported: ['ashkenaz'],
      defaultReminders: [],
      computeWindow: ({ zmanim, location }) => {
        if (HebcalService.isHolyDay(zmanim.chatzot, location)) return null;
        const next = HebcalService.holyBlockOn(new Date(zmanim.chatzot.getTime() + 86_400_000), location);
        return next && { start: zmanim.alotHaShachar, end: next.start };
      },
    };
    const only = input({ mitzvot: [untilLighting] });
    const asked = (checkIn: ReturnType<typeof checkInFor>) =>
      checkIn!.days.map((day) => [day.key, day.items.map((item) => item.mitzvah.id)]);
    expect(asked(checkInFor(block, only, block.end))).toEqual([['2026-11-13', ['until_lighting']]]);
    const pesach = HebcalService.holyBlockOn(at(JERUSALEM, '2027-04-22T12:00'), JERUSALEM)!;
    expect(asked(checkInFor(pesach, only, pesach.end))).toEqual([['2027-04-21', ['until_lighting']]]);
    const sunday = at(JERUSALEM, '2026-11-15T12:00');
    const monday = at(JERUSALEM, '2026-11-16T12:00');
    expect(judgeDay(new Date(2026, 10, 13), only, sunday).pending).toEqual(['until_lighting']);
    expect(judgeDay(new Date(2026, 10, 13), only, monday).missed).toEqual(['until_lighting']);
    expect(judgeDay(new Date(2027, 3, 21), only, at(JERUSALEM, '2027-04-23T12:00')).pending).toEqual([
      'until_lighting',
    ]);
  });

  it('stays open from tzeit until the alot that ends the first weekday after the block', () => {
    const deadline = alotOf('2026-11-16', JERUSALEM);
    expect(checkInDeadline(block, JERUSALEM)).toEqual(deadline);
    expect(checkInFor(block, input(), SHABBAT)!.deadline).toEqual(deadline);
    expect(checkInLastDay(block)).toEqual(new Date(2026, 10, 15));
    expect(checkInFor(block, input(), SHABBAT)!.open).toBe(false);
    expect(checkInFor(block, input(), block.end)!.open).toBe(true);
    expect(checkInFor(block, input(), at(JERUSALEM, '2026-11-15T23:59'))!.open).toBe(true);
    expect(checkInFor(block, input(), at(JERUSALEM, '2026-11-16T00:30'))!.open).toBe(true);
    expect(checkInFor(block, input(), new Date(deadline.getTime() - 1))!.open).toBe(true);
    expect(checkInFor(block, input(), deadline)!.open).toBe(false);
  });

  describe('the deadline', () => {
    it('is the alot of the second day after the last day of the block, in winter, in summer and abroad', () => {
      expect(block.days).toEqual(['2026-11-14']);
      expect(checkInDeadline(block, JERUSALEM).getTime()).toBe(alotOf('2026-11-16', JERUSALEM).getTime());
      const summer = HebcalService.holyBlockOn(at(JERUSALEM, '2027-06-19T12:00'), JERUSALEM)!;
      expect(summer.days).toEqual(['2027-06-19']);
      expect(checkInDeadline(summer, JERUSALEM).getTime()).toBe(alotOf('2027-06-21', JERUSALEM).getTime());
      const abroad = HebcalService.holyBlockOn(at(LOS_ANGELES, '2026-11-14T12:00'), LOS_ANGELES)!;
      expect(checkInDeadline(abroad, LOS_ANGELES).getTime()).toBe(alotOf('2026-11-16', LOS_ANGELES).getTime());
    });

    it('is 04:00 on the location clock where the sun never sets', () => {
      const shabbat = HebcalService.holyBlockOn(at(LONGYEARBYEN, '2026-06-13T12:00'), LONGYEARBYEN)!;
      expect(shabbat.days).toEqual(['2026-06-13']);
      expect(checkInDeadline(shabbat, LONGYEARBYEN).getTime()).toBe(at(LONGYEARBYEN, '2026-06-15T04:00').getTime());
    });

    it('accepts marks through the night after the last day, and stops at alot or once the check-in is finished', () => {
      const deadline = alotOf('2026-11-16', JERUSALEM);
      const pendingAt = (instant: Date, checkIns = {}) => checkInPending(block, checkIns, instant, JERUSALEM);
      expect(pendingAt(at(JERUSALEM, '2026-11-16T00:30'))).toBe(true);
      expect(pendingAt(new Date(deadline.getTime() - 1))).toBe(true);
      expect(pendingAt(deadline)).toBe(false);
      expect(pendingAt(at(JERUSALEM, '2026-11-16T00:30'), { [checkInId(block)]: 1 })).toBe(false);
    });
  });

  it('is finished once the user says so, or once everything is marked', () => {
    const now = at(JERUSALEM, '2026-11-14T20:00');
    expect(checkInFor(block, input({ checkIns: { [block.days[0]]: 1 } }), now)!.finished).toBe(true);
    const all = checkInFor(block, input(), now)!;
    const completions = Object.fromEntries(
      all.days.map((day) => [day.key, Object.fromEntries(day.items.map((item) => [item.mitzvah.id, 1]))]),
    );
    expect(checkInFor(block, input({ completions }), now)!.finished).toBe(true);
    expect(checkInFor(block, input({ completions }), now)!.open).toBe(false);
  });

  it('leaves out skipped mitzvot and those switched on after the block', () => {
    const now = at(JERUSALEM, '2026-11-14T20:00');
    const skippedMincha = checkInFor(block, input({ skipped: { '2026-11-13': { mincha: 1 } } }), now)!;
    expect(idsOn(skippedMincha, '2026-11-13')).not.toContain('mincha');
    const lateMaariv = checkInFor(block, input({ enabledSince: { maariv: now.getTime() } }), now)!;
    expect(idsOn(lateMaariv, '2026-11-13')).not.toContain('maariv');
  });

  it('latestCheckIn finds the block that just ended, and nothing once its deadline passes', () => {
    expect(latestCheckIn(input(), SHABBAT)).toBeNull(); // still inside the block
    expect(latestCheckIn(input(), at(JERUSALEM, '2026-11-14T20:00'))?.id).toBe('2026-11-14');
    expect(latestCheckIn(input(), at(JERUSALEM, '2026-11-15T21:00'))?.id).toBe('2026-11-14');
    expect(latestCheckIn(input(), at(JERUSALEM, '2026-11-16T00:30'))?.id).toBe('2026-11-14');
    expect(latestCheckIn(input(), alotOf('2026-11-16', JERUSALEM))).toBeNull();
    expect(latestCheckIn(input({ checkIns: { '2026-11-14': 1 } }), at(JERUSALEM, '2026-11-15T09:00'))).toBeNull();
    expect(latestCheckIn(input(), at(JERUSALEM, '2026-11-12T09:00'))).toBeNull();
  });

  it('covers every day of a three-day block in one check-in', () => {
    const roshHashana = HebcalService.holyBlockAt(at(JERUSALEM, '2028-09-22T12:00'), JERUSALEM)!;
    const checkIn = checkInFor(roshHashana, input(), at(JERUSALEM, '2028-09-23T21:00'))!;
    expect(checkIn.days.map((day) => day.key)).toEqual(['2028-09-20', '2028-09-21', '2028-09-22', '2028-09-23']);
    expect(checkIn.deadline).toEqual(alotOf('2028-09-25', JERUSALEM));
    expect(latestCheckIn(input(), at(JERUSALEM, '2028-09-24T09:00'))?.id).toBe('2028-09-21');
  });

  it('pendingCheckInIds lists only the unmarked mitzvot of an open check-in', () => {
    const now = at(JERUSALEM, '2026-11-14T20:00');
    const checkIn = checkInFor(block, input({ completions: { '2026-11-14': { shacharit: 1 } } }), now);
    const pending = pendingCheckInIds(checkIn, '2026-11-14');
    expect(pending.has('mincha')).toBe(true);
    expect(pending.has('shacharit')).toBe(false);
    expect(pendingCheckInIds(checkInFor(block, input(), SHABBAT), '2026-11-14').size).toBe(0);
    expect(pendingCheckInIds(null, '2026-11-14').size).toBe(0);
  });
});
