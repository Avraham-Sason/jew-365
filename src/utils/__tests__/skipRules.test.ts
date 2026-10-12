import { buildDayTimeline, currentOrNextWindow } from '../buildDayTimeline';
import { computeStats } from '../historyStats';
import {
  holyBlockLabelKeys,
  isQuietAt,
  isSkipped,
  isSkippedAt,
  keepsCholHamoed,
  nextQuietBoundary,
  observanceFor,
  quietBlockAt,
} from '../skipRules';
import { findMitzvah } from '@/data/mitzvot';
import { CITIES } from '@/data/cities';
import { HebcalService } from '@/services/HebcalService';
import { UserSettings } from '@/types/mitzvah';
import { at } from '@/testing/zmanim';

const JERUSALEM = CITIES[0];
const NEW_YORK = CITIES.find((city) => city.nameEn === 'New York')!;
const SETTINGS: UserSettings = { nusach: 'ashkenaz', halachicOpinions: { ksSofZman: 'GRA' }, inIsrael: true };
const ISRAEL = { nusach: 'ashkenaz', inIsrael: true } as const;
const DIASPORA_ASHKENAZ = { nusach: 'ashkenaz', inIsrael: false } as const;
const DIASPORA_SEFARD = { nusach: 'sefard', inIsrael: false } as const;
// Calendar days for the day-level surfaces (timeline, history), which read the device's date.
const SHABBAT = new Date(2026, 3, 25); // Saturday, well clear of Pesach
const WEEKDAY = new Date(2026, 3, 23); // Thursday
// The same days as instants, for the instant-level predicates.
const SHABBAT_NOON = at(JERUSALEM, '2026-04-25T12:00');
const WEEKDAY_NOON = at(JERUSALEM, '2026-04-23T12:00');

const tefillin = findMitzvah('tefillin')!;
const shacharit = findMitzvah('shacharit')!;
const identity = (key: string) => key;
const minutesFrom = (base: Date, minutes: number) => new Date(base.getTime() + minutes * 60_000);

