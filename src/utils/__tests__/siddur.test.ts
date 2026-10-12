import { HDate, months } from '@hebcal/core';
import {
  aloneFolds,
  autoScrollPixelsPerSecond,
  dayFeatures,
  forMaritalStatus,
  liturgicalDay,
  matchesCondition,
  pickerEntries,
  pickerEntryAt,
  resolveSiddurText,
  segmentBlocks,
  siddurLineHeight,
} from '../siddur';
import { DayFeatures, DayFlag, PassageLabel, Place, SiddurSection, SiddurSegment, SiddurText } from '@/types/siddur';
import type { PrayerMode } from '@/stores/useUserStore';

const ISRAEL: Place = { inIsrael: true, jerusalem: false };
const DIASPORA: Place = { inIsrael: false, jerusalem: false };

function hasAll(flags: ReadonlySet<DayFlag>, expected: DayFlag[]): boolean {
  return expected.every((flag) => flags.has(flag));
}

function hasNone(flags: ReadonlySet<DayFlag>, expected: DayFlag[]): boolean {
  return expected.every((flag) => !flags.has(flag));
}

function features(flags: DayFlag[], omerDay: number | null = null): DayFeatures {
  return { flags: new Set(flags), omerDay };
}

describe('auto-scroll pace', () => {
  it('sets the Hebrew line height the reader draws', () => {
    expect(siddurLineHeight(18)).toBe(32);
    expect(siddurLineHeight(22)).toBe(39);
    expect(siddurLineHeight(32)).toBe(56);
  });

  it('turns lines per minute into pixels per second at the line height', () => {
    expect(autoScrollPixelsPerSecond(15, 22)).toBe(9.75);
    expect(autoScrollPixelsPerSecond(60, 18)).toBe(32);
    expect(autoScrollPixelsPerSecond(48, 32)).toBeCloseTo(44.8, 10);
  });

  it('keeps the same pace in lines whatever the text size', () => {
    for (const fontSize of [18, 20, 22, 25, 28, 32]) {
      expect(autoScrollPixelsPerSecond(12, fontSize) / siddurLineHeight(fontSize)).toBeCloseTo(12 / 60, 10);
    }
  });
});

describe('liturgicalDay', () => {
  const friday = new Date(2026, 9, 9);

  it('gives daytime texts their own civil day and evening texts the Hebrew day the evening opens', () => {
    expect(friday.getDay()).toBe(5);
    expect(liturgicalDay(friday, false).isSameDate(new HDate(friday))).toBe(true);
    expect(liturgicalDay(friday, true).getDay()).toBe(6);
    expect(liturgicalDay(friday, true).isSameDate(new HDate(friday).next())).toBe(true);
  });

  it('ignores the clock time carried by the window date', () => {
    const lateFriday = new Date(2026, 9, 9, 23, 45);
    expect(liturgicalDay(lateFriday, true).isSameDate(liturgicalDay(friday, true))).toBe(true);
    expect(liturgicalDay(lateFriday, false).isSameDate(liturgicalDay(friday, false))).toBe(true);
  });
});

