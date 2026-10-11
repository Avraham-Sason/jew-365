import { HDate, Locale, getSedra, months } from '@hebcal/core';
import { CHOK_TEXT_ID } from '@/data/chok';
import { HebcalService } from '@/services/HebcalService';
import { ZmanimService } from '@/services/ZmanimService';
import { dateKey } from '@/stores/useCompletionsStore';
import { ChokAsset, ChokDoubleChoice, ChokSection, ChokSectionKind, ChokSlot, HaftarahVariant } from '@/types/chok';
import { Nusach } from '@/types/mitzvah';
import { SiddurSection, SiddurText } from '@/types/siddur';
import { Location } from '@/types/zmanim';
import { locationNoon } from '@/utils/locationDay';
import { quietBlockAt } from '@/utils/skipRules';
import { civilHebrewDayAt, dayNoon, hebrewDay } from '@/utils/taharah/onot';

export type { ChokSlot };

export type ChokPortion = { parashiyot: string[]; slot: ChokSlot; shabbat: HDate };

export type ChokMakeUp = { dateKey: string; slot: ChokSlot; holy: boolean };

export type ChokReaderRequest = { now: Date; date?: Date | null; slot?: ChokSlot | null };

export type ChokTextOptions = {
  slot: ChokSlot;
  choice: ChokDoubleChoice;
  variant: HaftarahVariant;
  kindNames: Readonly<Record<ChokSectionKind, string>>;
};

export const CHOK_SLOTS: readonly ChokSlot[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'thuNight', 'fri'];

export const CHOK_SECTION_KINDS: readonly ChokSectionKind[] = [
  'torah',
  'neviim',
  'ketuvim',
  'mishnah',
  'gemara',
  'zohar',
  'halacha',
  'mussar',
  'haftarah',
];

export const VEZOT_HABERACHA = 'Vezot Haberakhah';

export const HAFTARAH_VARIANT: Readonly<Record<Nusach, HaftarahVariant>> = {
  ashkenaz: 'ashkenazi',
  sefard: 'ashkenazi',
  edot_hamizrach: 'sephardi',
  chabad: 'ashkenazi',
};

const VEZOT_SLOTS: readonly ChokSlot[] = CHOK_SLOTS.filter((slot) => slot !== 'fri');
const SLOT_OF_WEEKDAY: readonly (ChokSlot | null)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', null];
const SLOT_POSITION: Readonly<Record<ChokSlot, number>> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  thuNight: 4.5,
  fri: 5,
};
const THURSDAY = 4;
const SATURDAY = 6;
const WEEK_DAYS = 7;
const LAST_DAY_OF_ROSH_HASHANA = 2;
const SIMCHAT_TORAH_IN_ISRAEL = 22;
const SIMCHAT_TORAH_ABROAD = 23;
const MAX_FESTIVAL_WEEKS = 4;

// The festival-week rule follows hebcal's findParshaHaShavua() (@hebcal/leyning).
export function chokParashiyot(shabbat: HDate, inIsrael: boolean): string[] {
  const reading = getSedra(shabbat.getFullYear(), inIsrael).lookup(shabbat);
  if (!reading.chag) return reading.parsha;
  const date = shabbat.getDate();
  const simchatTorah = inIsrael ? SIMCHAT_TORAH_IN_ISRAEL : SIMCHAT_TORAH_ABROAD;
  if (shabbat.getMonth() === months.TISHREI && date > LAST_DAY_OF_ROSH_HASHANA && date <= simchatTorah) {
    return [VEZOT_HABERACHA];
  }
  for (let week = 1; week <= MAX_FESTIVAL_WEEKS; week++) {
    const next = new HDate(shabbat.abs() + week * WEEK_DAYS);
    const later = getSedra(next.getFullYear(), inIsrael).lookup(next);
    if (!later.chag) return later.parsha;
  }
  throw new Error(`no parasha after ${shabbat.toString()} (${inIsrael ? 'il' : 'abroad'})`);
}

export function chokSlotsOf(parasha: string): readonly ChokSlot[] {
  return parasha === VEZOT_HABERACHA ? VEZOT_SLOTS : CHOK_SLOTS;
}

function isHoly(day: HDate, location: Location): boolean {
  return HebcalService.isHolyDay(dayNoon(day.abs(), location), location);
}

function portionOf(day: HDate, slot: ChokSlot | null, inIsrael: boolean): ChokPortion | null {
  if (!slot) return null;
  const shabbat = day.onOrAfter(SATURDAY);
  const parashiyot = chokParashiyot(shabbat, inIsrael);
  return chokSlotsOf(parashiyot[0]).includes(slot) ? { parashiyot, slot, shabbat } : null;
}