describe('skipRules', () => {
  it('recognises Shabbat, chol hamoed and a plain weekday', () => {
    expect(observanceFor(SHABBAT_NOON, JERUSALEM)).toEqual({ isShabbat: true, isYomTov: false, isCholHamoed: false });
    expect(observanceFor(WEEKDAY_NOON, JERUSALEM)).toEqual({ isShabbat: false, isYomTov: false, isCholHamoed: false });
    // 17 Tishrei 5788 — chol hamoed Sukkot on a Monday.
    expect(observanceFor(at(JERUSALEM, '2027-10-18T12:00'), JERUSALEM)).toEqual({
      isShabbat: false,
      isYomTov: false,
      isCholHamoed: true,
    });
  });

  it('skips only mitzvot that opt in via skipOn', () => {
    const shabbat = observanceFor(SHABBAT_NOON, JERUSALEM);
    expect(tefillin.skipOn).toContain('shabbat');
    expect(isSkipped(tefillin, shabbat, ISRAEL)).toBe(true);
    expect(isSkipped(tefillin, observanceFor(WEEKDAY_NOON, JERUSALEM), ISRAEL)).toBe(false);
    expect(shacharit.skipOn).toEqual([]);
    expect(isSkipped(shacharit, shabbat, ISRAEL)).toBe(false);
  });

  // Judged at the window's own start, so the answer never depends on when the caller asks.
  it('gives the same answer for a Shabbat window whenever it is asked', () => {
    const shabbatMorning = at(JERUSALEM, '2026-04-25T08:00');
    const motzaeiShabbat = at(JERUSALEM, '2026-04-25T22:00'); // after tzeit — no longer Shabbat "now"
    expect(isSkippedAt(tefillin, shabbatMorning, JERUSALEM, ISRAEL)).toBe(true);
    // The old code asked "is it Shabbat right now", so at 22:00 tefillin reappeared as missed.
    expect(observanceFor(motzaeiShabbat, JERUSALEM).isShabbat).toBe(false);
    expect(isSkippedAt(tefillin, shabbatMorning, JERUSALEM, ISRAEL)).toBe(true);
  });

  it('skips a Friday-evening window that civil-day granularity would have allowed', () => {
    const eveningMitzvah = { skipOn: ['shabbat'] as const };
    const fridayMorning = at(JERUSALEM, '2026-04-24T08:00');
    const fridayEvening = at(JERUSALEM, '2026-04-24T20:00'); // after shkia — already Shabbat
    expect(isSkippedAt({ skipOn: [...eveningMitzvah.skipOn] }, fridayMorning, JERUSALEM, ISRAEL)).toBe(false);
    expect(isSkippedAt({ skipOn: [...eveningMitzvah.skipOn] }, fridayEvening, JERUSALEM, ISRAEL)).toBe(true);
  });

  it('never consults the calendar for a mitzvah with no skipOn', () => {
    expect(isSkippedAt({ skipOn: [] }, SHABBAT_NOON, JERUSALEM, ISRAEL)).toBe(false);
  });

  describe('tefillin on chol hamoed', () => {
    const cholHamoedMorningIsrael = at(JERUSALEM, '2027-10-18T07:00'); // 17 Tishrei, chol hamoed Sukkot
    const cholHamoedMorningNewYork = at(NEW_YORK, '2027-10-18T07:00'); // 17 Tishrei, chol hamoed in chu"l too

    it('follows the minhag of the place and nusach', () => {
      expect(keepsCholHamoed(ISRAEL)).toBe(false);
      expect(keepsCholHamoed({ nusach: 'chabad', inIsrael: true })).toBe(false);
      expect(keepsCholHamoed(DIASPORA_ASHKENAZ)).toBe(true);
      expect(keepsCholHamoed(DIASPORA_SEFARD)).toBe(false);
      expect(keepsCholHamoed({ nusach: 'edot_hamizrach', inIsrael: false })).toBe(false);
      expect(keepsCholHamoed({ nusach: 'chabad', inIsrael: false })).toBe(false);
    });

    it('skips tefillin in Israel and for non-Ashkenazim abroad, keeps it for Ashkenazim abroad', () => {
      expect(isSkippedAt(tefillin, cholHamoedMorningIsrael, JERUSALEM, ISRAEL)).toBe(true);
      expect(isSkippedAt(tefillin, cholHamoedMorningNewYork, NEW_YORK, DIASPORA_SEFARD)).toBe(true);
      expect(isSkippedAt(tefillin, cholHamoedMorningNewYork, NEW_YORK, DIASPORA_ASHKENAZ)).toBe(false);
    });

    it('never touches a mitzvah that does not opt in', () => {
      expect(isSkippedAt(shacharit, cholHamoedMorningIsrael, JERUSALEM, ISRAEL)).toBe(false);
    });

    it('a weekday after chol hamoed is a normal tefillin day again', () => {
      // 23 Tishrei 5788 in Israel is a plain Sunday after Shemini Atzeret.
      expect(isSkippedAt(tefillin, at(JERUSALEM, '2027-10-24T07:00'), JERUSALEM, ISRAEL)).toBe(false);
    });

    it('the mitzvah screen looks past the skipped days to the next real window', () => {
      const next = currentOrNextWindow(tefillin, JERUSALEM, SETTINGS, at(JERUSALEM, '2027-10-18T05:00'));
      expect(next).not.toBeNull();
      // Chol hamoed, Hoshana Raba, then Shemini Atzeret on Shabbat: the first tefillin day is Sunday.
      expect(HebcalService.isHolyDay(next!.start, JERUSALEM)).toBe(false);
      expect(HebcalService.isCholHamoed(next!.start, JERUSALEM)).toBe(false);
      expect(next!.start.getTime()).toBeGreaterThan(at(JERUSALEM, '2027-10-24T00:00').getTime());
      expect(next!.start.getTime()).toBeLessThan(at(JERUSALEM, '2027-10-24T12:00').getTime());
    });
  });

  describe('isQuietAt', () => {
    const block = HebcalService.holyBlockAt(SHABBAT_NOON, JERUSALEM)!;

    it('is quiet strictly inside the block and open at both edges', () => {
      expect(isQuietAt(SHABBAT_NOON, JERUSALEM)).toBe(true);
      expect(isQuietAt(block.start, JERUSALEM)).toBe(false);
      expect(isQuietAt(minutesFrom(block.start, 1), JERUSALEM)).toBe(true);
      expect(isQuietAt(minutesFrom(block.end, -1), JERUSALEM)).toBe(true);
      expect(isQuietAt(block.end, JERUSALEM)).toBe(false);
    });

    it('is not quiet on a weekday or before candle lighting on Friday', () => {
      expect(isQuietAt(WEEKDAY_NOON, JERUSALEM)).toBe(false);
      expect(isQuietAt(minutesFrom(block.start, -1), JERUSALEM)).toBe(false);
      expect(isQuietAt(minutesFrom(block.end, 1), JERUSALEM)).toBe(false);
    });

    it('nextQuietBoundary points at the next moment the answer can change', () => {
      // Before candle lighting: the block's start. Inside, and on the start edge itself: its end.
      expect(nextQuietBoundary(at(JERUSALEM, '2026-04-24T08:00'), JERUSALEM)).toEqual(block.start);
      expect(nextQuietBoundary(block.start, JERUSALEM)).toEqual(block.start);
      expect(nextQuietBoundary(minutesFrom(block.start, 1), JERUSALEM)).toEqual(block.end);
      expect(nextQuietBoundary(SHABBAT_NOON, JERUSALEM)).toEqual(block.end);
      // A Thursday is more than a day from candle lighting but still inside the lookahead.
      expect(nextQuietBoundary(WEEKDAY_NOON, JERUSALEM)).toEqual(block.start);
      // Sunday morning: the next Shabbat is days away.
      expect(nextQuietBoundary(at(JERUSALEM, '2026-04-26T08:00'), JERUSALEM)).toBeNull();
    });

    it('quietBlockAt returns the block only strictly inside it', () => {
      expect(quietBlockAt(SHABBAT_NOON, JERUSALEM)).toEqual(block);
      expect(quietBlockAt(block.start, JERUSALEM)).toBeNull();
      expect(quietBlockAt(block.end, JERUSALEM)).toBeNull();
    });

    it('names the block by what it is and by the day it ends', () => {
      expect(holyBlockLabelKeys(block)).toEqual({ title: 'holyBlock.title.shabbat', exit: 'holyBlock.exit.shabbat' });
      const roshHashanaIntoShabbat = HebcalService.holyBlockAt(at(JERUSALEM, '2028-09-21T12:00'), JERUSALEM)!;
      expect(holyBlockLabelKeys(roshHashanaIntoShabbat)).toEqual({
        title: 'holyBlock.title.shabbatYomTov',
        exit: 'holyBlock.exit.shabbat',
      });
      const shabbatIntoRoshHashana = HebcalService.holyBlockAt(at(JERUSALEM, '2027-10-02T12:00'), JERUSALEM)!;
      expect(holyBlockLabelKeys(shabbatIntoRoshHashana).exit).toBe('holyBlock.exit.chag');
      const yomKippur = HebcalService.holyBlockAt(at(JERUSALEM, '2027-10-11T12:00'), JERUSALEM)!;
      expect(holyBlockLabelKeys(yomKippur)).toEqual({
        title: 'holyBlock.title.yomKippur',
        exit: 'holyBlock.exit.yomKippur',
      });
      const pesachVii = HebcalService.holyBlockAt(at(JERUSALEM, '2027-04-28T12:00'), JERUSALEM)!;
      expect(holyBlockLabelKeys(pesachVii)).toEqual({ title: 'holyBlock.title.yomTov', exit: 'holyBlock.exit.chag' });
    });

    it('stays quiet across every day of a three-day block', () => {
      // Rosh Hashana 5789 (Thu-Fri) runs straight into Shabbat.
      for (const wallClock of [
        '2028-09-20T20:00',
        '2028-09-21T12:00',
        '2028-09-21T22:00',
        '2028-09-22T18:30',
        '2028-09-23T12:00',
      ]) {
        expect(isQuietAt(at(JERUSALEM, wallClock), JERUSALEM)).toBe(true);
      }
      expect(isQuietAt(at(JERUSALEM, '2028-09-24T12:00'), JERUSALEM)).toBe(false);
    });
  });

  // The bug: the scheduler and history honoured skipOn while the timeline and home did not, so
  // tefillin was listed as an open mitzvah on Shabbat and then reported as missed.
  it('buildDayTimeline omits a Shabbat-skipped mitzvah but keeps it on a weekday', () => {
    const idsFor = (date: Date) =>
      buildDayTimeline(date, [tefillin, shacharit], {}, JERUSALEM, SETTINGS, 'he', identity)
        .filter((item) => item.type === 'mitzvah')
        .map((item) => item.mitzvahId);

    expect(idsFor(SHABBAT)).toEqual(['shacharit']);
    expect(idsFor(WEEKDAY)).toEqual(expect.arrayContaining(['tefillin', 'shacharit']));
  });

  it('every surface agrees about a Shabbat-skipped mitzvah', () => {
    const timelineIds = buildDayTimeline(SHABBAT, [tefillin, shacharit], {}, JERUSALEM, SETTINGS, 'he', identity)
      .filter((item) => item.type === 'mitzvah')
      .map((item) => item.mitzvahId);
    const stats = computeStats([tefillin, shacharit], {}, JERUSALEM, SETTINGS, 1, SHABBAT_NOON);

    expect(timelineIds).not.toContain('tefillin');
    expect(stats.perMitzvah.tefillin.eligible).toBe(0);
    expect(stats.missedYesterday).not.toContain('tefillin');
    // shacharit has no skipOn, so it stays visible on both surfaces — on Shabbat itself it waits for
    // the check-in rather than counting yet.
    expect(timelineIds).toContain('shacharit');
    expect(stats.daily[0]).toMatchObject({ totalCount: 1, pendingCount: 1 });
  });

  it('every surface agrees about tefillin on chol hamoed in Israel', () => {
    const cholHamoed = new Date(2027, 9, 18);
    const timelineIds = buildDayTimeline(cholHamoed, [tefillin, shacharit], {}, JERUSALEM, SETTINGS, 'he', identity)
      .filter((item) => item.type === 'mitzvah')
      .map((item) => item.mitzvahId);
    // Judged the day after, so the day is decided: shacharit counts, tefillin is not asked for.
    const stats = computeStats([tefillin, shacharit], {}, JERUSALEM, SETTINGS, 2, at(JERUSALEM, '2027-10-19T12:00'));
    expect(timelineIds).toEqual(['shacharit']);
    expect(stats.daily.find((day) => day.date === '2027-10-18')).toMatchObject({ totalCount: 1, pendingCount: 0 });
    expect(stats.perMitzvah.tefillin.eligible).toBe(0);
    expect(stats.perMitzvah.shacharit.eligible).toBeGreaterThanOrEqual(1);
  });
});