describe('dayFeatures', () => {
  const on = (hd: HDate, place: Place = ISRAEL) => dayFeatures(hd, place).flags;
  const at = (day: number, month: number, year: number, place: Place = ISRAEL) =>
    on(new HDate(day, month, year), place);
  const civil = (y: number, m: number, d: number, place: Place = ISRAEL) => on(new HDate(new Date(y, m - 1, d)), place);

  it('marks Shabbat on Saturday only', () => {
    const weekday = new HDate(12, months.CHESHVAN, 5787);
    expect(weekday.getDay()).toBe(5);
    expect(on(weekday).has('shabbat')).toBe(false);
    expect(on(weekday).has('friday')).toBe(true);
    expect(civil(2026, 10, 10).has('friday')).toBe(false);
    expect(civil(2026, 10, 10).has('shabbat')).toBe(true);
    expect(dayFeatures(weekday, ISRAEL).omerDay).toBeNull();
  });

  it('the first day of Pesach is Yom Tov with shehecheyanu; the second day differs between Israel and the diaspora', () => {
    expect(hasAll(at(15, months.NISAN, 5786), ['yomTov', 'shehecheyanu'])).toBe(true);
    expect(hasNone(at(16, months.NISAN, 5786), ['yomTov', 'shehecheyanu'])).toBe(true);
    expect(at(16, months.NISAN, 5786).has('cholHamoedPesach')).toBe(true);
    expect(hasAll(at(16, months.NISAN, 5786, DIASPORA), ['yomTov', 'shehecheyanu'])).toBe(true);
  });

  it('the last days of Pesach are Yom Tov without shehecheyanu', () => {
    expect(at(21, months.NISAN, 5786).has('yomTov')).toBe(true);
    expect(at(21, months.NISAN, 5786).has('shehecheyanu')).toBe(false);
    expect(at(22, months.NISAN, 5786, DIASPORA).has('yomTov')).toBe(true);
    expect(at(22, months.NISAN, 5786, DIASPORA).has('shehecheyanu')).toBe(false);
    expect(at(22, months.NISAN, 5786).has('yomTov')).toBe(false);
  });

  it('Yom Kippur is its own flag, carries shehecheyanu, and is not counted as Yom Tov', () => {
    const yomKippur = at(10, months.TISHREI, 5787);
    expect(hasAll(yomKippur, ['yomKippur', 'shehecheyanu'])).toBe(true);
    expect(yomKippur.has('yomTov')).toBe(false);
    expect(yomKippur.has('publicFast')).toBe(false);
  });

  it('Rosh Hashana is Yom Tov with shehecheyanu on both days, in Israel too', () => {
    expect(hasAll(at(1, months.TISHREI, 5787), ['shabbat', 'yomTov', 'shehecheyanu'])).toBe(true);
    expect(hasAll(at(2, months.TISHREI, 5787), ['yomTov', 'shehecheyanu'])).toBe(true);
  });

  it("Tisha B'Av follows the observed day when the 9th falls on Shabbat, and counts as a public fast", () => {
    expect(hasAll(at(9, months.AV, 5786), ['tishaBav', 'publicFast'])).toBe(true);
    expect(at(9, months.AV, 5782).has('tishaBav')).toBe(false);
    expect(hasAll(at(10, months.AV, 5782), ['tishaBav', 'publicFast'])).toBe(true);
  });

  it('marks Rosh Chodesh and both kinds of Chol HaMoed, including Hoshana Rabba', () => {
    expect(at(1, months.CHESHVAN, 5787).has('roshChodesh')).toBe(true);
    expect(at(30, months.KISLEV, 5787).has('roshChodesh')).toBe(true);
    expect(at(17, months.TISHREI, 5787).has('cholHamoedSukkot')).toBe(true);
    expect(at(21, months.TISHREI, 5787).has('cholHamoedSukkot')).toBe(true);
    expect(at(18, months.NISAN, 5786).has('cholHamoedPesach')).toBe(true);
  });

  it('counts the omer from the 16th of Nisan to the 5th of Sivan only', () => {
    const omer = (day: number, month: number) => dayFeatures(new HDate(day, month, 5786), ISRAEL);
    expect(omer(15, months.NISAN).omerDay).toBeNull();
    expect(omer(15, months.NISAN).flags.has('omer')).toBe(false);
    expect(omer(16, months.NISAN).omerDay).toBe(1);
    expect(omer(16, months.NISAN).flags.has('omer')).toBe(true);
    expect(omer(1, months.IYYAR).omerDay).toBe(16);
    expect(omer(5, months.SIVAN).omerDay).toBe(49);
    expect(omer(6, months.SIVAN).omerDay).toBeNull();
  });

  it('says mashiv haruach from Shemini Atzeret to the eve of Pesach', () => {
    expect(at(21, months.TISHREI, 5787).has('winter')).toBe(false);
    expect(at(22, months.TISHREI, 5787).has('winter')).toBe(true);
    expect(at(23, months.TISHREI, 5787).has('winter')).toBe(true);
    expect(at(14, months.NISAN, 5787).has('winter')).toBe(true);
    expect(at(15, months.NISAN, 5787).has('winter')).toBe(false);
  });

  it('asks for rain from the 7th of Cheshvan in Israel', () => {
    expect(at(6, months.CHESHVAN, 5787).has('talUmatar')).toBe(false);
    expect(at(7, months.CHESHVAN, 5787).has('talUmatar')).toBe(true);
    expect(at(14, months.NISAN, 5787).has('talUmatar')).toBe(true);
    expect(at(15, months.NISAN, 5787).has('talUmatar')).toBe(false);
  });

  it('asks for rain from the evening of December 4th in the diaspora, a day later before a civil leap year', () => {
    expect(civil(2026, 12, 4, DIASPORA).has('talUmatar')).toBe(false);
    expect(civil(2026, 12, 5, DIASPORA).has('talUmatar')).toBe(true);
    expect(civil(2027, 12, 5, DIASPORA).has('talUmatar')).toBe(false);
    expect(civil(2027, 12, 6, DIASPORA).has('talUmatar')).toBe(true);
    expect(civil(2026, 12, 4).has('talUmatar')).toBe(true);
  });

  it('marks the Ten Days of Repentance, and the LeDavid season from the first day of Rosh Chodesh Elul', () => {
    expect(at(3, months.TISHREI, 5787).has('aseretYemeiTeshuva')).toBe(true);
    expect(at(9, months.TISHREI, 5787).has('aseretYemeiTeshuva')).toBe(true);
    expect(at(11, months.TISHREI, 5787).has('aseretYemeiTeshuva')).toBe(false);
    expect(at(9, months.TISHREI, 5787).has('erevYomKippur')).toBe(true);
    expect(at(8, months.TISHREI, 5787).has('erevYomKippur')).toBe(false);
    expect(at(29, months.AV, 5786).has('ledavidSeason')).toBe(false);
    expect(at(30, months.AV, 5786).has('ledavidSeason')).toBe(true);
    expect(at(1, months.ELUL, 5786).has('ledavidSeason')).toBe(true);
    expect(at(21, months.TISHREI, 5787).has('ledavidSeason')).toBe(true);
    expect(at(22, months.TISHREI, 5787).has('ledavidSeason')).toBe(false);
  });

  it('marks the eight days of Chanukah', () => {
    const first = new HDate(25, months.KISLEV, 5787);
    expect(on(first.prev()).has('chanukah')).toBe(false);
    expect(on(first).has('chanukah')).toBe(true);
    expect(on(first.add(7)).has('chanukah')).toBe(true);
    expect(on(first.add(8)).has('chanukah')).toBe(false);
  });

  it('marks the first night of Chanukah, the Kiddush Levana days and Av before the observed Tisha B’Av', () => {
    expect(at(25, months.KISLEV, 5787).has('chanukahFirstNight')).toBe(true);
    expect(at(26, months.KISLEV, 5787).has('chanukahFirstNight')).toBe(false);
    expect(at(24, months.KISLEV, 5787).has('chanukahFirstNight')).toBe(false);
    expect(at(2, months.CHESHVAN, 5787).has('kiddushLevana')).toBe(false);
    expect(at(3, months.CHESHVAN, 5787).has('kiddushLevana')).toBe(true);
    expect(at(15, months.CHESHVAN, 5787).has('kiddushLevana')).toBe(true);
    expect(at(16, months.CHESHVAN, 5787).has('kiddushLevana')).toBe(false);
    expect(new HDate(9, months.AV, 5786).getDay()).not.toBe(6);
    expect(at(9, months.AV, 5786).has('avBeforeTishaBav')).toBe(true);
    expect(at(10, months.AV, 5786).has('avBeforeTishaBav')).toBe(false);
    expect(new HDate(9, months.AV, 5789).getDay()).toBe(6);
    expect(at(10, months.AV, 5789).has('avBeforeTishaBav')).toBe(true);
    expect(at(11, months.AV, 5789).has('avBeforeTishaBav')).toBe(false);
    expect(at(9, months.ELUL, 5786).has('avBeforeTishaBav')).toBe(false);
  });

  it('names what yesterday was, for a meal begun before sunset, only on a day without that insert of its own', () => {
    expect(at(2, months.CHESHVAN, 5787).has('roshChodeshYesterday')).toBe(true);
    expect(at(1, months.CHESHVAN, 5787).has('roshChodeshYesterday')).toBe(false);
    expect(at(3, months.CHESHVAN, 5787).has('roshChodeshYesterday')).toBe(false);
    expect(at(30, months.TISHREI, 5787).has('roshChodesh')).toBe(true);
    expect(at(1, months.CHESHVAN, 5787).has('roshChodesh')).toBe(true);
    expect(at(22, months.TISHREI, 5787).has('cholHamoedSukkotYesterday')).toBe(true);
    expect(at(22, months.TISHREI, 5787).has('yomTov')).toBe(true);
    expect(at(21, months.TISHREI, 5787).has('cholHamoedSukkotYesterday')).toBe(false);
    expect(at(21, months.NISAN, 5786, DIASPORA).has('cholHamoedPesachYesterday')).toBe(true);
    expect(at(21, months.NISAN, 5786).has('cholHamoedPesachYesterday')).toBe(true);
    expect(at(20, months.NISAN, 5786).has('cholHamoedPesachYesterday')).toBe(false);
    expect(at(3, months.TEVET, 5787).has('chanukahYesterday')).toBe(true);
    expect(at(2, months.TEVET, 5787).has('chanukahYesterday')).toBe(false);
    expect(at(4, months.TEVET, 5787).has('chanukahYesterday')).toBe(false);
    expect(at(15, months.ADAR_II, 5787).has('purimYesterday')).toBe(true);
    expect(at(15, months.ADAR_II, 5787, { inIsrael: true, jerusalem: true }).has('purimYesterday')).toBe(false);
    expect(at(16, months.ADAR_II, 5787, { inIsrael: true, jerusalem: true }).has('purimYesterday')).toBe(true);
    expect(at(16, months.ADAR_II, 5787).has('purimYesterday')).toBe(false);
  });

  it('marks Purim on the 14th, and on the 15th in Jerusalem, never on Purim Katan', () => {
    const jerusalem = { inIsrael: true, jerusalem: true };
    expect(at(14, months.ADAR_I, 5786).has('purim')).toBe(true);
    expect(at(14, months.ADAR_I, 5786, jerusalem).has('purim')).toBe(false);
    expect(at(15, months.ADAR_I, 5786, jerusalem).has('purim')).toBe(true);
    expect(at(15, months.ADAR_I, 5786).has('purim')).toBe(false);
    expect(at(14, months.ADAR_II, 5787).has('purim')).toBe(true);
    expect(at(14, months.ADAR_I, 5787).has('purim')).toBe(false);
  });

  it('marks every public fast', () => {
    expect(at(3, months.TISHREI, 5787).has('publicFast')).toBe(true);
    expect(at(10, months.TEVET, 5787).has('publicFast')).toBe(true);
    expect(at(17, months.TAMUZ, 5786).has('publicFast')).toBe(true);
    expect(at(13, months.ADAR_I, 5786).has('publicFast')).toBe(true);
    expect(at(12, months.CHESHVAN, 5787).has('publicFast')).toBe(false);
  });

  it('follows Hebcal on tachanun, and flags the days some communities skip it', () => {
    expect(at(11, months.CHESHVAN, 5787).has('tachanunMincha')).toBe(true);
    expect(at(12, months.CHESHVAN, 5787).has('tachanunMincha')).toBe(false);
    expect(at(12, months.CHESHVAN, 5787).has('tachanunShacharit')).toBe(true);
    expect(at(29, months.CHESHVAN, 5787).has('tachanunMincha')).toBe(false);
    expect(at(1, months.CHESHVAN, 5787).has('tachanunShacharit')).toBe(false);
    expect(at(11, months.CHESHVAN, 5787).has('tachanunDisputed')).toBe(false);
    expect(at(5, months.IYYAR, 5786).has('tachanunDisputed')).toBe(true);
  });

  it('marks the night after Shabbat or Yom Tov, and says Vihi Noam only before an ordinary week', () => {
    const sunday = new HDate(new Date(2026, 9, 11));
    expect(sunday.getDay()).toBe(0);
    expect(hasAll(on(sunday), ['motzaei', 'motzaeiShabbat'])).toBe(true);
    expect(on(sunday).has('viHiNoam')).toBe(true);
    expect(on(sunday.add(1)).has('motzaei')).toBe(false);

    expect(on(new HDate(16, months.NISAN, 5786)).has('motzaei')).toBe(true);
    expect(on(new HDate(16, months.NISAN, 5786)).has('motzaeiShabbat')).toBe(false);

    const sundayBeforeSukkot = new HDate(new Date(2026, 8, 20));
    expect(sundayBeforeSukkot.getDay()).toBe(0);
    expect(on(sundayBeforeSukkot).has('viHiNoam')).toBe(false);
    expect(on(sunday.add(1)).has('viHiNoam')).toBe(false);

    const tishaBavSunday = new HDate(10, months.AV, 5782);
    expect(on(tishaBavSunday).has('viHiNoam')).toBe(false);
  });

  it('names each weekday, and none on Shabbat', () => {
    const sunday = new HDate(new Date(2026, 9, 11));
    const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
    names.forEach((name, offset) => {
      const flags = on(sunday.add(offset));
      expect(names.filter((other) => flags.has(other))).toEqual([name]);
    });
    expect(names.some((name) => on(sunday.add(6)).has(name))).toBe(false);
  });

  it('reads the Torah on Monday, Thursday, Rosh Chodesh, Chol HaMoed, Chanukah, Purim and public fasts only', () => {
    const tuesday = new HDate(new Date(2026, 10, 3));
    expect(tuesday.getDay()).toBe(2);
    expect(on(tuesday).has('torahReading')).toBe(false);
    expect(on(tuesday.prev()).has('torahReading')).toBe(true);
    expect(on(tuesday.add(2)).has('torahReading')).toBe(true);
    for (const day of [
      at(1, months.CHESHVAN, 5787),
      at(18, months.NISAN, 5786),
      at(18, months.TISHREI, 5787),
      at(27, months.KISLEV, 5787),
      at(14, months.ADAR_II, 5787),
      at(17, months.TAMUZ, 5786),
      at(9, months.AV, 5786),
    ]) {
      expect(day.has('torahReading')).toBe(true);
    }
    const jerusalem = { inIsrael: true, jerusalem: true };
    expect(at(14, months.ADAR_II, 5787, jerusalem).has('torahReading')).toBe(false);
    expect(at(15, months.ADAR_II, 5787, jerusalem).has('torahReading')).toBe(true);
  });

  it('says Musaf on Rosh Chodesh and Chol HaMoed', () => {
    expect(at(1, months.CHESHVAN, 5787).has('musaf')).toBe(true);
    expect(at(18, months.NISAN, 5786).has('musaf')).toBe(true);
    expect(at(21, months.TISHREI, 5787).has('musaf')).toBe(true);
    expect(at(27, months.KISLEV, 5787).has('musaf')).toBe(false);
    expect(at(12, months.CHESHVAN, 5787).has('musaf')).toBe(false);
  });

  it('says whole Hallel, half Hallel, or marks the days only some communities say it', () => {
    expect(hasAll(at(27, months.KISLEV, 5787), ['hallelWhole'])).toBe(true);
    expect(hasAll(at(18, months.TISHREI, 5787), ['hallelWhole'])).toBe(true);
    expect(hasAll(at(1, months.CHESHVAN, 5787), ['hallelHalf'])).toBe(true);
    expect(hasAll(at(18, months.NISAN, 5786), ['hallelHalf'])).toBe(true);
    expect(hasAll(civil(2026, 4, 22), ['hallelDisputed'])).toBe(true);
    expect(hasNone(civil(2026, 4, 22), ['hallelWhole', 'hallelHalf'])).toBe(true);
    expect(hasAll(at(28, months.IYYAR, 5786), ['hallelDisputed'])).toBe(true);
    expect(hasNone(at(12, months.CHESHVAN, 5787), ['hallelWhole', 'hallelHalf', 'hallelDisputed'])).toBe(true);
    expect(hasNone(at(14, months.ADAR_II, 5787), ['hallelWhole', 'hallelHalf', 'hallelDisputed'])).toBe(true);
  });

  it('marks erev Pesach, both days of Purim anywhere, and Purim Katan', () => {
    expect(at(14, months.NISAN, 5786).has('erevPesach')).toBe(true);
    expect(at(13, months.NISAN, 5786).has('erevPesach')).toBe(false);
    for (const date of [14, 15]) {
      expect(at(date, months.ADAR_II, 5787).has('purimOrShushan')).toBe(true);
      expect(at(date, months.ADAR_I, 5787).has('purimKatan')).toBe(true);
      expect(at(date, months.ADAR_I, 5787).has('purimOrShushan')).toBe(false);
    }
    expect(at(16, months.ADAR_II, 5787).has('purimOrShushan')).toBe(false);
  });

  it('adds "ulechaparat pesha" from Rosh Chodesh Cheshvan to Rosh Chodesh Adar II of a leap year only', () => {
    expect(at(30, months.TISHREI, 5787).has('ulechaparatPesha')).toBe(true);
    expect(at(1, months.ADAR_II, 5787).has('ulechaparatPesha')).toBe(true);
    expect(at(1, months.NISAN, 5787).has('ulechaparatPesha')).toBe(false);
    expect(at(29, months.TISHREI, 5787).has('ulechaparatPesha')).toBe(false);
    expect(at(1, months.CHESHVAN, 5786).has('ulechaparatPesha')).toBe(false);
  });

  it('names the Sukkot offerings of the day, and of the doubtful day too in the diaspora', () => {
    const offerings = (date: number, place: Place = ISRAEL) =>
      [2, 3, 4, 5, 6, 7].filter((day) => at(date, months.TISHREI, 5787, place).has(`sukkotOffering${day}` as DayFlag));
    expect(offerings(16)).toEqual([2]);
    expect(offerings(17)).toEqual([3]);
    expect(offerings(21)).toEqual([7]);
    expect(offerings(17, DIASPORA)).toEqual([2, 3]);
    expect(offerings(21, DIASPORA)).toEqual([6, 7]);
    expect(offerings(22)).toEqual([]);
    expect(offerings(12)).toEqual([]);
  });

  it('says shehecheyanu on the lulav on Chol HaMoed only in Israel when the first day of Sukkot was Shabbat', () => {
    const firstDayOnShabbat = 5787;
    const otherYear = 5786;
    expect(new HDate(15, months.TISHREI, firstDayOnShabbat).getDay()).toBe(6);
    expect(new HDate(15, months.TISHREI, otherYear).getDay()).not.toBe(6);
    expect(at(16, months.TISHREI, firstDayOnShabbat).has('lulavShehecheyanu')).toBe(true);
    expect(at(16, months.TISHREI, firstDayOnShabbat, DIASPORA).has('lulavShehecheyanu')).toBe(false);
    expect(at(17, months.TISHREI, firstDayOnShabbat).has('lulavShehecheyanu')).toBe(false);
    expect(at(16, months.TISHREI, otherYear).has('lulavShehecheyanu')).toBe(false);
  });

  it('names each minor fast on the day it is observed, postponed ones included', () => {
    const fasts: DayFlag[] = ['tzomGedaliah', 'asaraBTevet', 'taanitEsther', 'tzomTammuz'];
    const named = (flags: ReadonlySet<DayFlag>) => fasts.filter((fast) => flags.has(fast));
    expect(named(at(3, months.TISHREI, 5786))).toEqual(['tzomGedaliah']);
    expect(named(at(4, months.TISHREI, 5785))).toEqual(['tzomGedaliah']);
    expect(named(at(3, months.TISHREI, 5785))).toEqual([]);
    expect(named(at(10, months.TEVET, 5787))).toEqual(['asaraBTevet']);
    expect(named(at(13, months.ADAR_II, 5787))).toEqual(['taanitEsther']);
    expect(named(at(11, months.ADAR_I, 5788))).toEqual(['taanitEsther']);
    expect(named(at(13, months.ADAR_I, 5788))).toEqual([]);
    expect(named(at(17, months.TAMUZ, 5786))).toEqual(['tzomTammuz']);
    expect(named(at(9, months.AV, 5786))).toEqual([]);
  });

  it('marks the day after Yom Kippur and Hoshana Rabba', () => {
    expect(at(11, months.TISHREI, 5787).has('dayAfterYomKippur')).toBe(true);
    expect(at(12, months.TISHREI, 5787).has('dayAfterYomKippur')).toBe(false);
    expect(at(21, months.TISHREI, 5787).has('hoshanaRabba')).toBe(true);
    expect(at(21, months.TISHREI, 5787, DIASPORA).has('hoshanaRabba')).toBe(true);
    expect(at(20, months.TISHREI, 5787).has('hoshanaRabba')).toBe(false);
  });

  it('carries the place', () => {
    expect(at(12, months.CHESHVAN, 5787).has('inIsrael')).toBe(true);
    expect(at(12, months.CHESHVAN, 5787, DIASPORA).has('inIsrael')).toBe(false);
  });
});

