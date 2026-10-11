import { HDate, HebrewCalendar, Location as HebcalLocation, flags } from '@hebcal/core';
import { DateTime } from 'luxon';
import { CalendarInfo, HebrewDate, HolyBlock, HolyBlockKind, Location, Zmanim } from '@/types/zmanim';
import { ZmanimService, candleLightingMinutes, holyBlockExit } from '@/services/ZmanimService';

export type CalendarLocale = 'he' | 'en' | 'he-x-NoNikud';

export type HolidayExtras = { cholHamoed?: boolean; erev?: boolean };

const HOLIDAY_FLAGS =
  flags.CHAG | flags.MAJOR_FAST | flags.MINOR_FAST | flags.ROSH_CHODESH | flags.MINOR_HOLIDAY | flags.MODERN_HOLIDAY;

function toHDate(date: Date): HDate {
  return new HDate(date);
}

// The civil day at the LOCATION, matching the zmanim ZmanimService resolves for it. HDate reads a
// Date through device-local getters, so it gets a local Date carrying the location's calendar date.
function civilDayAt(instant: Date, loc: Location): HDate {
  const { year, month, day } = DateTime.fromJSDate(instant).setZone(loc.tz);
  return toHDate(new Date(year, month - 1, day, 12));
}

function buildLocation(loc: Location): HebcalLocation {
  return new HebcalLocation(loc.lat, loc.lng, loc.inIsrael, loc.tz, loc.name, 'XX');
}

// A Hebrew day runs nightfall to nightfall, so an instant after sunset already belongs to the next
// Hebrew date. Between shkia and tzeit (bein hashmashot) the day is doubtful, so both candidates
// are returned and an observance counts if EITHER carries it — the stringency the original
// isShabbat encoded by hand (enter at shkia, leave at tzeit), now shared with isYomTov.
function hebrewDaysAt(instant: Date, loc?: Location): HDate[] {
  if (!loc) return [toHDate(instant)];
  const civilDay = civilDayAt(instant, loc);
  const zmanim = ZmanimService.getZmanim(instant, loc);
  if (!zmanim) return [civilDay];
  const afterShkia = instant.getTime() >= zmanim.shkia.getTime();
  const afterTzeit = instant.getTime() >= zmanim.tzeitHakochavim.getTime();
  if (afterShkia === afterTzeit) return [afterShkia ? civilDay.next() : civilDay];
  return [civilDay, civilDay.next()];
}

type DayKind = { yomTov: boolean; cholHamoed: boolean; yomKippur: boolean };

const DAY_KIND_CACHE_LIMIT = 800;
const dayKindCache = new Map<string, DayKind>();

// Every surface asks about the same few days over and over (each mitzvah window, each block edge),
// and a hebcal calendar run per question dominated the cost of a history or schedule render.
function dayKind(hd: HDate, loc: Location): DayKind {
  const key = `${hd.abs()}|${loc.inIsrael ? 'il' : 'chul'}`;
  const cached = dayKindCache.get(key);
  if (cached) return cached;
  const greg = hd.greg();
  const events = HebrewCalendar.calendar({ start: greg, end: greg, il: loc.inIsrael });
  const has = (mask: number) => events.some((e) => Boolean(e.getFlags() & mask));
  const yomTov = events.some((e) => Boolean(e.getFlags() & flags.CHAG) && !(e.getFlags() & flags.CHOL_HAMOED));
  const kind = { yomTov, cholHamoed: has(flags.CHOL_HAMOED), yomKippur: yomTov && has(flags.MAJOR_FAST) };
  if (dayKindCache.size >= DAY_KIND_CACHE_LIMIT) {
    const oldest = dayKindCache.keys().next().value;
    if (oldest) dayKindCache.delete(oldest);
  }
  dayKindCache.set(key, kind);
  return kind;
}

function isYomTovOnHebrewDay(hd: HDate, loc: Location): boolean {
  return dayKind(hd, loc).yomTov;
}

function isHolyHebrewDay(hd: HDate, loc: Location): boolean {
  return hd.getDay() === 6 || isYomTovOnHebrewDay(hd, loc);
}

