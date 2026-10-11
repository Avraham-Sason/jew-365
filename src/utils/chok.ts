import { HDate, getSedra, months } from '@hebcal/core';
import { HebcalService } from '@/services/HebcalService';
import { ZmanimService } from '@/services/ZmanimService';
import { dateKey } from '@/stores/useCompletionsStore';
import { Location } from '@/types/zmanim';
import { locationNoon } from '@/utils/locationDay';
import { quietBlockAt } from '@/utils/skipRules';
import { civilHebrewDayAt, dayNoon, hebrewDay } from '@/utils/taharah/onot';

export type ChokSlot = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'thuNight' | 'fri';

export type ChokPortion = { parashiyot: string[]; slot: ChokSlot; shabbat: HDate };

export type ChokMakeUp = { dateKey: string; slot: ChokSlot; holy: boolean };

export const CHOK_SLOTS: readonly ChokSlot[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'thuNight', 'fri'];

export const VEZOT_HABERACHA = 'Vezot Haberakhah';

const VEZOT_SLOTS: readonly ChokSlot[] = CHOK_SLOTS.filter((slot) => slot !== 'fri');
const SLOT_OF_WEEKDAY: readonly (ChokSlot | null)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', null];
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
