import { TIME_PATTERN, timeToMinutes } from '@/utils/clock';
import { MitzvahCategory, Reminder, Weekday } from '@/types/mitzvah';

export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];
export const ALL_DAY_MIN = 480;

const NOON_MIN = 12 * 60;
const AFTERNOON_END_MIN = 17 * 60;

export function categoryForWindow(startHHMM: string, endHHMM: string): MitzvahCategory {
  const start = timeToMinutes(startHHMM);
  const end = timeToMinutes(endHHMM);
  if (end - start >= ALL_DAY_MIN) return 'daily-allday';
  const midpoint = (start + end) / 2;
  if (midpoint < NOON_MIN) return 'daily-morning';
  return midpoint < AFTERNOON_END_MIN ? 'daily-afternoon' : 'daily-evening';
}

export function isActiveOn(activeDays: Weekday[] | undefined, weekday: Weekday): boolean {
  return activeDays === undefined || activeDays.includes(weekday);
}

const pad = (value: number) => String(value).padStart(2, '0');

export function reminderClock(
  startHHMM: string,
  endHHMM: string,
  reminder: Pick<Reminder, 'anchor' | 'offsetMin'>,
): string | null {
  if (!TIME_PATTERN.test(startHHMM) || !TIME_PATTERN.test(endHHMM)) return null;
  const start = timeToMinutes(startHHMM);
  const end = timeToMinutes(endHHMM);
  const trigger = (reminder.anchor === 'start' ? start : end) + reminder.offsetMin;
  if (!(trigger >= start && trigger <= end)) return null;
  return `${pad(Math.floor(trigger / 60))}:${pad(trigger % 60)}`;
}
