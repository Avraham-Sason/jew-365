import { DateTime } from 'luxon';
import type { HolyBlock, Location } from '@/types/zmanim';
import { omerDayFor } from '@/data/mitzvot';
import { holyBlockLabelKeys } from '@/utils/skipRules';
import { t } from '@/i18n';
import { BLOCK_NOTICE_KIND } from '@/services/notifications/ids';
import type { PlanInput, ScheduleCandidate } from '@/services/notifications/types';
import { formatClock, holyBlocksWithin, type Horizon } from '@/services/notifications/planners/horizon';
import { hilulaLines } from '@/services/notifications/planners/hilulot';
import { roshChodeshLines } from '@/services/notifications/planners/roshChodesh';

const BLOCK_NOTICE_LEAD_MIN = 60;

type OmerNight = { evening: DateTime; count: number };

// The Omer counts due on the nights inside the block, when no reminder can fire, each with the
// evening it is counted on. The erev's night may have none (the first Seder), so a count is never
// assumed to be tonight's. The last day's night opens at the block's own tzeit, where the regular
// Omer reminder fires as usual.
function omerNightsWithin(block: HolyBlock, location: Location): OmerNight[] {
  const evenings = [DateTime.fromISO(block.days[0], { zone: location.tz }).minus({ days: 1 })];
  for (const day of block.days.slice(0, -1)) evenings.push(DateTime.fromISO(day, { zone: location.tz }));
  return evenings.flatMap((evening) => {
    const count = omerDayFor(evening.set({ hour: 12 }).toJSDate(), location.tz);
    return count === null ? [] : [{ evening, count }];
  });
}

function omerLine(block: HolyBlock, nights: OmerNight[], english: boolean): string | null {
  if (!nights.length) return null;
  const erev = DateTime.fromISO(block.days[0]).minus({ days: 1 }).toISODate();
  if (nights.length === 1 && nights[0].evening.toISODate() === erev) {
    return t('holyBlock.notice.omerTonight', { count: nights[0].count });
  }
  const locale = english ? 'en' : 'he';
  const counts = nights.map(({ evening, count }) =>
    t('holyBlock.notice.omerOn', { count, day: evening.setLocale(locale).toFormat('cccc') }),
  );
  return t('holyBlock.notice.omerNights', { counts: counts.join(', ') });
}

function blockNoticeCandidate(block: HolyBlock, input: PlanInput, countsOmer: boolean): ScheduleCandidate | null {
  const trigger = new Date(block.start.getTime() - BLOCK_NOTICE_LEAD_MIN * 60_000);
  if (trigger.getTime() <= input.now.getTime()) return null;
  const labels = holyBlockLabelKeys(block);
  const lines = [
    t('holyBlock.notice.body', { start: formatClock(block.start), exit: t(labels.exit), end: formatClock(block.end) }),
  ];
  const omer = countsOmer ? omerLine(block, omerNightsWithin(block, input.location), input.language === 'en') : null;
  if (omer) lines.push(omer);
  if (input.hilulotEnabled) lines.push(...hilulaLines(block, input));
  if (input.roshChodeshEnabled) lines.push(...roshChodeshLines(block, input));
  return {
    id: `${BLOCK_NOTICE_KIND}:${block.days[0]}`,
    trigger,
    channel: 'mitzvot',
    title: t(labels.title),
    body: lines.join('\n'),
    data: { kind: BLOCK_NOTICE_KIND },
  };
}

export function planBlockNotices(input: PlanInput, horizon: Horizon): ScheduleCandidate[] {
  const countsOmer = input.mitzvot.some((m) => m.id === 'sefirat_haomer');
  const candidates: ScheduleCandidate[] = [];
  for (const block of holyBlocksWithin(horizon.days, input.location)) {
    try {
      const notice = blockNoticeCandidate(block, input, countsOmer);
      if (notice) candidates.push(notice);
    } catch (err) {
      if (__DEV__) console.warn('[notifications] block notice failed', block.days[0], err);
    }
  }
  return candidates;
}
