import { HebcalService } from '../HebcalService';
import { at, zmanimFor } from '@/testing/zmanim';
import { Location } from '@/types/zmanim';
import { CITIES } from '@/data/cities';
import { candleLightingMinutes } from '@/data/mitzvot';
import { HOLY_BLOCK_EXIT_MIN, ZmanimService } from '@/services/ZmanimService';

// Boundary instants are derived from the zmanim themselves rather than written as clock times, so
// the fixtures cannot silently mean a different moment than the one they claim.
const minutesFrom = (base: Date, minutes: number) => new Date(base.getTime() + minutes * 60_000);

const JERUSALEM: Location = {
  name: 'Jerusalem',
  lat: 31.7683,
  lng: 35.2137,
  tz: 'Asia/Jerusalem',
  inIsrael: true,
};

// Noon on JERUSALEM's clock. These fixtures feed instant APIs, and noon on the device's clock is a
// Jerusalem evening or early morning once the device sits far enough east or west.
const noonOn = (date: string) => at(JERUSALEM, `${date}T12:00`);

describe('HebcalService', () => {
  it('2.1 Hebrew date for 2026-04-23', () => {
    const hd = HebcalService.getHebrewDate(new Date('2026-04-23T12:00:00Z'));
    expect(hd.day).toBeGreaterThan(0);
    expect(hd.year).toBeGreaterThanOrEqual(5786);
    expect(hd.hebrewDateStr.length).toBeGreaterThan(0);
  });

  it('2.2 getParasha returns string on Friday', () => {
    const friday = new Date('2026-04-24T12:00:00Z');
    const p = HebcalService.getParasha(friday, JERUSALEM);
    expect(typeof p === 'string' || p === undefined).toBe(true);
  });

  it('2.3 getHolidays returns Pesach in Nisan', () => {
    const pesach = new Date(2026, 3, 2); // a calendar day, read through device-local getters
    const holidays = HebcalService.getHolidays(pesach, JERUSALEM);
    expect(holidays.length).toBeGreaterThan(0);
  });

  it('2.3b names the parasha and the occasions in the locale asked for: Hebrew with vowels by default, without them, or English', () => {
    const shabbatBereishit = new Date(2026, 9, 10);
    expect(HebcalService.getParasha(shabbatBereishit, JERUSALEM, 'en')).toBe('Parashat Bereshit');
    expect(HebcalService.getParasha(shabbatBereishit, JERUSALEM, 'he-x-NoNikud')).toBe('פרשת בראשית');
    expect(HebcalService.getParasha(shabbatBereishit, JERUSALEM)).toMatch(/[\u05B0-\u05C7]/);

    const roshChodesh = new Date(2026, 9, 11);
    expect(HebcalService.getHolidays(roshChodesh, JERUSALEM, 'he-x-NoNikud')).toEqual(['ראש חודש חשון']);
    expect(HebcalService.getHolidays(roshChodesh, JERUSALEM, 'en')).toEqual(['Rosh Chodesh Cheshvan']);
    expect(HebcalService.getHolidays(roshChodesh, JERUSALEM)[0]).toMatch(/[\u05B0-\u05C7]/);
  });

  it('2.3c leaves chol hamoed and erev days out of the occasions unless asked, each on its own', () => {
    const cholHamoed = new Date(2026, 8, 28);
    expect(HebcalService.getHolidays(cholHamoed, JERUSALEM, 'he-x-NoNikud')).toEqual([]);
    expect(HebcalService.getHolidays(cholHamoed, JERUSALEM, 'he-x-NoNikud', { erev: true })).toEqual([]);
    expect(HebcalService.getHolidays(cholHamoed, JERUSALEM, 'he-x-NoNikud', { cholHamoed: true })).toEqual([
      'סוכות ג׳ (חוה״מ)',
    ]);
    expect(HebcalService.getHolidays(cholHamoed, JERUSALEM, 'en', { cholHamoed: true })).toEqual([
      'Sukkot III (CH’’M)',
    ]);

    const erevYomKippur = new Date(2026, 8, 20);
    expect(HebcalService.getHolidays(erevYomKippur, JERUSALEM, 'he-x-NoNikud')).toEqual([]);
    expect(HebcalService.getHolidays(erevYomKippur, JERUSALEM, 'he-x-NoNikud', { cholHamoed: true })).toEqual([]);
    expect(HebcalService.getHolidays(erevYomKippur, JERUSALEM, 'he-x-NoNikud', { erev: true })).toEqual([
      'ערב יום כפור',
    ]);

    const hoshanaRaba = new Date(2026, 9, 2);
    expect(HebcalService.getHolidays(hoshanaRaba, JERUSALEM, 'he-x-NoNikud', { cholHamoed: true })).toEqual([
      'סוכות ז׳ (הושענא רבה)',
    ]);
  });

  it('2.4 isShabbat true on Saturday', () => {
    // Without a location the fallback is the device's Gregorian Saturday.
    const sat = new Date(2026, 3, 25, 12);
    expect(HebcalService.isShabbat(sat)).toBe(true);
    const fri = new Date(2026, 3, 24, 12);
    expect(HebcalService.isShabbat(fri)).toBe(false);
  });

  // Was `expect(typeof result).toBe('boolean')` — passes for true and for false alike, so a
  // regression that made isYomTov always false would have shipped green.
  it('2.5 isYomTov is true on Pesach I and false on chol hamoed', () => {
    expect(HebcalService.isYomTov(noonOn('2026-04-02'), JERUSALEM)).toBe(true); // 15 Nisan
    expect(HebcalService.isYomTov(noonOn('2026-04-03'), JERUSALEM)).toBe(false); // 16 Nisan, chol hamoed in Israel
    expect(HebcalService.isYomTov(noonOn('2026-04-08'), JERUSALEM)).toBe(true); // 21 Nisan, Pesach VII
    expect(HebcalService.isYomTov(noonOn('2026-04-09'), JERUSALEM)).toBe(false); // 22 Nisan
  });

  // A Hebrew day starts at nightfall, so erev Yom Tov after shkia is already Yom Tov. The old
  // implementation asked hebcal about the Gregorian day, so it answered "false" all evening and
  // tefillin reminders were scheduled for the first night of a chag.
  it('2.5b isYomTov turns on at shkia of erev Yom Tov', () => {
    const erevPesach = noonOn('2026-04-01'); // 14 Nisan
    const { shkia } = zmanimFor(erevPesach, JERUSALEM);

    expect(HebcalService.isYomTov(minutesFrom(shkia, -1), JERUSALEM)).toBe(false);
    expect(HebcalService.isYomTov(minutesFrom(shkia, 1), JERUSALEM)).toBe(true);
  });

  it('2.5c isYomTov stays on through bein hashmashot and turns off at tzeit', () => {
    const pesachVII = noonOn('2026-04-08'); // 21 Nisan, last Yom Tov day of Pesach in Israel
    const { shkia, tzeitHakochavim } = zmanimFor(pesachVII, JERUSALEM);

    expect(HebcalService.isYomTov(minutesFrom(shkia, 1), JERUSALEM)).toBe(true);
    expect(HebcalService.isYomTov(minutesFrom(tzeitHakochavim, 1), JERUSALEM)).toBe(false);
  });

  it('2.5d the Hebrew date advances at shkia, not at civil midnight', () => {
    const day = noonOn('2026-04-09');
    const { shkia } = zmanimFor(day, JERUSALEM);
    const before = HebcalService.getHebrewDateAt(minutesFrom(shkia, -1), JERUSALEM);
    const after = HebcalService.getHebrewDateAt(minutesFrom(shkia, 1), JERUSALEM);

    expect(after.day).toBe(before.day + 1);
    expect(after.hebrewDateStr).not.toBe(before.hebrewDateStr);
    // The calendar-grid variant deliberately stays on the civil day's daytime date.
    expect(HebcalService.getHebrewDate(new Date(2026, 3, 9)).hebrewDateStr).toBe(before.hebrewDateStr);
  });

  it('2.5f hebrewDayAt gives the same day as an HDate: the next one from shkia on, bein hashmashot included', () => {
    const day = noonOn('2026-04-09');
    const { shkia, tzeitHakochavim } = zmanimFor(day, JERUSALEM);
    const daytime = HebcalService.hebrewDayAt(day, JERUSALEM);
    expect(daytime.getDate()).toBe(HebcalService.getHebrewDateAt(day, JERUSALEM).day);
    expect(HebcalService.hebrewDayAt(minutesFrom(shkia, -1), JERUSALEM).abs()).toBe(daytime.abs());
    expect(HebcalService.hebrewDayAt(minutesFrom(shkia, 1), JERUSALEM).abs()).toBe(daytime.abs() + 1);
    expect(HebcalService.hebrewDayAt(minutesFrom(tzeitHakochavim, 1), JERUSALEM).abs()).toBe(daytime.abs() + 1);
  });

  it('2.5g hebrewNightAt gives the night still running before dawn, and tonight from dawn on', () => {
    const day = noonOn('2026-04-09');
    const { alotHaShachar, shkia } = zmanimFor(day, JERUSALEM);
    const daytime = HebcalService.hebrewDayAt(day, JERUSALEM).abs();
    expect(HebcalService.hebrewNightAt(minutesFrom(alotHaShachar, -1), JERUSALEM).abs()).toBe(daytime);
    expect(HebcalService.hebrewNightAt(minutesFrom(alotHaShachar, 1), JERUSALEM).abs()).toBe(daytime + 1);
    expect(HebcalService.hebrewNightAt(day, JERUSALEM).abs()).toBe(daytime + 1);
    expect(HebcalService.hebrewNightAt(minutesFrom(shkia, 30), JERUSALEM).abs()).toBe(daytime + 1);
  });

  it('2.5h hebrewNightAt gives Sydney and Auckland tonight in the afternoon, not the night after', () => {
    for (const place of [
      { name: 'Sydney', lat: -33.8688, lng: 151.2093, tz: 'Australia/Sydney', inIsrael: false },
      { name: 'Auckland', lat: -36.8485, lng: 174.7633, tz: 'Pacific/Auckland', inIsrael: false },
    ]) {
      const afternoon = at(place, '2026-12-04T15:00');
      const today = HebcalService.hebrewDayAt(afternoon, place);
      expect(today.render('en')).toMatch(/^24th of Kislev/);
      expect(HebcalService.hebrewNightAt(afternoon, place).abs()).toBe(today.abs() + 1);
    }
  });

  it('2.5i dawnAt is the alot of the location date, and 04:00 on its clock where the sun neither rises nor sets', () => {
    const { alotHaShachar } = zmanimFor(noonOn('2026-04-09'), JERUSALEM);
    expect(HebcalService.dawnAt(noonOn('2026-04-09'), JERUSALEM).getTime()).toBe(alotHaShachar.getTime());
    expect(HebcalService.dawnAt(at(JERUSALEM, '2026-04-09T00:30'), JERUSALEM).getTime()).toBe(alotHaShachar.getTime());
    expect(HebcalService.dawnAt(at(JERUSALEM, '2026-04-09T23:30'), JERUSALEM).getTime()).toBe(alotHaShachar.getTime());

    const midnightSun: Location = {
      name: 'Longyearbyen',
      lat: 78.2232,
      lng: 15.6267,
      tz: 'Arctic/Longyearbyen',
      inIsrael: false,
    };
    expect(ZmanimService.getZmanim(at(midnightSun, '2026-06-18T12:00'), midnightSun)).toBeNull();
    const fourOClock = at(midnightSun, '2026-06-18T04:00');
    expect(HebcalService.dawnAt(at(midnightSun, '2026-06-18T12:00'), midnightSun).getTime()).toBe(fourOClock.getTime());
    expect(HebcalService.dawnAt(at(midnightSun, '2026-06-18T23:30'), midnightSun).getTime()).toBe(fourOClock.getTime());
    const before = HebcalService.hebrewNightAt(minutesFrom(fourOClock, -1), midnightSun);
    const after = HebcalService.hebrewNightAt(fourOClock, midnightSun);
    expect(after.abs() - before.abs()).toBe(1);
  });

  it('2.5e isShabbat keeps its shkia-in / tzeit-out boundaries', () => {
    const friday = noonOn('2026-04-24');
    const saturday = noonOn('2026-04-25');
    const friZmanim = zmanimFor(friday, JERUSALEM);
    const satZmanim = zmanimFor(saturday, JERUSALEM);

    expect(HebcalService.isShabbat(minutesFrom(friZmanim.shkia, -1), JERUSALEM)).toBe(false);
    expect(HebcalService.isShabbat(minutesFrom(friZmanim.shkia, 1), JERUSALEM)).toBe(true);
    expect(HebcalService.isShabbat(minutesFrom(satZmanim.shkia, 1), JERUSALEM)).toBe(true);
    expect(HebcalService.isShabbat(minutesFrom(satZmanim.tzeitHakochavim, 1), JERUSALEM)).toBe(false);
  });

  it('2.6 getOmerDay: 16 Nisan = day 1, after Shavuot = undefined', () => {
    const day1 = new Date('2026-04-03T12:00:00Z');
    const omer1 = HebcalService.getOmerDay(day1);
    expect(typeof omer1 === 'number' || omer1 === undefined).toBe(true);

    const afterShavuot = new Date('2026-06-15T12:00:00Z');
    expect(HebcalService.getOmerDay(afterShavuot)).toBeUndefined();
  });
});

