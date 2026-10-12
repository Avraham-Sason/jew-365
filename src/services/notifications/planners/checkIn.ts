import { DateTime } from 'luxon';
import type { HolyBlock, Location } from '@/types/zmanim';
import { HebcalService } from '@/services/HebcalService';
import { isQuietAt } from '@/utils/skipRules';
import { CheckInInput, checkInFor, checkInPhraseKey } from '@/utils/checkIn';
import { t } from '@/i18n';
import { CHECK_IN_KIND } from '@/services/notifications/ids';
import type { PlanInput, ScheduleCandidate } from '@/services/notifications/types';
import { holyBlocksWithin, type Horizon } from '@/services/notifications/planners/horizon';

const CHECK_IN_SECOND_NUDGE_MIN = 120;
const CHECK_IN_LAST_CALL_HOUR = 20;
const CHECK_IN_LAST_CALL_LEAD_MIN = 30;

export function checkInInputOf(input: PlanInput): CheckInInput {
  const { mitzvot, completions, skipped, checkIns, location, settings, enabledSince } = input;
  return { mitzvot, completions, skipped, checkIns, location, settings, enabledSince };
}

function checkInNotificationId(blockId: string, index: number): string {
  return `${CHECK_IN_KIND}:${blockId}:${index}`;
}

// 20:00 on the location's clock the day after the block — unless that evening already opens the next
// block (erev Yom Kippur right after Shabbat), when the last call comes half an hour before its candle
// lighting instead.
function lastCallFor(block: HolyBlock, location: Location): Date {
  const { year, month, day } = DateTime.fromISO(block.days[block.days.length - 1]).plus({ days: 1 });
  const lastCall = DateTime.fromObject(
    { year, month, day, hour: CHECK_IN_LAST_CALL_HOUR },
    { zone: location.tz },
  ).toJSDate();
  const next = HebcalService.holyBlockAt(lastCall, location);
  return next ? new Date(next.start.getTime() - CHECK_IN_LAST_CALL_LEAD_MIN * 60_000) : lastCall;
}

// The nudges to mark what was done inside a block: at its tzeit, again two hours later, and a last
// call the next evening before the check-in closes at the following alot. None once the check-in is
// finished, or when every mitzvah of the block is already marked or skipped.
function checkInCandidates(block: HolyBlock, input: CheckInInput, now: Date): ScheduleCandidate[] {
  const checkIn = checkInFor(block, input, now);
  if (!checkIn || checkIn.finished) return [];
  const secondNudge = new Date(block.end.getTime() + CHECK_IN_SECOND_NUDGE_MIN * 60_000);
  const lastCall = lastCallFor(block, input.location);
  const triggers = [block.end, secondNudge, lastCall.getTime() > secondNudge.getTime() ? lastCall : null];
  const title = t('checkin.title', { in: t(checkInPhraseKey(block)) });
  return triggers.flatMap((trigger, index): ScheduleCandidate[] => {
    if (!trigger || trigger.getTime() <= now.getTime() || trigger.getTime() >= checkIn.deadline.getTime()) return [];
    if (isQuietAt(trigger, input.location)) return [];
    return [
      {
        id: checkInNotificationId(checkIn.id, index),
        trigger,
        channel: 'system',
        title,
        body: t(`checkin.notify.${index}`),
        data: { kind: CHECK_IN_KIND, blockId: checkIn.id },
      },
    ];
  });
}

export function planCheckIns(input: PlanInput, horizon: Horizon): ScheduleCandidate[] {
  const checkInInput = checkInInputOf(input);
  const candidates: ScheduleCandidate[] = [];
  for (const block of holyBlocksWithin([...horizon.recentDays, ...horizon.days], input.location)) {
    try {
      candidates.push(...checkInCandidates(block, checkInInput, input.now));
    } catch (err) {
      if (__DEV__) console.warn('[notifications] check-in reminders failed', block.days[0], err);
    }
  }
  return candidates;
}