function atLocation(hd: HDate, loc: Location, hour: number): Date {
  const greg = hd.greg();
  return DateTime.fromObject(
    { year: greg.getFullYear(), month: greg.getMonth() + 1, day: greg.getDate(), hour },
    { zone: loc.tz },
  ).toJSDate();
}

function isoDate(hd: HDate): string {
  const greg = hd.greg();
  return `${greg.getFullYear()}-${String(greg.getMonth() + 1).padStart(2, '0')}-${String(greg.getDate()).padStart(2, '0')}`;
}

function blockKind(days: HDate[], loc: Location): HolyBlockKind {
  const kinds = days.map((hd) => dayKind(hd, loc));
  if (kinds.some((kind) => kind.yomKippur)) return 'yomKippur';
  const yomTov = kinds.some((kind) => kind.yomTov);
  if (!yomTov) return 'shabbat';
  return days.some((hd) => hd.getDay() === 6) ? 'shabbatYomTov' : 'yomTov';
}

// Shabbat and Yom Tov that touch merge into one block: Yom Tov on Friday flows into Shabbat, two
// days of Rosh Hashana into a third that is Shabbat. The block opens at candle lighting on the
// erev and closes at the exit of its last day, `holyBlockExit()` after its tzeit. Where the sun
// never sets the civil day stands in.
function holyBlockAround(hd: HDate, loc: Location): HolyBlock | null {
  if (!isHolyHebrewDay(hd, loc)) return null;
  let first = hd;
  while (isHolyHebrewDay(first.prev(), loc)) first = first.prev();
  let last = hd;
  while (isHolyHebrewDay(last.next(), loc)) last = last.next();
  const days: HDate[] = [];
  for (let day = first; day.abs() <= last.abs(); day = day.next()) days.push(day);
  const erev = ZmanimService.getZmanim(atLocation(first.prev(), loc, 12), loc);
  const closing = ZmanimService.getZmanim(atLocation(last, loc, 12), loc);
  return {
    start: erev
      ? new Date(erev.shkia.getTime() - candleLightingMinutes(loc) * 60_000)
      : atLocation(first.prev(), loc, 12),
    end: closing ? holyBlockExit(closing) : atLocation(last.next(), loc, 0),
    days: days.map(isoDate),
    kind: blockKind(days, loc),
  };
}

function renderHebrewDate(hd: HDate): HebrewDate {
  return {
    year: hd.getFullYear(),
    month: hd.getMonth(),
    day: hd.getDate(),
    hebrewYearStr: hd.renderGematriya().split(' ').slice(-1)[0] ?? '',
    hebrewDateStr: hd.renderGematriya(),
  };
}

