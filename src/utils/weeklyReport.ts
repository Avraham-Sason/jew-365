import { hilulotOn } from '@/data/hilulot';
import { CalendarLocale, HebcalService } from '@/services/HebcalService';
import { translate } from '@/i18n';
import { dateKey } from '@/stores/useCompletionsStore';
import type { HolyBlock, Location } from '@/types/zmanim';
import { calendarDay, checkInFor } from '@/utils/checkIn';
import { HistoryInput, addDays, computeStreak, judgeDay } from '@/utils/historyStats';
import { locationNoon } from '@/utils/locationDay';
import { civilHebrewDayAt } from '@/utils/taharah/onot';

const WEEK_DAYS = 7;
const SATURDAY = 6;

export type WeekDay = { key: string; done: number; missed: number; pending: number };

export type MitzvahWeek = { id: string; done: number; missed: number; pending: number };

export type WeekSummary = {
  weekEnd: string;
  days: WeekDay[];
  done: number;
  missed: number;
  pending: number;
  checkInPending: number;
  perMitzvah: MitzvahWeek[];
  bestDay: string | null;
  streak: number;
  improve: { id: string; missed: number } | null;
};

export type WeekEvent = { key: string; labels: string[] };

export const calendarLocale = (locale: 'he' | 'en'): CalendarLocale => (locale === 'he' ? 'he-x-NoNikud' : 'en');

export function weekEndFor(block: HolyBlock): Date | null {
  if (!block.days.some((key) => calendarDay(key).getDay() === SATURDAY)) return null;
  return calendarDay(block.days[block.days.length - 1]);
}

export function shabbatOf(weekEnd: Date): Date {
  return addDays(weekEnd, -((weekEnd.getDay() + 1) % WEEK_DAYS));
}

export function weekEndOnOrBefore(day: Date, location: Location, now: Date): Date | null {
  for (let back = 0; back <= WEEK_DAYS; back++) {
    const block = HebcalService.holyBlockOn(locationNoon(addDays(day, -back), location), location);
    const weekEnd = block ? weekEndFor(block) : null;
    if (block && weekEnd && block.end.getTime() <= now.getTime()) return weekEnd;
  }
  return null;
}

export function reportWeekEnd(requested: Date | null, location: Location, now: Date): Date | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const anchor = requested && requested.getTime() < today.getTime() ? requested : today;
  return weekEndOnOrBefore(anchor, location, now) ?? weekEndOnOrBefore(today, location, now);
}

export function previousWeekEnd(weekEnd: Date, location: Location, now: Date): Date | null {
  return weekEndOnOrBefore(addDays(weekEnd, -WEEK_DAYS), location, now);
}

export function nextWeekEnd(weekEnd: Date, location: Location, now: Date): Date | null {
  const next = weekEndOnOrBefore(addDays(weekEnd, WEEK_DAYS), location, now);
  return next && next.getTime() > weekEnd.getTime() ? next : null;
}

export function weekStartFor(weekEnd: Date, location: Location, now: Date): Date {
  const previous = previousWeekEnd(weekEnd, location, now);
  return previous ? addDays(previous, 1) : addDays(weekEnd, -(WEEK_DAYS - 1));
}

function upcomingWeekEnd(weekEnd: Date, location: Location): Date {
  const saturday = addDays(shabbatOf(weekEnd), WEEK_DAYS);
  const block = HebcalService.holyBlockOn(locationNoon(saturday, location), location);
  return (block && weekEndFor(block)) ?? addDays(weekEnd, WEEK_DAYS);
}

function daysBetween(first: Date, last: Date): Date[] {
  const days: Date[] = [];
  for (let day = first; day.getTime() <= last.getTime(); day = addDays(day, 1)) days.push(day);
  return days;
}

function byMissedThenId(a: MitzvahWeek, b: MitzvahWeek): number {
  if (a.missed !== b.missed) return b.missed - a.missed;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function waitingInCheckIn(input: HistoryInput, weekEnd: Date, now: Date): number {
  const { location } = input;
  const block = HebcalService.holyBlockOn(locationNoon(shabbatOf(weekEnd), location), location);
  const checkIn = block ? checkInFor(block, { ...input, checkIns: input.checkIns ?? {} }, now) : null;
  if (!checkIn?.open) return 0;
  return checkIn.days.reduce((sum, { items }) => sum + items.filter((item) => !item.done).length, 0);
}

export function weekSummary(input: HistoryInput, weekStart: Date, weekEnd: Date, now: Date): WeekSummary {
  const verdicts = daysBetween(weekStart, weekEnd).map((day) => judgeDay(day, input, now));
  const days = verdicts.map(({ key, done, missed, pending }): WeekDay => ({
    key,
    done: done.length,
    missed: missed.length,
    pending: pending.length,
  }));
  const mitzvot = new Map<string, MitzvahWeek>();
  const entryOf = (id: string) => {
    const entry = mitzvot.get(id) ?? { id, done: 0, missed: 0, pending: 0 };
    mitzvot.set(id, entry);
    return entry;
  };
  for (const verdict of verdicts) {
    for (const id of verdict.done) entryOf(id).done += 1;
    for (const id of verdict.missed) entryOf(id).missed += 1;
    for (const id of verdict.pending) entryOf(id).pending += 1;
  }
  const perMitzvah = [...mitzvot.values()].sort(byMissedThenId);
  const best = days.reduce((top, day) => (day.done > top.done ? day : top), days[0]);
  const worst = perMitzvah[0];
  return {
    weekEnd: dateKey(weekEnd),
    days,
    done: days.reduce((sum, day) => sum + day.done, 0),
    missed: days.reduce((sum, day) => sum + day.missed, 0),
    pending: days.reduce((sum, day) => sum + day.pending, 0),
    checkInPending: waitingInCheckIn(input, weekEnd, now),
    perMitzvah,
    bestDay: best.done > 0 ? best.key : null,
    streak: computeStreak(input, now),
    improve: worst && worst.missed > 0 ? { id: worst.id, missed: worst.missed } : null,
  };
}

export function upcomingWeek(
  weekEnd: Date,
  location: Location,
  locale: 'he' | 'en',
  hilulot: { inIsrael: boolean; enabled: boolean },
): WeekEvent[] {
  return daysBetween(addDays(weekEnd, 1), upcomingWeekEnd(weekEnd, location))
    .map((day) => {
      const labels = HebcalService.getHolidays(day, location, calendarLocale(locale), { cholHamoed: true, erev: true });
      if (hilulot.enabled) {
        const hebrewDay = civilHebrewDayAt(locationNoon(day, location), location);
        const names = hilulotOn(hebrewDay, hilulot.inIsrael).map((hilula) => hilula.name[locale]);
        if (names.length) labels.push(translate('report.hilula', { names: names.join(', ') }, locale));
      }
      return { key: dateKey(day), labels };
    })
    .filter((event) => event.labels.length > 0);
}