describe('matchesCondition', () => {
  it('needs every "all" flag, rejects any "none" flag, and matches the omer day exactly', () => {
    const day = features(['shabbat', 'yomTov'], 7);
    expect(matchesCondition(undefined, day)).toBe(true);
    expect(matchesCondition({ all: ['shabbat', 'yomTov'] }, day)).toBe(true);
    expect(matchesCondition({ all: ['shabbat', 'yomKippur'] }, day)).toBe(false);
    expect(matchesCondition({ none: ['tishaBav'] }, day)).toBe(true);
    expect(matchesCondition({ none: ['yomTov'] }, day)).toBe(false);
    expect(matchesCondition({ omerDay: 7 }, day)).toBe(true);
    expect(matchesCondition({ omerDay: 8 }, day)).toBe(false);
    expect(matchesCondition({ omerDay: 1 }, features([]))).toBe(false);
  });
});

describe('resolveSiddurText', () => {
  const text: SiddurText = {
    nusach: 'edot_hamizrach',
    id: 'candle_lighting',
    credits: [],
    sections: [
      {
        title: { he: 'שבת', en: 'Shabbat' },
        segments: [{ he: [[{ t: 'נר של שבת' }]], when: { all: ['shabbat'] } }],
      },
      {
        title: { he: 'יום טוב', en: 'Yom Tov' },
        segments: [
          {
            he: [
              [{ t: 'נר של ' }, { t: 'שבת ו', when: { all: ['shabbat'] } }, { t: 'יום טוב' }],
              [{ t: 'שבת', when: { all: ['shabbat'] } }],
            ],
            when: { all: ['yomTov'] },
          },
          { he: [[{ t: 'שהחיינו' }]], en: 'Shehecheyanu', when: { all: ['shehecheyanu'] } },
        ],
      },
    ],
  };

  const said = (flags: DayFlag[]) =>
    resolveSiddurText(text, features(flags)).map((section) => ({
      title: section.title.he,
      lines: section.segments.map((segment) => segment.he.map((runs) => runs.map((run) => run.t).join(''))),
    }));

  it('keeps only what applies and drops a section left empty', () => {
    expect(said(['shabbat'])).toEqual([{ title: 'שבת', lines: [['נר של שבת']] }]);
  });

  it('filters inline runs and drops a paragraph whose every run was filtered out', () => {
    expect(said(['yomTov'])).toEqual([{ title: 'יום טוב', lines: [['נר של יום טוב']] }]);
    expect(said(['yomTov', 'shabbat', 'shehecheyanu'])).toEqual([
      { title: 'שבת', lines: [['נר של שבת']] },
      { title: 'יום טוב', lines: [['נר של שבת ויום טוב', 'שבת'], ['שהחיינו']] },
    ]);
  });

  it('returns nothing when nothing applies', () => {
    expect(said([])).toEqual([]);
  });

  it('keeps a minyan-only section flag and a praying-alone label through resolution', () => {
    const alone: PassageLabel = { he: 'המתפלל ביחיד אומר', en: 'Said when praying alone', alone: true };
    const flagged: SiddurText = {
      nusach: 'ashkenaz',
      id: 'shacharit',
      credits: [],
      sections: [
        { title: { he: 'קדיש', en: 'Kaddish' }, minyanOnly: true, segments: [{ he: [[{ t: 'יתגדל' }]] }] },
        {
          title: { he: 'שמע', en: 'Shema' },
          segments: [{ he: [[{ t: 'אל מלך נאמן' }]], optional: alone }, { he: [[{ t: 'שמע ישראל' }]] }],
        },
      ],
    };
    const [kaddish, shema] = resolveSiddurText(flagged, features([]));
    expect(kaddish.minyanOnly).toBe(true);
    expect(shema.minyanOnly).toBeUndefined();
    expect(shema.segments[0].optional).toEqual(alone);
  });

  it('leaves no stray space at the edges of a paragraph whose alternative was filtered out', () => {
    const alternatives: SiddurText = {
      ...text,
      sections: [
        {
          title: { he: 'גבורות', en: 'Divine Might' },
          segments: [
            {
              he: [
                [
                  { t: 'בקיץ', s: 'n', when: { none: ['winter'] } },
                  { t: ' מוריד הטל: ', when: { none: ['winter'] } },
                  { t: ' ' },
                  { t: 'בחורף', s: 'n', when: { all: ['winter'] } },
                  { t: ' משיב הרוח: ', when: { all: ['winter'] } },
                ],
              ],
            },
          ],
        },
      ],
    };
    const runsOn = (flags: DayFlag[]) => resolveSiddurText(alternatives, features(flags))[0].segments[0].he[0];
    expect(runsOn(['winter'])).toEqual([
      { t: 'בחורף', s: 'n', when: { all: ['winter'] } },
      { t: ' משיב הרוח:', when: { all: ['winter'] } },
    ]);
    expect(runsOn([])).toEqual([
      { t: 'בקיץ', s: 'n', when: { none: ['winter'] } },
      { t: ' מוריד הטל:', when: { none: ['winter'] } },
    ]);
  });

  it('leaves a single space where a filtered insert sat between two spaces', () => {
    const insert: SiddurText = {
      ...text,
      sections: [
        {
          title: { he: 'מוסף', en: 'Musaf' },
          segments: [
            { he: [[{ t: 'את יום ' }, { t: 'השבת הזה ואת יום', when: { all: ['shabbat'] } }, { t: ' חג הסכות הזה' }]] },
          ],
        },
      ],
    };
    const line = (flags: DayFlag[]) =>
      resolveSiddurText(insert, features(flags))[0]
        .segments[0].he[0].map((run) => run.t)
        .join('');
    expect(line([])).toBe('את יום חג הסכות הזה');
    expect(line(['shabbat'])).toBe('את יום השבת הזה ואת יום חג הסכות הזה');
  });
});

