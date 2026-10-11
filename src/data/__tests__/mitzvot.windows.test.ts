import { HDate } from '@hebcal/core';
import { findMitzvah, omerDayFor } from '../mitzvot';
import { CITIES } from '../cities';
import { at, zmanimFor } from '@/testing/zmanim';
import { HebcalService } from '@/services/HebcalService';
import { HOLY_BLOCK_EXIT_MIN } from '@/services/ZmanimService';
import { locationNoon } from '@/utils/locationDay';
import { UserSettings } from '@/types/mitzvah';

const JERUSALEM = CITIES[0];
const SETTINGS_GRA: UserSettings = { nusach: 'ashkenaz', halachicOpinions: { ksSofZman: 'GRA' }, inIsrael: true };
const SETTINGS_MA: UserSettings = { nusach: 'ashkenaz', halachicOpinions: { ksSofZman: 'MA' }, inIsrael: true };

const WEEKDAY = new Date('2026-04-23T12:00:00Z');
const FRIDAY = new Date('2026-04-24T12:00:00Z');
const SATURDAY = new Date('2026-04-25T12:00:00Z');

function ctx(date: Date, settings = SETTINGS_GRA, loc = JERUSALEM) {
  return { date, location: loc, settings, zmanim: zmanimFor(date, loc) };
}

