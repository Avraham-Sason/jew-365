import { ComplexZmanimCalendar, GeoLocation } from 'kosher-zmanim';
import { DateTime } from 'luxon';
import { Location, Zmanim } from '@/types/zmanim';

// Jerusalem's near-universal minhag is 40 minutes, and it is the app's default city — 18 minutes
// there is simply the wrong time.
const JERUSALEM_CANDLE_MINUTES = 40;

export function isJerusalem(location: Location): boolean {
  return location.cityId === 'jerusalem';
}

export function candleLightingMinutes(location: Location): number {
  if (location.candleLightingMinutes) return location.candleLightingMinutes;
  if (location.inIsrael) return isJerusalem(location) ? JERUSALEM_CANDLE_MINUTES : 18;
  return 20;
}

// Shabbat and Yom Tov end a margin after tzeit (the user's call, 2026-10-10): the block, havdalah,
// the exit time every surface shows and the night windows that open at the exit all read it here.
export const HOLY_BLOCK_EXIT_MIN = 10;

export function holyBlockExit(zmanim: Pick<Zmanim, 'tzeitHakochavim'>): Date {
  return new Date(zmanim.tzeitHakochavim.getTime() + HOLY_BLOCK_EXIT_MIN * 60_000);
}

const ZMANIM_CACHE_LIMIT = 90;
const ALOT_FALLBACK_MIN = 72;
const MISHEYAKIR_FALLBACK_MIN = 52;
const TZEIT_FALLBACK_MIN = 30;
const MGA_OFFSET_MIN = 72;
const zmanimCache = new Map<string, Zmanim>();

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const candidate =
    value instanceof Date
      ? value
      : ((value as { toDate?: () => Date }).toDate?.() ??
        (value as { toJSDate?: () => Date }).toJSDate?.() ??
        new Date(String(value)));
  return candidate instanceof Date && !Number.isNaN(candidate.getTime()) ? candidate : null;
}

