import { IOS_HEADROOM, IOS_MAX, PENDING_LIMIT } from '@/services/notifications/ids';
import type { PlanInput, ScheduleCandidate } from '@/services/notifications/types';
import { horizonFor } from '@/services/notifications/planners/horizon';
import { planBlockNotices } from '@/services/notifications/planners/holyBlock';
import { planCheckIns } from '@/services/notifications/planners/checkIn';
import { planReport } from '@/services/notifications/planners/report';
import { planTaharah } from '@/services/notifications/planners/taharah';
import { planHilulot } from '@/services/notifications/planners/hilulot';
import { planRoshChodesh } from '@/services/notifications/planners/roshChodesh';
import { planMitzvot } from '@/services/notifications/planners/mitzvot';

function guarded(label: string, plan: () => ScheduleCandidate[]): ScheduleCandidate[] {
  try {
    return plan();
  } catch (err) {
    if (__DEV__) console.warn(`[notifications] ${label} failed`, err);
    return [];
  }
}

// Everything the schedule should hold for `input`, soonest first and within the platform's cap.
// A planner that throws loses only its own candidates: cancelAll has already run, so an exception
// that escaped would leave the user with an empty schedule.
export function buildPlan(input: PlanInput): ScheduleCandidate[] {
  if (!input.hasPermission) return [];
  const horizon = horizonFor(input.fromDate, input.location);
  const candidates = [
    ...planBlockNotices(input, horizon),
    ...planCheckIns(input, horizon),
    ...guarded('weekly report', () => planReport(input, horizon)),
    ...guarded('taharah reminders', () => planTaharah(input, horizon)),
    ...guarded('hilula notices', () => planHilulot(input, horizon)),
    ...guarded('rosh chodesh notices', () => planRoshChodesh(input, horizon)),
    ...planMitzvot(input, horizon),
  ];

  // iOS keeps only the 64 soonest pending requests and silently discards the rest. Order by
  // trigger and cap deliberately, so what gets dropped is the furthest away rather than —
  // as with a day-major loop — all of tomorrow.
  candidates.sort((a, b) => a.trigger.getTime() - b.trigger.getTime());
  const cap = input.platform === 'ios' ? IOS_MAX - IOS_HEADROOM : PENDING_LIMIT;
  if (candidates.length > cap) {
    console.warn(
      `[notifications] ${candidates.length - cap} reminder(s) beyond the ${cap} slot cap were not scheduled`,
    );
  }
  return candidates.slice(0, cap);
}
