import { isQuietAt } from '@/utils/skipRules';
import { weekEndFor } from '@/utils/weeklyReport';
import { dateKey } from '@/stores/useCompletionsStore';
import { t } from '@/i18n';
import { REPORT_KIND } from '@/services/notifications/ids';
import type { PlanInput, ScheduleCandidate } from '@/services/notifications/types';
import { holyBlocksWithin, type Horizon } from '@/services/notifications/planners/horizon';

export const REPORT_DELAY_MIN = 45;

export function planReport(input: PlanInput, horizon: Horizon): ScheduleCandidate[] {
  if (!input.weeklyReportEnabled) return [];
  const { location, now } = input;
  return holyBlocksWithin([...horizon.recentDays, ...horizon.days], location).flatMap((block): ScheduleCandidate[] => {
    const weekEnd = weekEndFor(block);
    const trigger = new Date(block.end.getTime() + REPORT_DELAY_MIN * 60_000);
    if (!weekEnd || trigger.getTime() <= now.getTime() || isQuietAt(trigger, location)) return [];
    const week = dateKey(weekEnd);
    return [
      {
        id: `${REPORT_KIND}:${week}`,
        trigger,
        channel: 'system',
        title: t('report.notice.title'),
        body: t('report.notice.body'),
        data: { kind: REPORT_KIND, report: { week } },
      },
    ];
  });
}