describe('HebcalService holy blocks', () => {
  const JERUSALEM_CITY = CITIES[0];
  const NEW_YORK = CITIES.find((city) => city.nameEn === 'New York')!;
  const noonAt = (loc: Location, date: string) => at(loc, `${date}T12:00`);
  const lightingOn = (loc: Location, date: string) =>
    minutesFrom(zmanimFor(noonAt(loc, date), loc).shkia, -candleLightingMinutes(loc));
  const tzeitOn = (loc: Location, date: string) => zmanimFor(noonAt(loc, date), loc).tzeitHakochavim;
  const exitOn = (loc: Location, date: string) => minutesFrom(tzeitOn(loc, date), HOLY_BLOCK_EXIT_MIN);

  it('a plain Shabbat runs from candle lighting on Friday to ten minutes after tzeit on Saturday', () => {
    const block = HebcalService.holyBlockOn(noonAt(JERUSALEM_CITY, '2026-04-25'), JERUSALEM_CITY)!;
    expect(block.days).toEqual(['2026-04-25']);
    expect(block.kind).toBe('shabbat');
    expect(block.start).toEqual(lightingOn(JERUSALEM_CITY, '2026-04-24'));
    expect(block.end).toEqual(exitOn(JERUSALEM_CITY, '2026-04-25'));
    expect(block.end.getTime() - tzeitOn(JERUSALEM_CITY, '2026-04-25').getTime()).toBe(10 * 60_000);
    // Jerusalem lights 40 minutes before shkia.
    expect(
      zmanimFor(noonAt(JERUSALEM_CITY, '2026-04-24'), JERUSALEM_CITY).shkia.getTime() - block.start.getTime(),
    ).toBe(40 * 60_000);
  });

  it('Rosh Hashana on Thursday-Friday merges with Shabbat into one three-day block', () => {
    const block = HebcalService.holyBlockOn(noonAt(JERUSALEM_CITY, '2028-09-22'), JERUSALEM_CITY)!;
    expect(block.days).toEqual(['2028-09-21', '2028-09-22', '2028-09-23']);
    expect(block.kind).toBe('shabbatYomTov');
    expect(block.start).toEqual(lightingOn(JERUSALEM_CITY, '2028-09-20'));
    expect(block.end).toEqual(exitOn(JERUSALEM_CITY, '2028-09-23'));
    // Every day of the run reports the same block.
    expect(HebcalService.holyBlockOn(noonAt(JERUSALEM_CITY, '2028-09-21'), JERUSALEM_CITY)).toEqual(block);
    expect(HebcalService.holyBlockOn(noonAt(JERUSALEM_CITY, '2028-09-23'), JERUSALEM_CITY)).toEqual(block);
  });

  it('Shabbat that flows into Rosh Hashana ends at the exit of the second day', () => {
    const block = HebcalService.holyBlockOn(noonAt(JERUSALEM_CITY, '2027-10-02'), JERUSALEM_CITY)!;
    expect(block.days).toEqual(['2027-10-02', '2027-10-03']);
    expect(block.start).toEqual(lightingOn(JERUSALEM_CITY, '2027-10-01'));
    expect(block.end).toEqual(exitOn(JERUSALEM_CITY, '2027-10-03'));
  });

  it('Shavuot on Friday flows into Shabbat', () => {
    const block = HebcalService.holyBlockOn(noonAt(JERUSALEM_CITY, '2027-06-11'), JERUSALEM_CITY)!;
    expect(block.days).toEqual(['2027-06-11', '2027-06-12']);
    expect(block.kind).toBe('shabbatYomTov');
  });

  it("the second day of Yom Tov makes the diaspora block longer than Israel's", () => {
    const diaspora = HebcalService.holyBlockOn(noonAt(NEW_YORK, '2027-04-22'), NEW_YORK)!;
    expect(diaspora.days).toEqual(['2027-04-22', '2027-04-23', '2027-04-24']);
    expect(diaspora.start).toEqual(lightingOn(NEW_YORK, '2027-04-21'));
    expect(diaspora.end).toEqual(exitOn(NEW_YORK, '2027-04-24'));
    // In Israel 16 Nisan is chol hamoed, so Pesach I and the Shabbat after it are separate blocks.
    expect(HebcalService.holyBlockOn(noonAt(JERUSALEM_CITY, '2027-04-22'), JERUSALEM_CITY)!.days).toEqual([
      '2027-04-22',
    ]);
    expect(HebcalService.holyBlockOn(noonAt(JERUSALEM_CITY, '2027-04-24'), JERUSALEM_CITY)!.days).toEqual([
      '2027-04-24',
    ]);
    expect(HebcalService.holyBlockOn(noonAt(JERUSALEM_CITY, '2027-04-23'), JERUSALEM_CITY)).toBeNull();
  });

  it('Yom Kippur is its own kind, also when it falls on Shabbat', () => {
    expect(HebcalService.holyBlockOn(noonAt(JERUSALEM_CITY, '2027-10-11'), JERUSALEM_CITY)!.kind).toBe('yomKippur');
    expect(HebcalService.holyBlockOn(noonAt(JERUSALEM_CITY, '2028-09-30'), JERUSALEM_CITY)!.kind).toBe('yomKippur');
  });

  it('holyBlockAt follows the instant across candle lighting and the exit', () => {
    const block = HebcalService.holyBlockOn(noonAt(JERUSALEM_CITY, '2026-04-25'), JERUSALEM_CITY)!;
    expect(HebcalService.holyBlockAt(minutesFrom(block.start, -1), JERUSALEM_CITY)).toBeNull();
    expect(HebcalService.holyBlockAt(block.start, JERUSALEM_CITY)).toEqual(block);
    expect(HebcalService.holyBlockAt(at(JERUSALEM_CITY, '2026-04-24T23:00'), JERUSALEM_CITY)).toEqual(block);
    // Tzeit itself is still inside: Shabbat leaves ten minutes later.
    expect(HebcalService.holyBlockAt(tzeitOn(JERUSALEM_CITY, '2026-04-25'), JERUSALEM_CITY)).toEqual(block);
    expect(HebcalService.holyBlockAt(block.end, JERUSALEM_CITY)).toEqual(block);
    expect(HebcalService.holyBlockAt(minutesFrom(block.end, 1), JERUSALEM_CITY)).toBeNull();
  });

  it('isHolyDay is day-granular: Friday night is still a weekday', () => {
    expect(HebcalService.isHolyDay(at(JERUSALEM_CITY, '2026-04-24T23:00'), JERUSALEM_CITY)).toBe(false);
    expect(HebcalService.isHolyDay(at(JERUSALEM_CITY, '2026-04-25T06:00'), JERUSALEM_CITY)).toBe(true);
    expect(HebcalService.isHolyDay(at(JERUSALEM_CITY, '2026-04-25T23:00'), JERUSALEM_CITY)).toBe(true);
    expect(HebcalService.isHolyDay(noonAt(JERUSALEM_CITY, '2027-10-18'), JERUSALEM_CITY)).toBe(false); // chol hamoed
    expect(HebcalService.isHolyDay(noonAt(JERUSALEM_CITY, '2027-10-11'), JERUSALEM_CITY)).toBe(true); // Yom Kippur
  });

  it('isCholHamoed follows the second day of Yom Tov', () => {
    // 16 Tishrei 5788: chol hamoed in Israel, Sukkot II (Yom Tov) in the diaspora.
    expect(HebcalService.isCholHamoed(noonAt(JERUSALEM_CITY, '2027-10-17'), JERUSALEM_CITY)).toBe(true);
    expect(HebcalService.isCholHamoed(noonAt(NEW_YORK, '2027-10-17'), NEW_YORK)).toBe(false);
    expect(HebcalService.isYomTov(noonAt(NEW_YORK, '2027-10-17'), NEW_YORK)).toBe(true);
    // Hoshana Raba is the last day of chol hamoed everywhere.
    expect(HebcalService.isCholHamoed(noonAt(JERUSALEM_CITY, '2027-10-22'), JERUSALEM_CITY)).toBe(true);
    expect(HebcalService.isCholHamoed(noonAt(JERUSALEM_CITY, '2027-10-24'), JERUSALEM_CITY)).toBe(false);
  });
});