describe('passage labels', () => {
  const someSay: PassageLabel = { he: 'יש אומרים', en: 'Some say' };
  const hallelToday: PassageLabel = {
    he: 'יש נוהגים לומר הלל היום',
    en: 'Some say Hallel today',
    when: { all: ['hallelDisputed'] },
  };
  const verseOnRoshChodesh: PassageLabel = {
    he: 'יש אומרים פסוק',
    en: 'Some say a verse',
    when: { all: ['roshChodesh'] },
  };
  const text: SiddurText = {
    nusach: 'ashkenaz',
    id: 'shacharit',
    credits: [],
    sections: [
      {
        title: { he: 'הלל', en: 'Hallel' },
        optional: hallelToday,
        segments: [{ he: [[{ t: 'הללויה' }]] }, { he: [[{ t: 'ואברהם זקן' }]], optional: verseOnRoshChodesh }],
      },
      {
        title: { he: 'עמידה', en: 'Amidah' },
        segments: [
          { he: [[{ t: 'רפאנו' }]] },
          { he: [[{ t: 'על החולה', s: 'n' }]], optional: someSay },
          { he: [[{ t: 'יהי רצון' }]], optional: someSay },
          { he: [[{ t: 'רופא חולי עמו ישראל' }]] },
          { he: [[{ t: 'ענינו' }]], optional: { he: 'יש אומרים עננו', en: 'Some say Aneinu' } },
        ],
      },
    ],
  };
  const labels = (flags: DayFlag[]) =>
    resolveSiddurText(text, features(flags)).map((section) => ({
      section: section.optional?.he ?? null,
      segments: section.segments.map((segment) => segment.optional?.he ?? null),
    }));

  it('keeps a label only on the days its condition holds, and always keeps an unconditional one', () => {
    expect(labels(['hallelDisputed'])).toEqual([
      { section: hallelToday.he, segments: [null, null] },
      { section: null, segments: [null, someSay.he, someSay.he, null, 'יש אומרים עננו'] },
    ]);
    expect(labels(['roshChodesh'])[0]).toEqual({ section: null, segments: [null, verseOnRoshChodesh.he] });
    expect(labels([])[1].segments).toEqual([null, someSay.he, someSay.he, null, 'יש אומרים עננו']);
  });

  it('resolves a minyan label the same way, and groups by it with the offset of its enclosing block', () => {
    const fastOnly: PassageLabel = { he: 'ברכת כהנים', en: 'Priestly Blessing', when: { all: ['publicFast'] } };
    const chazzan: PassageLabel = { he: 'שליח הציבור', en: 'Chazzan' };
    const amidah: SiddurText = {
      ...text,
      sections: [
        {
          title: { he: 'עמידה', en: 'Amidah' },
          segments: [
            { he: [[{ t: 'מודים' }]] },
            { he: [[{ t: 'יברכך' }]], minyan: fastOnly },
            { he: [[{ t: 'קדיש' }]], minyan: chazzan },
            { he: [[{ t: 'יהא שמה' }]], minyan: chazzan },
          ],
        },
      ],
    };
    const blocks = (flags: DayFlag[]) =>
      segmentBlocks(resolveSiddurText(amidah, features(flags))[0].segments, 'minyan', 10).map((block) => [
        block.start,
        block.label?.he ?? null,
      ]);
    expect(blocks(['publicFast'])).toEqual([
      [10, null],
      [11, fastOnly.he],
      [12, chazzan.he],
    ]);
    expect(blocks([])).toEqual([
      [10, null],
      [12, chazzan.he],
    ]);
  });

  it('groups each run of segments that share a label into one block, keeping the said text around it apart', () => {
    const amidah = resolveSiddurText(text, features([]))[1];
    expect(
      segmentBlocks(amidah.segments, 'optional').map((block) => ({
        start: block.start,
        label: block.label?.he ?? null,
        text: block.segments.map((segment) => segment.he[0][0].t),
      })),
    ).toEqual([
      { start: 0, label: null, text: ['רפאנו'] },
      { start: 1, label: someSay.he, text: ['על החולה', 'יהי רצון'] },
      { start: 3, label: null, text: ['רופא חולי עמו ישראל'] },
      { start: 4, label: 'יש אומרים עננו', text: ['ענינו'] },
    ]);
  });
});

