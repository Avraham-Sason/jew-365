import { Mitzvah, UserSettings } from '@/types/mitzvah';
import { Location } from '@/types/zmanim';
import { ZmanimService } from '@/services/ZmanimService';
import { isSkippedAt } from '@/utils/skipRules';
import { locationNoon } from '@/utils/locationDay';
import { blockForDay, checkInPending, overlapsBlock, wasEnabledBy } from '@/utils/checkIn';
import { ArchivedDays, CheckIns, Completions, dateKey, isArchivedDay } from '@/stores/useCompletionsStore';

export type HistoryStats = {
  streak: number;
  daily: { date: string; doneCount: number; totalCount: number; pendingCount: number }[];
  perMitzvah: Record<string, { done: number; eligible: number; pending: number; percent: number }>;
  missedYesterday: string[];
};

export function isTrackedInRange(stat: { eligible: number; pending: number }): boolean {
  return stat.eligible > 0 || stat.pending > 0;
}

export type HistoryInput = {
  mitzvot: Mitzvah[];
  completions: Completions;
  checkIns?: CheckIns;
  archivedDays?: ArchivedDays;
  skipped?: Completions;
  enabledSince?: Record<string, number>;
  location: Location;
  settings: UserSettings;
};

export type DayVerdict = { key: string; done: string[]; missed: string[]; pending: string[] };

export function addDays(day: Date, days: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
}

// Every mitzvah of one calendar day, judged done, missed or still open. An item stays open for as
// long as it can still be marked: until the day ends, or — when its window reaches into a Shabbat /
// Yom Tov block — until that block's check-in is finished or its deadline passes. Only then can a
// missing mark count against the user. A skip settles it at once, and a mitzvah switched on after
// the day ended is not judged on it.
export function judgeDay(day: Date, input: HistoryInput, now: Date): DayVerdict {
  const key = dateKey(day);
  const verdict: DayVerdict = { key, done: [], missed: [], pending: [] };
  const { location, settings } = input;
  const noon = locationNoon(day, location);
  const zmanim = ZmanimService.getZmanim(noon, location);
  if (!zmanim) return verdict;
  const dayEnd = addDays(day, 1);
  const doneMap = input.completions[key] ?? {};
  const skippedMap = input.skipped?.[key] ?? {};
  let block: ReturnType<typeof blockForDay> | undefined;
  const dayOpen = now.getTime() < dayEnd.getTime();
  for (const mitzvah of input.mitzvot) {
    if (!wasEnabledBy(mitzvah, dayEnd, input.enabledSince)) continue;
    const window = mitzvah.computeWindow({ date: day, location, settings, zmanim });
    if (!window) continue;
    if (isSkippedAt(mitzvah, window.start, location, settings)) continue;
    if (doneMap[mitzvah.id]) {
      verdict.done.push(mitzvah.id);
      continue;
    }
    if (skippedMap[mitzvah.id]) {
      verdict.missed.push(mitzvah.id);
      continue;
    }
    // Looked up only for a day with something unmarked: most days of a long streak never need it.
    if (block === undefined) block = blockForDay(day, location);
    const inBlock = block !== null && overlapsBlock(window, block);
    if (inBlock ? checkInPending(block!, input.checkIns ?? {}, now) : dayOpen) {
      verdict.pending.push(mitzvah.id);
    } else {
      verdict.missed.push(mitzvah.id);
    }
  }
  return verdict;
}

function earliestKey(input: HistoryInput): string | null {
  const keys = [...Object.keys(input.completions), ...(input.archivedDays ?? []).map(([first]) => first)];
  return keys.length ? keys.reduce((min, key) => (key < min ? key : min)) : null;
}

// Consecutive days, back from today, each with at least one mitzvah marked. A day that can still
// be marked (today, or a Shabbat / Yom Tov whose check-in is open) neither counts nor breaks, nor
// does a day with nothing to do. Shabbat and Yom Tov are ordinary days here: kept when marked in
// the check-in, broken when not. The walk is not bounded by the stats window — past retention the
// archive still knows which days were kept — and stops at the oldest day anything was recorded.
export function computeStreak(input: HistoryInput, now: Date = new Date(), judge = judgeDay): number {
  const floor = earliestKey(input);
  if (!floor) return 0;
  let streak = 0;
  for (
    let day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    dateKey(day) >= floor;
    day = addDays(day, -1)
  ) {
    const key = dateKey(day);
    if (Object.keys(input.completions[key] ?? {}).length || isArchivedDay(input.archivedDays ?? [], key)) {
      streak += 1;
      continue;
    }
    // With nothing enabled every day is empty, and walking past them would count every day ever kept.
    if (!input.mitzvot.length) break;
    const verdict = judge(day, input, now);
    if (verdict.pending.length || !verdict.missed.length) continue;
    break;
  }
  return streak;
}

export function computeStats(
  mitzvot: Mitzvah[],
  completions: Completions,
  location: Location,
  settings: UserSettings,
  daysBack = 30,
  now: Date = new Date(),
  extra: Pick<HistoryInput, 'checkIns' | 'archivedDays' | 'skipped' | 'enabledSince'> = {},
): HistoryStats {
  const input: HistoryInput = { mitzvot, completions, location, settings, ...extra };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayKey = dateKey(addDays(today, -1));
  const perMitzvah: HistoryStats['perMitzvah'] = Object.fromEntries(
    mitzvot.map((mitzvah) => [mitzvah.id, { done: 0, eligible: 0, pending: 0, percent: 0 }]),
  );
  const daily: HistoryStats['daily'] = [];
  const verdicts = new Map<string, DayVerdict>();
  let missedYesterday: string[] = [];

  for (let offset = daysBack - 1; offset >= 0; offset--) {
    const day = addDays(today, -offset);
    const verdict = judgeDay(day, input, now);
    verdicts.set(verdict.key, verdict);
    // An item counts toward its percentage once it is decided; an open one would read as missed
    // all morning, and all of Sunday for Shabbat.
    for (const id of verdict.done) {
      perMitzvah[id].done += 1;
      perMitzvah[id].eligible += 1;
    }
    for (const id of verdict.missed) perMitzvah[id].eligible += 1;
    for (const id of verdict.pending) perMitzvah[id].pending += 1;
    daily.push({
      date: verdict.key,
      doneCount: verdict.done.length,
      totalCount: verdict.done.length + verdict.missed.length + verdict.pending.length,
      pendingCount: verdict.pending.length,
    });
    if (verdict.key === yesterdayKey) missedYesterday = verdict.missed;
  }

  for (const stat of Object.values(perMitzvah)) {
    stat.percent = stat.eligible > 0 ? Math.round((stat.done / stat.eligible) * 100) : 0;
  }

  const streak = computeStreak(
    input,
    now,
    (day, streakInput, at) => verdicts.get(dateKey(day)) ?? judgeDay(day, streakInput, at),
  );
  return { streak, daily, perMitzvah, missedYesterday };
}
