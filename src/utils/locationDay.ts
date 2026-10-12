import { DateTime } from 'luxon';
import { Location } from '@/types/zmanim';
import { HebcalService } from '@/services/HebcalService';
import { dateKey } from '@/stores/useCompletionsStore';

// A calendar day the app shows or keys (device-local, as dateKey reads it) is the SAME date at the
// location. Its device-local midnight is not: east of the location it falls on the previous day
// there, so ZmanimService would resolve that day's zmanim. Midday at the location is unambiguous.
export function locationNoon(day: Date, location: Location): Date {
  return DateTime.fromObject(
    { year: day.getFullYear(), month: day.getMonth() + 1, day: day.getDate(), hour: 12 },
    { zone: location.tz },
  ).toJSDate();
}

// The app's day at `instant` (the user's call, 2026-10-12: the night belongs to the evening before):
// the location's calendar date, except that from local midnight until alot it is still the previous
// date, as the device-local midnight of that date, so dateKey() of it is the key its windows file under.
export function appDay(instant: Date, location: Location): Date {
  return HebcalService.hebrewNightAt(instant, location).prev().greg();
}

export function appDayKey(instant: Date, location: Location): string {
  return dateKey(appDay(instant, location));
}

// The instant app day `day` (a device-local midnight) ends: dawn of the next location date.
export function appDayEnd(day: Date, location: Location): Date {
  const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return HebcalService.dawnAt(locationNoon(next, location), location);
}