export const HebcalService = {
  // The Hebrew date whose DAYTIME falls on this civil day. Right for calendar grids, where each
  // cell is a civil day.
  getHebrewDate(date: Date): HebrewDate {
    return renderHebrewDate(toHDate(date));
  },

  // The Hebrew date in effect AT this instant — it advances at shkia. Use this for "today", or the
  // header shows yesterday's date all evening.
  getHebrewDateAt(instant: Date, loc?: Location): HebrewDate {
    const days = hebrewDaysAt(instant, loc);
    return renderHebrewDate(days[days.length - 1]);
  },

  // The same day as an HDate, for a text that resolves "now": after shkia it is already the next
  // Hebrew day, bein hashmashot included.
  hebrewDayAt(instant: Date, loc?: Location): HDate {
    const days = hebrewDaysAt(instant, loc);
    return days[days.length - 1];
  },

  // The Hebrew day whose night is in effect or comes next, for a text said at night: before dawn
  // it is the night still running, from dawn on it is tonight, which opens the next Hebrew day.
  hebrewNightAt(instant: Date, loc: Location): HDate {
    const civil = civilDayAt(instant, loc);
    const dawn = ZmanimService.getZmanim(instant, loc)?.alotHaShachar;
    const beforeDawn = dawn
      ? instant.getTime() < dawn.getTime()
      : DateTime.fromJSDate(instant).setZone(loc.tz).hour < 4;
    return beforeDawn ? civil : civil.next();
  },

  getParasha(date: Date, loc: Location, locale: CalendarLocale = 'he'): string | undefined {
    const events = HebrewCalendar.calendar({
      start: date,
      end: date,
      location: buildLocation(loc),
      sedrot: true,
      il: loc.inIsrael,
    });
    const parasha = events.find((e) => e.getFlags() & flags.PARSHA_HASHAVUA);
    return parasha?.render(locale);
  },

  getHolidays(date: Date, loc: Location, locale: CalendarLocale = 'he', extras: HolidayExtras = {}): string[] {
    const events = HebrewCalendar.calendar({
      start: date,
      end: date,
      location: buildLocation(loc),
      il: loc.inIsrael,
    });
    const mask = HOLIDAY_FLAGS | (extras.cholHamoed ? flags.CHOL_HAMOED : 0) | (extras.erev ? flags.EREV : 0);
    return events.filter((e) => e.getFlags() & mask).map((e) => e.render(locale));
  },

  isShabbat(date: Date, loc?: Location): boolean {
    return hebrewDaysAt(date, loc).some((hd) => hd.getDay() === 6);
  },

  isYomTov(date: Date, loc: Location): boolean {
    return hebrewDaysAt(date, loc).some((hd) => isYomTovOnHebrewDay(hd, loc));
  },

  isCholHamoed(date: Date, loc: Location): boolean {
    return hebrewDaysAt(date, loc).some((hd) => dayKind(hd, loc).cholHamoed);
  },

  // Day-granular: the location's calendar date of `date`, judged by its daytime. The clock time
  // `date` carries never moves the answer.
  isHolyDay(date: Date, loc: Location): boolean {
    return isHolyHebrewDay(civilDayAt(date, loc), loc);
  },

  // When the night after the day these zmanim belong to opens: its tzeit, or the block's exit on
  // the last day of a Shabbat / Yom Tov block, so nothing that starts at nightfall (maariv, the
  // Omer, havdalah, a tevila) lands inside the quiet block its own reminder could not fire in.
  nightfall(zmanim: Zmanim, loc: Location): Date {
    const day = civilDayAt(zmanim.chatzot, loc);
    const closesBlock = isHolyHebrewDay(day, loc) && !isHolyHebrewDay(day.next(), loc);
    return closesBlock ? holyBlockExit(zmanim) : zmanim.tzeitHakochavim;
  },

  // The block whose daytime covers the location's calendar date of `date`.
  holyBlockOn(date: Date, loc: Location): HolyBlock | null {
    return holyBlockAround(civilDayAt(date, loc), loc);
  },

  // The block whose span [candle lighting, exit] contains `instant`, edges included. The days
  // either side of the instant's civil day are candidates too: after candle lighting the block
  // belongs to tomorrow, and far north the exit can fall after midnight.
  holyBlockAt(instant: Date, loc: Location): HolyBlock | null {
    const civilDay = civilDayAt(instant, loc);
    for (const hd of [civilDay.prev(), civilDay, civilDay.next()]) {
      const block = holyBlockAround(hd, loc);
      if (block && instant.getTime() >= block.start.getTime() && instant.getTime() <= block.end.getTime()) {
        return block;
      }
    }
    return null;
  },

  getDafYomi(date: Date): string | undefined {
    const events = HebrewCalendar.calendar({
      start: date,
      end: date,
      dailyLearning: { dafYomi: true },
    });
    const daf = events.find((e) => e.getFlags() & flags.DAF_YOMI);
    return daf?.render('he');
  },

  getOmerDay(date: Date): number | undefined {
    const events = HebrewCalendar.calendar({
      start: date,
      end: date,
      omer: true,
    });
    const omer = events.find((e) => e.getFlags() & flags.OMER_COUNT);
    if (!omer) return undefined;
    const day = (omer as unknown as { omer?: number }).omer;
    return typeof day === 'number' ? day : undefined;
  },

  getCalendarInfo(date: Date, loc: Location): CalendarInfo {
    return {
      hebrew: this.getHebrewDateAt(date, loc),
      parasha: this.getParasha(date, loc),
      holidays: this.getHolidays(date, loc),
      isShabbat: this.isShabbat(date, loc),
      isYomTov: this.isYomTov(date, loc),
      omerDay: this.getOmerDay(date),
      dafYomi: this.getDafYomi(date),
    };
  },
};
