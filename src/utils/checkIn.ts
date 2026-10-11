import { DateTime } from 'luxon';
import { Mitzvah, UserSettings } from '@/types/mitzvah';
import { HolyBlock, Location } from '@/types/zmanim';
import { HebcalService } from '@/services/HebcalService';
import { ZmanimService } from '@/services/ZmanimService';
import { isSkippedAt } from '@/utils/skipRules';
import { locationNoon } from '@/utils/locationDay';
import { CheckIns, Completions, dateKey } from '@/stores/useCompletionsStore';

export type CheckInItem = { mitzvah: Mitzvah; window: { start: Date; end: Date }; done: boolean };
export type CheckInDay = { date: Date; key: string; items: CheckInItem[] };
export type CheckIn = {
  id: string;
  block: HolyBlock;
  days: CheckInDay[];
  deadline: Date;
  finished: boolean;
  open: boolean;
};

export type CheckInInput = {
  mitzvot: Mitzvah[];
  completions: Completions;
  checkIns: CheckIns;
  location: Location;
  settings: UserSettings;
  // Skipped mitzvot are settled, not waiting.
  skipped?: Completions;
  // When each mitzvah was switched on; one switched on later is not asked about earlier days.
  enabledSince?: Record<string, number>;
};

export function wasEnabledBy(mitzvah: Mitzvah, until: Date, enabledSince: Record<string, number> = {}): boolean {
  const since = enabledSince[mitzvah.id];
  return since === undefined || since < until.getTime();
}

const RECENT_DAYS = 3;

// The block whose check-in the app last opened by itself, so it opens on its own only once.
export const CHECK_IN_PROMPTED_KEY = 'checkin:prompted';

// A calendar day as every day-level surface holds it: the device-local midnight of that date.
export function calendarDay(iso: string, days = 0): Date {
  const { year, month, day } = DateTime.fromISO(iso);
  return new Date(year, month - 1, day + days);
}

export function checkInId(block: HolyBlock): string {
  return block.days[0];
}

// Inside a block nothing can be marked, so a mitzvah whose window reaches into it waits for the
// check-in: the block's own days, and the erev's mincha or candle lighting that run past lighting.
export function overlapsBlock(window: { start: Date; end: Date }, block: HolyBlock): boolean {
  return window.end.getTime() > block.start.getTime() && window.start.getTime() < block.end.getTime();
}

// Midnight that ends the first weekday after the block, on the device's clock: a block that ends
// on motzaei Shabbat can still be marked all of Sunday.
export function checkInDeadline(block: HolyBlock): Date {
  return calendarDay(block.days[block.days.length - 1], 2);
}

// The calendar day whose midnight closes the check-in, for "until Sunday at midnight".
export function checkInLastDay(block: HolyBlock): Date {
  return calendarDay(block.days[block.days.length - 1], 1);
}

// Whether the block's check-in still accepts marks at `now`. Inside the block the app shows only
// the Shabbat screen, so this is only reachable from its end until the deadline.
export function checkInPending(block: HolyBlock, checkIns: CheckIns, now: Date): boolean {
  return !checkIns[checkInId(block)] && now.getTime() < checkInDeadline(block).getTime();
}

// i18n keys for "on Shabbat" / "on Yom Tov" — the check-in screen, banner and reminders.
export function checkInPhraseKey(block: HolyBlock): string {
  return `checkin.in.${block.kind}`;
}

export function checkInFor(block: HolyBlock, input: CheckInInput, now: Date): CheckIn | null {
  const { mitzvot, completions, checkIns, location, settings, skipped = {}, enabledSince } = input;
  const days: CheckInDay[] = [];
  for (let offset = -1; offset < block.days.length; offset++) {
    const date = calendarDay(block.days[0], offset);
    const zmanim = ZmanimService.getZmanim(locationNoon(date, location), location);
    if (!zmanim) continue;
    const key = dateKey(date);
    const items: CheckInItem[] = [];
    for (const mitzvah of mitzvot) {
      if (!wasEnabledBy(mitzvah, block.end, enabledSince) || skipped[key]?.[mitzvah.id]) continue;
      const window = mitzvah.computeWindow({ date, location, settings, zmanim });
      if (!window || !overlapsBlock(window, block)) continue;
      if (isSkippedAt(mitzvah, window.start, location, settings)) continue;
      items.push({ mitzvah, window, done: Boolean(completions[key]?.[mitzvah.id]) });
    }
    if (items.length) days.push({ date, key, items });
  }
  if (!days.length) return null;
  const finished = !checkInPending(block, checkIns, now) || days.every((day) => day.items.every((item) => item.done));
  return {
    id: checkInId(block),
    block,
    days,
    deadline: checkInDeadline(block),
    finished,
    open: !finished && now.getTime() >= block.end.getTime(),
  };
}

// The block a calendar day's mitzvot can wait in: the day's own, or the one it is the erev of.
export function blockForDay(day: Date, location: Location): HolyBlock | null {
  return (
    HebcalService.holyBlockOn(locationNoon(day, location), location) ??
    HebcalService.holyBlockOn(
      locationNoon(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1), location),
      location,
    )
  );
}

// The block a check-in id names.
export function blockOfCheckIn(id: string, location: Location): HolyBlock | null {
  return HebcalService.holyBlockOn(locationNoon(calendarDay(id), location), location);
}

// The mitzvot of one calendar day still waiting in an open check-in: shown as waiting, not missed.
export function pendingCheckInIds(checkIn: CheckIn | null, key: string): Set<string> {
  if (!checkIn?.open) return new Set();
  const day = checkIn.days.find((candidate) => candidate.key === key);
  return new Set((day?.items ?? []).filter((item) => !item.done).map((item) => item.mitzvah.id));
}

// The check-in of the block that ended most recently, while it still accepts marks.
export function latestCheckIn(input: CheckInInput, now: Date = new Date()): CheckIn | null {
  for (let days = 0; days <= RECENT_DAYS; days++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
    const block = HebcalService.holyBlockOn(locationNoon(day, input.location), input.location);
    if (!block || block.end.getTime() > now.getTime()) continue;
    if (!checkInPending(block, input.checkIns, now)) return null;
    return checkInFor(block, input, now);
  }
  return null;
}