describe('aloneFolds', () => {
  const withMinyan: PassageLabel = { he: 'נאמר רק במניין', en: 'Said only with a minyan' };
  const aloneOnly: PassageLabel = { he: 'המתפלל ביחיד אומר', en: 'Said when praying alone', alone: true };
  const someSay: PassageLabel = { he: 'יש אומרים', en: 'Some say' };
  const said = (t: string, labels: Partial<Pick<SiddurSegment, 'optional' | 'minyan'>> = {}): SiddurSegment => ({
    he: [[{ t }]],
    ...labels,
  });
  const kaddish: SiddurSection = {
    title: { he: 'קדיש', en: 'Kaddish' },
    minyanOnly: true,
    segments: [said('יתגדל')],
  };
  const amidah: SiddurSection = {
    title: { he: 'עמידה', en: 'Amidah' },
    segments: [
      said('מודים'),
      said('קדושה', { minyan: withMinyan }),
      said('נקדש', { minyan: withMinyan }),
      said('רפאנו', { optional: aloneOnly }),
      said('אומרים', { optional: someSay }),
      said('ברכו', { optional: someSay, minyan: withMinyan }),
    ],
  };
  const outline = (section: SiddurSection, mode: PrayerMode) =>
    aloneFolds(section, mode).blocks.map((block) => ({
      start: block.start,
      openByDefault: block.openByDefault,
      minyanBlocks: block.minyanBlocks.map((inner) => [inner.start, inner.folded]),
    }));

  it('folds nothing and opens nothing by default when praying with a minyan', () => {
    expect(aloneFolds(kaddish, 'minyan')).toMatchObject({ minyanFolded: false, optionalOpen: false });
    expect(outline(amidah, 'minyan')).toEqual([
      {
        start: 0,
        openByDefault: false,
        minyanBlocks: [
          [0, false],
          [1, false],
        ],
      },
      { start: 3, openByDefault: false, minyanBlocks: [[3, false]] },
      {
        start: 4,
        openByDefault: false,
        minyanBlocks: [
          [4, false],
          [5, false],
        ],
      },
    ]);
  });

  it('folds a minyan-only section when praying alone, and only that one', () => {
    expect(aloneFolds(kaddish, 'alone').minyanFolded).toBe(true);
    expect(aloneFolds(amidah, 'alone').minyanFolded).toBe(false);
  });

  it('folds each minyan block when praying alone, also inside an optional block, by section-relative start', () => {
    expect(outline(amidah, 'alone')).toEqual([
      {
        start: 0,
        openByDefault: false,
        minyanBlocks: [
          [0, false],
          [1, true],
        ],
      },
      { start: 3, openByDefault: true, minyanBlocks: [[3, false]] },
      {
        start: 4,
        openByDefault: false,
        minyanBlocks: [
          [4, false],
          [5, true],
        ],
      },
    ]);
  });

  it('opens by default only an optional passage said when praying alone, and only in that mode', () => {
    const optionalSection: SiddurSection = { ...kaddish, minyanOnly: undefined, optional: aloneOnly };
    expect(aloneFolds(optionalSection, 'alone').optionalOpen).toBe(true);
    expect(aloneFolds(optionalSection, 'minyan').optionalOpen).toBe(false);
    expect(aloneFolds({ ...optionalSection, optional: someSay }, 'alone').optionalOpen).toBe(false);
  });
});