describe('mitzvot windows extra', () => {
  it('3.1 tefillin: misheyakir → shkia', () => {
    const c = ctx(WEEKDAY);
    const w = findMitzvah('tefillin')!.computeWindow(c);
    expect(w!.start.getTime()).toBe(c.zmanim.misheyakir.getTime());
    expect(w!.end.getTime()).toBe(c.zmanim.shkia.getTime());
  });

  it('3.3 krias_shma_shacharit GRA: netz → sofZmanShmaGra', () => {
    const c = ctx(WEEKDAY, SETTINGS_GRA);
    const w = findMitzvah('krias_shma_shacharit')!.computeWindow(c);
    expect(w!.start.getTime()).toBe(c.zmanim.netzHaChama.getTime());
    expect(w!.end.getTime()).toBe(c.zmanim.sofZmanShmaGra.getTime());
  });

  it('3.4 krias_shma_shacharit MA differs from GRA', () => {
    const cGra = ctx(WEEKDAY, SETTINGS_GRA);
    const cMa = ctx(WEEKDAY, SETTINGS_MA);
    const wGra = findMitzvah('krias_shma_shacharit')!.computeWindow(cGra);
    const wMa = findMitzvah('krias_shma_shacharit')!.computeWindow(cMa);
    expect(wGra!.end.getTime()).not.toBe(wMa!.end.getTime());
  });

  it('3.5 shacharit: netz → sofZmanTfila', () => {
    const c = ctx(WEEKDAY);
    const w = findMitzvah('shacharit')!.computeWindow(c);
    expect(w!.start.getTime()).toBe(c.zmanim.netzHaChama.getTime());
    expect(w!.end.getTime()).toBe(c.zmanim.sofZmanTfilaGra.getTime());
  });

  it('3.6 mincha: minchaGedola → shkia', () => {
    const c = ctx(WEEKDAY);
    const w = findMitzvah('mincha')!.computeWindow(c);
    expect(w!.start.getTime()).toBe(c.zmanim.minchaGedola.getTime());
    expect(w!.end.getTime()).toBe(c.zmanim.shkia.getTime());
  });

  // Was `end > start`, which the old 18-hour window (tzeit → next-day MIDDAY chatzot) satisfied
  // happily. Maariv ends at chatzot halayla — never into the following morning.
  it('3.7 maariv: tzeit → chatzot halayla, and never past the next dawn', () => {
    const c = ctx(WEEKDAY);
    const w = findMitzvah('maariv')!.computeWindow(c)!;
    const nextDay = new Date(WEEKDAY.getFullYear(), WEEKDAY.getMonth(), WEEKDAY.getDate() + 1, 12);
    const nextAlot = zmanimFor(nextDay, JERUSALEM).alotHaShachar;

    expect(w.start.getTime()).toBe(c.zmanim.tzeitHakochavim.getTime());
    expect(w.end.getTime()).toBe(c.zmanim.chatzotLayla.getTime());
    expect(w.end.getTime()).toBeLessThan(nextAlot.getTime());
    const hours = (w.end.getTime() - w.start.getTime()) / 3_600_000;
    expect(hours).toBeGreaterThan(2);
    expect(hours).toBeLessThan(9);
  });

  it("3.7b sefirat haomer: tzeit → the next day's alot hashachar", () => {
    const omerNight = at(JERUSALEM, '2026-04-12T12:00'); // evening of 25 Nisan, omer night 11
    const c = ctx(omerNight);
    const w = findMitzvah('sefirat_haomer')!.computeWindow(c)!;
    const nextDay = at(JERUSALEM, '2026-04-13T12:00');

    expect(w.start.getTime()).toBe(c.zmanim.tzeitHakochavim.getTime());
    expect(w.end.getTime()).toBe(zmanimFor(nextDay, JERUSALEM).alotHaShachar.getTime());
    expect(w.end.getTime()).toBeGreaterThan(c.zmanim.chatzotLayla.getTime());
  });

  it('3.8 birchot_hashachar: alot → sofZmanShma', () => {
    const c = ctx(WEEKDAY);
    const w = findMitzvah('birchot_hashachar')!.computeWindow(c);
    expect(w!.start.getTime()).toBe(c.zmanim.alotHaShachar.getTime());
    expect(w!.end.getTime()).toBe(c.zmanim.sofZmanShmaGra.getTime());
  });

  it('3.9 candle lighting follows the local minhag: 40 min in Jerusalem, 18 elsewhere in Israel', () => {
    const jerusalem = ctx(FRIDAY);
    const telAviv = ctx(
      FRIDAY,
      SETTINGS_GRA,
      CITIES.find((c) => c.nameEn === 'Tel Aviv')!,
    );
    const minutesBefore = (c: ReturnType<typeof ctx>) => {
      const w = findMitzvah('candle_lighting')!.computeWindow(c)!;
      return (c.zmanim.shkia.getTime() - w.start.getTime()) / 60000;
    };

    expect(minutesBefore(jerusalem)).toBeCloseTo(40, 0);
    expect(minutesBefore(telAviv)).toBeCloseTo(18, 0);
  });

  // Candles are lit before Yom Tov too, not only on Friday. Pesach 5786 starts on a Wednesday
  // evening, which used to produce no reminder at all.
  it('3.9b candle lighting also fires on erev Yom Tov midweek', () => {
    const erevPesach = at(JERUSALEM, '2026-04-01T12:00'); // 14 Nisan
    expect(new Date(2026, 3, 1).getDay()).toBe(3); // a Wednesday, so Friday cannot explain a window
    expect(findMitzvah('candle_lighting')!.computeWindow(ctx(erevPesach))).not.toBeNull();
    const cholHamoed = at(JERUSALEM, '2026-04-05T12:00');
    expect(findMitzvah('candle_lighting')!.computeWindow(ctx(cholHamoed))).toBeNull();
  });

  it('3.10 candle lighting outside Israel: -20 min', () => {
    const NY = CITIES.find((c) => c.name === 'ניו יורק')!;
    const c = ctx(FRIDAY, { ...SETTINGS_GRA, inIsrael: false }, NY);
    const w = findMitzvah('candle_lighting')!.computeWindow(c);
    expect(w).not.toBeNull();
    const diff = (c.zmanim.shkia.getTime() - w!.start.getTime()) / 60000;
    expect(diff).toBeCloseTo(20, 0);
  });

  it('3.11 havdalah on Saturday only', () => {
    const cSat = ctx(SATURDAY);
    const wSat = findMitzvah('havdalah')!.computeWindow(cSat);
    expect(wSat).not.toBeNull();
    const cWed = ctx(WEEKDAY);
    const wWed = findMitzvah('havdalah')!.computeWindow(cWed);
    expect(wWed).toBeNull();
  });

  // Without a zone, omerDayFor reads the device's calendar date.
  it('3.12 the evening of 25 Nisan opens omer night 11', () => {
    expect(omerDayFor(new Date(2026, 3, 12, 12))).toBe(11);
  });

  // The two ends of the count. Getting these wrong is silent: night 1 is the one most commonly
  // forgotten, and a window on the night of Shavuot carries a bracha with nothing to count.
  it('3.12b omer runs from the evening of 15 Nisan to the evening of 4 Sivan, and no further', () => {
    const year = new HDate(new Date(2026, 3, 10)).getFullYear();
    const eveningOf = (day: number, month: string) =>
      omerDayFor(locationNoon(new HDate(day, month, year).greg(), JERUSALEM), JERUSALEM.tz);

    expect(eveningOf(14, 'Nisan')).toBeNull();
    expect(eveningOf(15, 'Nisan')).toBe(1);
    expect(eveningOf(4, 'Sivan')).toBe(49);
    expect(eveningOf(5, 'Sivan')).toBeNull(); // Shavuot night — the count is already finished
  });

  it('3.13 omer before 16 Nisan = null', () => {
    expect(omerDayFor(new Date(2026, 3, 1, 12))).toBeNull();
  });

  it('3.14 omer after Shavuot = null', () => {
    expect(omerDayFor(new Date('2026-06-15T12:00:00Z'))).toBeNull();
  });

  it('3.14b BUG-008 — omer respects location timezone at UTC day boundary', () => {
    const ny = CITIES.find((c) => c.name === 'ניו יורק')!;
    const instant = new Date('2026-04-13T01:30:00Z');
    expect(omerDayFor(instant, ny.tz)).toBe(11);
    expect(omerDayFor(instant, JERUSALEM.tz)).toBe(12);
  });

  it('3.15 tefillin on Saturday — skipOn shabbat (registry has skipOn)', () => {
    const m = findMitzvah('tefillin')!;
    expect(m.skipOn).toContain('shabbat');
  });

  // Callers pass anything from local midnight to "now", and the scheduler's "tomorrow" keeps the
  // rebuild's clock time. An evening ctx.date already sits in the next Hebrew day, which erased
  // erev-Yom-Tov candle lighting from any rebuild that ran after tzeit; a device-local "next day"
  // ended the omer night before it began whenever the device's zone was not the location's.
  it('3.16 a window depends only on the day, not on the clock time ctx.date carries', () => {
    const windowAt = (id: string, wallClock: string) => findMitzvah(id)!.computeWindow(ctx(at(JERUSALEM, wallClock)));
    const cases = [
      ['candle_lighting', '2026-04-01'], // erev Pesach, a Wednesday
      ['sefirat_haomer', '2026-04-12'],
      ['havdalah', '2026-04-25'],
    ];

    for (const [id, day] of cases) {
      const atNoon = windowAt(id, `${day}T12:00`);
      expect(atNoon).not.toBeNull();
      expect(windowAt(id, `${day}T00:30`)).toEqual(atNoon);
      expect(windowAt(id, `${day}T23:30`)).toEqual(atNoon);
    }
  });
  describe('a Shabbat / Yom Tov block lights candles once and makes havdalah once', () => {
    const NEW_YORK = CITIES.find((c) => c.nameEn === 'New York')!;
    const DIASPORA: UserSettings = { ...SETTINGS_GRA, inIsrael: false };
    const windowOn = (id: string, day: string, loc = JERUSALEM, settings = SETTINGS_GRA) =>
      findMitzvah(id)!.computeWindow(ctx(at(loc, `${day}T12:00`), settings, loc));

    it('lights only on the erev of the block, never on a day inside it', () => {
      // Rosh Hashana 5789 on Thursday-Friday, then Shabbat: one lighting, on Wednesday.
      expect(windowOn('candle_lighting', '2028-09-20')).not.toBeNull();
      expect(windowOn('candle_lighting', '2028-09-21')).toBeNull();
      expect(windowOn('candle_lighting', '2028-09-22')).toBeNull(); // a Friday, but already Yom Tov
      // Shabbat that flows into Rosh Hashana 5788: lit on Friday only.
      expect(windowOn('candle_lighting', '2027-10-01')).not.toBeNull();
      expect(windowOn('candle_lighting', '2027-10-02')).toBeNull();
      // Erev Yom Kippur.
      expect(windowOn('candle_lighting', '2027-10-10')).not.toBeNull();
    });

    it('makes havdalah only at the end of the block', () => {
      expect(windowOn('havdalah', '2028-09-21')).toBeNull();
      expect(windowOn('havdalah', '2028-09-22')).toBeNull();
      const end = windowOn('havdalah', '2028-09-23')!;
      const tzeit = zmanimFor(at(JERUSALEM, '2028-09-23T12:00'), JERUSALEM).tzeitHakochavim;
      expect(end.start.getTime()).toBe(tzeit.getTime() + HOLY_BLOCK_EXIT_MIN * 60_000);
      expect(end.start).toEqual(HebcalService.holyBlockOn(at(JERUSALEM, '2028-09-23T12:00'), JERUSALEM)!.end);
      // Shabbat into Rosh Hashana: separated in kiddush, so the cup waits for Sunday night.
      expect(windowOn('havdalah', '2027-10-02')).toBeNull();
      expect(windowOn('havdalah', '2027-10-03')).not.toBeNull();
      // A Yom Tov that ends on a weekday, and Yom Kippur on a Monday.
      expect(windowOn('havdalah', '2027-04-28')).not.toBeNull(); // Pesach VII in Israel, a Wednesday
      expect(windowOn('havdalah', '2027-10-11')).not.toBeNull();
      // A plain weekday and chol hamoed have none.
      expect(windowOn('havdalah', '2027-10-18')).toBeNull();
    });

    it('follows the second day of Yom Tov abroad', () => {
      // Pesach 5787 abroad: Thursday, Friday and Shabbat are one block.
      expect(windowOn('candle_lighting', '2027-04-21', NEW_YORK, DIASPORA)).not.toBeNull();
      expect(windowOn('candle_lighting', '2027-04-22', NEW_YORK, DIASPORA)).toBeNull();
      expect(windowOn('candle_lighting', '2027-04-23', NEW_YORK, DIASPORA)).toBeNull();
      expect(windowOn('havdalah', '2027-04-22', NEW_YORK, DIASPORA)).toBeNull();
      expect(windowOn('havdalah', '2027-04-24', NEW_YORK, DIASPORA)).not.toBeNull();
      // The same Pesach I in Israel is a one-day block of its own.
      expect(windowOn('havdalah', '2027-04-22')).not.toBeNull();
    });

    it('splits havdalah around a Tisha B’Av deferred from Shabbat', () => {
      // 9 Av 5789 is Shabbat: the flame on Saturday night, the cup at the end of the fast on Sunday,
      // which ends at tzeit itself: the exit margin belongs to Shabbat and Yom Tov only.
      expect(windowOn('havdalah', '2029-07-21')).not.toBeNull();
      const sunday = windowOn('havdalah', '2029-07-22')!;
      expect(sunday.start).toEqual(zmanimFor(at(JERUSALEM, '2029-07-22T12:00'), JERUSALEM).tzeitHakochavim);
      expect(windowOn('havdalah', '2029-07-23')).toBeNull();
    });

    it('maariv and the Omer open at the exit on the night a block ends, at tzeit on other nights', () => {
      // Shabbat 2026-04-25 is Omer night 24 at its exit; Sunday 2026-04-26 is an ordinary night.
      const block = HebcalService.holyBlockOn(at(JERUSALEM, '2026-04-25T12:00'), JERUSALEM)!;
      const saturdayTzeit = zmanimFor(at(JERUSALEM, '2026-04-25T12:00'), JERUSALEM).tzeitHakochavim;
      expect(block.end.getTime()).toBe(saturdayTzeit.getTime() + HOLY_BLOCK_EXIT_MIN * 60_000);
      for (const id of ['maariv', 'sefirat_haomer']) {
        expect(windowOn(id, '2026-04-25')!.start).toEqual(block.end);
        expect(windowOn(id, '2026-04-26')!.start).toEqual(
          zmanimFor(at(JERUSALEM, '2026-04-26T12:00'), JERUSALEM).tzeitHakochavim,
        );
      }
      // Inside a block (Rosh Hashana I into day II) the night still opens at tzeit; the quiet block
      // swallows the reminder and the check-in collects it.
      expect(windowOn('maariv', '2028-09-21')!.start).toEqual(
        zmanimFor(at(JERUSALEM, '2028-09-21T12:00'), JERUSALEM).tzeitHakochavim,
      );
    });

    it('waits for the fast to end when Tisha B’Av itself falls on Sunday', () => {
      // 9 Av 5805 is a Sunday: the fast begins on motzaei Shabbat, so the cup waits for Sunday night.
      expect(windowOn('havdalah', '2045-07-22')).not.toBeNull();
      expect(windowOn('havdalah', '2045-07-23')).not.toBeNull();
      expect(windowOn('havdalah', '2045-07-24')).toBeNull();
    });

    it('never tells the user Shabbat ended on a weekday night', () => {
      const havdalah = findMitzvah('havdalah')!;
      const said = havdalah.defaultReminders.flatMap((reminder) => [reminder.label, ...(reminder.bodyVariants ?? [])]);
      // Havdalah also closes Yom Tov, Yom Kippur and the Sunday fast of Tisha B'Av.
      for (const line of said) expect(line).not.toMatch(/שבת/);
    });
  });
});