function afterNightfall(instant: Date, day: HDate, location: Location): boolean {
  const zmanim = ZmanimService.getZmanim(dayNoon(day.abs(), location), location);
  if (!zmanim) return civilHebrewDayAt(instant, location).abs() > day.abs();
  return instant.getTime() >= HebcalService.nightfall(zmanim, location).getTime();
}

export function chokPortionAt(instant: Date, location: Location, inIsrael: boolean): ChokPortion | null {
  if (quietBlockAt(instant, location)) return null;
  const night = HebcalService.hebrewNightAt(instant, location);
  const today = night.prev();
  if (today.getDay() === THURSDAY && afterNightfall(instant, today, location)) {
    return portionOf(today, 'thuNight', inIsrael);
  }
  const day = isHoly(today, location) ? night : today;
  return isHoly(day, location) ? null : portionOf(day, SLOT_OF_WEEKDAY[day.getDay()], inIsrael);
}

export function chokPortionOn(day: Date, location: Location, inIsrael: boolean): ChokPortion | null {
  const hd = civilHebrewDayAt(locationNoon(day, location), location);
  return isHoly(hd, location) ? null : portionOf(hd, SLOT_OF_WEEKDAY[hd.getDay()], inIsrael);
}

export function chokMakeUpsBefore(day: Date, location: Location, inIsrael: boolean): ChokMakeUp[] {
  const today = civilHebrewDayAt(locationNoon(day, location), location);
  const slots = chokSlotsOf(chokParashiyot(today.onOrAfter(SATURDAY), inIsrael)[0]);
  const makeUps: ChokMakeUp[] = [];
  for (let back = today.getDay(); back > 0; back--) {
    const earlier = hebrewDay(today.abs() - back);
    const slot = SLOT_OF_WEEKDAY[earlier.getDay()];
    if (slot && slots.includes(slot)) {
      makeUps.push({ dateKey: dateKey(earlier.greg()), slot, holy: isHoly(earlier, location) });
    }
  }
  return makeUps;
}

function latestPortionBefore(day: HDate, inIsrael: boolean): ChokPortion {
  const shabbat = day.onOrAfter(SATURDAY);
  const parashiyot = chokParashiyot(shabbat, inIsrael);
  const earlier = chokSlotsOf(parashiyot[0]).filter((slot) => SLOT_POSITION[slot] < day.getDay());
  return { parashiyot, slot: earlier[earlier.length - 1] ?? 'sun', shabbat };
}

export function chokReaderPortion(request: ChokReaderRequest, location: Location, inIsrael: boolean): ChokPortion {
  const { now, date, slot } = request;
  const found = date ? chokPortionOn(date, location, inIsrael) : chokPortionAt(now, location, inIsrael);
  const day = date
    ? civilHebrewDayAt(locationNoon(date, location), location)
    : HebcalService.hebrewNightAt(now, location).prev();
  const portion = found ?? latestPortionBefore(day, inIsrael);
  return slot && chokSlotsOf(portion.parashiyot[0]).includes(slot) ? { ...portion, slot } : portion;
}

export function chokParashaName(parasha: string, language: 'he' | 'en'): string {
  return language === 'en' ? parasha : Locale.gettext(parasha, 'he-x-NoNikud');
}

export function chokWeekName(parashiyot: readonly string[], language: 'he' | 'en'): string {
  return parashiyot.map((parasha) => chokParashaName(parasha, language)).join(language === 'en' ? '-' : '־');
}

export function chokSlotSections(asset: ChokAsset, slot: ChokSlot, variant: HaftarahVariant): ChokSection[] {
  return (asset.slots[slot] ?? []).filter((section) => !section.variant || section.variant === variant);
}

export function chokText(assets: readonly ChokAsset[], options: ChokTextOptions): SiddurText {
  const { slot, choice, variant, kindNames } = options;
  const chosen = assets.length < 2 || choice === 'both' ? assets : [assets[choice === 'first' ? 0 : 1]];
  const prefixed = chosen.length > 1;
  const sections = chosen.flatMap((asset) => {
    const he = chokParashaName(asset.parasha, 'he');
    return chokSlotSections(asset, slot, variant).map((section, index): SiddurSection => ({
      title: prefixed
        ? { he: `${he} · ${section.heading}`, en: `${asset.parasha} · ${kindNames[section.kind]}` }
        : { he: section.heading, en: kindNames[section.kind] },
      ...(prefixed && index === 0 ? { chapter: { he, en: asset.parasha } } : {}),
      segments: section.segments,
    }));
  });
  const credits = [...new Map(chosen.map((asset) => [asset.credit.title, asset.credit])).values()];
  const dedication = chosen.find((asset) => asset.dedication)?.dedication;
  return { id: CHOK_TEXT_ID, sections, credits, ...(dedication ? { dedication } : {}) };
}
