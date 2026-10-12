import { Mitzvah, UserSettings } from '@/types/mitzvah';
import { Location, Zmanim } from '@/types/zmanim';
import { ZmanimService } from '@/services/ZmanimService';
import { isSkippedAt } from '@/utils/skipRules';
import { appDay, appDayKey, locationNoon } from '@/utils/locationDay';
import { addDays } from '@/utils/historyStats';
import { mitzvahName } from '@/utils/mitzvahName';
import { Completions, dateKey } from '@/stores/useCompletionsStore';

export type TimelineItem = {
  id: string;
  name: string;
  time: Date;
  type: 'zman' | 'mitzvah';
  done?: boolean;
  urgent?: boolean;
  expired?: boolean;
  mitzvahId?: string;
  windowEnd?: Date;
};

export const ZMAN_KEYS = [
  'alotHaShachar',
  'netzHaChama',
  'sofZmanShmaGra',
  'sofZmanTfilaGra',
  'minchaGedola',
  'plagHaMincha',
  'shkia',
  'tzeitHakochavim',
] as const;

type Translate = (key: string, params?: Record<string, unknown>) => string;

const NEXT_WINDOW_LOOKAHEAD_DAYS = 9;

export type DayWindow = { start: Date; end: Date; date: Date };

// The window `mitzvah` has on calendar day `date` (device-local midnight of a location date, zmanim at
// the location's noon), or null when it has none or isSkippedAt() skips it. `date` keys its mark and ids.
export function dayWindow(mitzvah: Mitzvah, date: Date, location: Location, settings: UserSettings): DayWindow | null {
  const zmanim = ZmanimService.getZmanim(locationNoon(date, location), location);
  if (!zmanim) return null;
  const window = mitzvah.computeWindow({ date, location, settings, zmanim });
  if (!window || isSkippedAt(mitzvah, window.start, location, settings)) return null;
  return { ...window, date };
}

export function currentOrNextWindow(
  mitzvah: Mitzvah,
  location: Location,
  settings: UserSettings,
  now: Date = new Date(),
): DayWindow | null {
  const today = appDay(now, location);
  // Far enough ahead to clear the longest run of skipped days — Sukkot in Israel keeps tefillin
  // off for chol hamoed, Shemini Atzeret and a Shabbat — and to reach next week's candle lighting.
  for (let offset = -1; offset <= NEXT_WINDOW_LOOKAHEAD_DAYS; offset++) {
    const window = dayWindow(mitzvah, addDays(today, offset), location, settings);
    if (window && window.end.getTime() > now.getTime()) return window;
  }
  return null;
}

const isWindow = (window: DayWindow | null): window is DayWindow => window !== null;

// The window home shows: one open now, whatever day it was computed for; else the one whose start
// falls in this app day, the day's own or the next date's; else none.
export function appDayWindow(
  mitzvah: Mitzvah,
  location: Location,
  settings: UserSettings,
  now: Date = new Date(),
): DayWindow | null {
  const today = appDay(now, location);
  const todayKey = dateKey(today);
  const windows = [-1, 0, 1].map((offset) => dayWindow(mitzvah, addDays(today, offset), location, settings));
  const [, own, next] = windows;
  const open = windows
    .filter(isWindow)
    .find((window) => window.start.getTime() <= now.getTime() && now.getTime() < window.end.getTime());
  if (open) return open;
  return [own, next].filter(isWindow).find((window) => appDayKey(window.start, location) === todayKey) ?? null;
}

export function buildDayTimeline(
  date: Date,
  mitzvot: Mitzvah[],
  completions: Completions,
  location: Location,
  settings: UserSettings,
  language: 'he' | 'en',
  t: Translate,
  zmanim: Zmanim | null = ZmanimService.getZmanim(locationNoon(date, location), location),
): TimelineItem[] {
  if (!zmanim) return [];
  const timeline: TimelineItem[] = ZMAN_KEYS.map((key) => ({
    id: key,
    name: t(`zman.${key}`),
    time: zmanim[key],
    type: 'zman',
  }));
  const selectedDateKey = dateKey(date);
  const doneToday = completions[selectedDateKey] ?? {};
  const isToday = selectedDateKey === appDayKey(new Date(), location);
  mitzvot.forEach((mitzvah) => {
    const window = mitzvah.computeWindow({ date, location, settings, zmanim });
    if (!window) return;
    if (isSkippedAt(mitzvah, window.start, location, settings)) return;
    timeline.push({
      id: `${mitzvah.id}-${window.start.toISOString()}`,
      name: mitzvahName(mitzvah, language),
      time: window.start,
      type: 'mitzvah',
      done: Boolean(doneToday[mitzvah.id]),
      // Bounded on both sides. Unbounded, the comparison stayed true once `remaining` went
      // negative, so mitzvot that closed hours ago kept rendering "ending soon" all day — and it
      // also fired before a short window (candle lighting is 18 minutes) had even opened.
      urgent: isToday && window.end.getTime() - Date.now() > 0 && window.end.getTime() - Date.now() <= 45 * 60 * 1000,
      expired: isToday && window.end.getTime() <= Date.now(),
      mitzvahId: mitzvah.id,
      windowEnd: window.end,
    });
  });

  timeline.sort((a, b) => a.time.getTime() - b.time.getTime());
  return timeline;
}