describe('forMaritalStatus', () => {
  const marriedOnly: PassageLabel = {
    he: 'בלילה שיש בו תשמיש המטה',
    en: 'On a night of marital relations',
    marriedOnly: true,
  };
  const someSay: PassageLabel = { he: 'יש אומרים', en: 'Some say' };
  const said = (t: string, optional?: PassageLabel): SiddurSegment => ({
    he: [[{ t }]],
    ...(optional ? { optional } : {}),
  });
  const section = (he: string, segments: SiddurSegment[], optional?: PassageLabel): SiddurSection => ({
    title: { he, en: he },
    ...(optional ? { optional } : {}),
    segments,
  });
  const hamapil = section('המפיל', [said('המפיל')]);
  const relations = section('לפני תשמיש המטה', [said('תשמיש')], marriedOnly);
  const mixed = section('שמע', [said('שמע'), said('תשמיש', marriedOnly), said('יש אומרים', someSay), said('ויאמר')]);
  const sections = [hamapil, relations, mixed];
  const titles = (list: SiddurSection[]) => list.map((candidate) => candidate.title.he);

  it('drops a section whose label is married-only for a single reader, and nothing else of its neighbours', () => {
    const single = forMaritalStatus(sections, 'single');
    expect(titles(single)).toEqual(['המפיל', 'שמע']);
    expect(single[0]).toBe(hamapil);
  });

  it('drops a married-only block inside a section, keeping the other labels', () => {
    const [, shma] = forMaritalStatus(sections, 'single');
    expect(shma.segments.map((segment) => segment.he[0][0].t)).toEqual(['שמע', 'יש אומרים', 'ויאמר']);
    expect(shma.segments[1].optional).toBe(someSay);
  });

  it('drops a section left with no segment once its married-only block is gone', () => {
    const onlyRelations = section('תשמיש', [said('תשמיש', marriedOnly)]);
    expect(forMaritalStatus([hamapil, onlyRelations], 'single')).toEqual([hamapil]);
  });

  it('keeps the passage, folded under its label, for a married reader and for one who has not answered', () => {
    for (const status of ['married', null] as const) {
      const kept = forMaritalStatus(sections, status);
      expect(kept).toBe(sections);
      expect(kept[1].optional).toBe(marriedOnly);
      expect(kept[2].segments[1].optional).toBe(marriedOnly);
    }
  });
});