function shift(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

// kosher-zmanim 0.9.0 reads the raw offset of any zone that keeps DST with the wrong sign, so its
// antimeridian check takes Sydney or New Zealand for a zone 20 hours ahead of local mean time and
// computes every zman for the next day. The same check, from the zone's true standard offset:
export function antimeridianAdjustment(loc: Location): -1 | 0 | 1 {
  const january = DateTime.fromObject({ month: 1, day: 1 }, { zone: loc.tz }).offset;
  const july = DateTime.fromObject({ month: 7, day: 1 }, { zone: loc.tz }).offset;
  const localHours = loc.lng / 15 - Math.min(january, july) / 60;
  if (localHours >= 20) return 1;
  return localHours <= -20 ? -1 : 0;
}

function buildCalendar(date: Date, loc: Location): ComplexZmanimCalendar {
  const geo = new GeoLocation(loc.name, loc.lat, loc.lng, loc.elevation ?? 0, loc.tz);
  const adjustment = antimeridianAdjustment(loc);
  geo.getAntimeridianAdjustment = () => adjustment;
  const cal = new ComplexZmanimCalendar(geo);
  // Resolve the calendar day in the LOCATION's zone. kosher-zmanim's setDate materialises a plain
  // Date in the system zone, so a traveller whose device zone differs from their selected city got
  // that city's zmanim for the device's day — every evening, off by one.
  cal.setDate(DateTime.fromJSDate(date).setZone(loc.tz));
  return cal;
}

function cacheKey(date: Date, loc: Location): string {
  return [DateTime.fromJSDate(date).setZone(loc.tz).toISODate(), loc.lat, loc.lng, loc.elevation ?? 0, loc.tz].join(
    '|',
  );
}

function cloneZmanim(zmanim: Zmanim): Zmanim {
  return {
    alotHaShachar: new Date(zmanim.alotHaShachar),
    misheyakir: new Date(zmanim.misheyakir),
    netzHaChama: new Date(zmanim.netzHaChama),
    sofZmanShmaGra: new Date(zmanim.sofZmanShmaGra),
    sofZmanShmaMA: new Date(zmanim.sofZmanShmaMA),
    sofZmanTfilaGra: new Date(zmanim.sofZmanTfilaGra),
    chatzot: new Date(zmanim.chatzot),
    chatzotLayla: new Date(zmanim.chatzotLayla),
    minchaGedola: new Date(zmanim.minchaGedola),
    minchaKetana: new Date(zmanim.minchaKetana),
    plagHaMincha: new Date(zmanim.plagHaMincha),
    shkia: new Date(zmanim.shkia),
    tzeitHakochavim: new Date(zmanim.tzeitHakochavim),
  };
}

function cacheZmanim(key: string, value: Zmanim): void {
  if (zmanimCache.size >= ZMANIM_CACHE_LIMIT) {
    const oldest = zmanimCache.keys().next().value;
    if (oldest) zmanimCache.delete(oldest);
  }
  zmanimCache.set(key, cloneZmanim(value));
}

export type CandleLightingOptions = {
  isFriday: boolean;
  isErevYomTov: boolean;
  minutesBefore?: number;
};

export const ZmanimService = {
  // Returns null only when the sun does not rise or set at all on this date (polar day/night).
  // Depression-angle zmanim (alot 16.1°, misheyakir 11.5°/11°) have no solution above ~50°N
  // around midsummer — London, Antwerp and Moscow all hit this — so each falls back to its
  // fixed-minutes shita rather than failing the whole day.
  getZmanim(date: Date, loc: Location): Zmanim | null {
    const key = cacheKey(date, loc);
    const cached = zmanimCache.get(key);
    if (cached) return cloneZmanim(cached);

    const cal = buildCalendar(date, loc);
    const sunrise = cal.getSeaLevelSunrise();
    const sunset = cal.getSeaLevelSunset();
    const netzHaChama = toDateOrNull(sunrise);
    const shkia = toDateOrNull(sunset);
    if (!netzHaChama || !shkia) return null;

    const proportionalHour = (shkia.getTime() - netzHaChama.getTime()) / 12;
    const fromNetz = (hours: number) => new Date(netzHaChama.getTime() + hours * proportionalHour);
    const mgaStart = shift(netzHaChama, -MGA_OFFSET_MIN);
    const mgaHour = (shift(shkia, MGA_OFFSET_MIN).getTime() - mgaStart.getTime()) / 12;

    const alotHaShachar =
      toDateOrNull(cal.getAlosHashachar()) ?? toDateOrNull(cal.getAlos72()) ?? shift(netzHaChama, -ALOT_FALLBACK_MIN);
    // Once alot falls back to fixed minutes, a still-solvable depression angle for misheyakir can
    // land before it. Misheyakir must sit between alot and sunrise, so fall back there too.
    const misheyakirCandidate =
      toDateOrNull(cal.getMisheyakir11Point5Degrees()) ?? toDateOrNull(cal.getMisheyakir11Degrees());
    const misheyakir =
      misheyakirCandidate &&
      misheyakirCandidate.getTime() >= alotHaShachar.getTime() &&
      misheyakirCandidate.getTime() < netzHaChama.getTime()
        ? misheyakirCandidate
        : shift(netzHaChama, -MISHEYAKIR_FALLBACK_MIN);

    const zmanim: Zmanim = {
      alotHaShachar,
      misheyakir,
      netzHaChama,
      sofZmanShmaGra: toDateOrNull(cal.getSofZmanShmaGRA()) ?? fromNetz(3),
      sofZmanShmaMA: toDateOrNull(cal.getSofZmanShmaMGA()) ?? new Date(mgaStart.getTime() + 3 * mgaHour),
      sofZmanTfilaGra: toDateOrNull(cal.getSofZmanTfilaGRA()) ?? fromNetz(4),
      chatzot: toDateOrNull(cal.getChatzos()) ?? fromNetz(6),
      // Chatzot halayla — the solar midnight of the night that FOLLOWS this day, so it belongs to
      // the next civil date. Never derive it by adding a calendar day to midday chatzot.
      chatzotLayla:
        toDateOrNull(cal.getSolarMidnight()) ??
        new Date((toDateOrNull(cal.getChatzos()) ?? fromNetz(6)).getTime() + 12 * 3_600_000),
      minchaGedola: toDateOrNull(cal.getMinchaGedola()) ?? fromNetz(6.5),
      minchaKetana: toDateOrNull(cal.getMinchaKetana(sunrise, sunset)) ?? fromNetz(9.5),
      plagHaMincha: toDateOrNull(cal.getPlagHamincha(sunrise, sunset)) ?? fromNetz(10.75),
      shkia,
      tzeitHakochavim: toDateOrNull(cal.getTzaisGeonim7Point083Degrees()) ?? shift(shkia, TZEIT_FALLBACK_MIN),
    };

    cacheZmanim(key, zmanim);
    return cloneZmanim(zmanim);
  },

  getCandleLighting(date: Date, loc: Location, opts: CandleLightingOptions): Date | null {
    const shkia = toDateOrNull(buildCalendar(date, loc).getSeaLevelSunset());
    if (!shkia) return null;
    return shift(shkia, -(opts.minutesBefore ?? candleLightingMinutes(loc)));
  },

  getHavdalah(date: Date, loc: Location): Date | null {
    const cal = buildCalendar(date, loc);
    const shkia = toDateOrNull(cal.getSeaLevelSunset());
    if (!shkia) return null;
    const tzeitHakochavim = toDateOrNull(cal.getTzaisGeonim7Point083Degrees()) ?? shift(shkia, TZEIT_FALLBACK_MIN);
    return holyBlockExit({ tzeitHakochavim });
  },
};