describe('pickerEntries', () => {
  const section = (he: string, chapter?: string): SiddurSection => ({
    title: { he, en: he },
    ...(chapter ? { chapter: { he: chapter, en: chapter } } : {}),
    segments: [{ he: [[{ t: he }]] }],
  });

  it('lists every section of a text without chapters', () => {
    const sections = [section('א'), section('ב'), section('ג')];
    expect(pickerEntries(sections)).toEqual([
      { index: 0, title: { he: 'א', en: 'א' } },
      { index: 1, title: { he: 'ב', en: 'ב' } },
      { index: 2, title: { he: 'ג', en: 'ג' } },
    ]);
    expect(pickerEntryAt(pickerEntries(sections), sections, 1)).toEqual({ index: 1, title: { he: 'ב', en: 'ב' } });
  });

  it('lists only the chapters of a text that has them, each at the section that opens it', () => {
    const sections = [
      section('מודה אני', 'ברכות השחר'),
      section('ברכות התורה'),
      section('הודו', 'הודו'),
      section('עלינו'),
    ];
    const entries = pickerEntries(sections);
    expect(entries).toEqual([
      { index: 0, title: { he: 'ברכות השחר', en: 'ברכות השחר' } },
      { index: 2, title: { he: 'הודו', en: 'הודו' } },
    ]);
    // A section between chapters belongs to the chapter before it, the last one included.
    expect(pickerEntryAt(entries, sections, 1)).toEqual(entries[0]);
    expect(pickerEntryAt(entries, sections, 2)).toEqual(entries[1]);
    expect(pickerEntryAt(entries, sections, 3)).toEqual(entries[1]);
    expect(pickerEntryAt(entries, sections, 4)).toBeNull();
  });

  it('names a section that comes before the first chapter by its own title', () => {
    const sections = [section('הקדמה'), section('מודה אני', 'ברכות השחר')];
    const entries = pickerEntries(sections);
    expect(entries).toEqual([{ index: 1, title: { he: 'ברכות השחר', en: 'ברכות השחר' } }]);
    expect(pickerEntryAt(entries, sections, 0)).toEqual({ index: 0, title: { he: 'הקדמה', en: 'הקדמה' } });
  });
});
