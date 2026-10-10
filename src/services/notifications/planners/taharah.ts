import { DateTime } from 'luxon';
import type { HolyBlock, Location } from '@/types/zmanim';
import type { CycleState, OnahKind, TaharahTask } from '@/types/taharah';
import { quietBlockAt } from '@/utils/skipRules';
import { checkInPhraseKey } from '@/utils/checkIn';
import { locationNoon } from '@/utils/locationDay';
import { deriveCycle } from '@/utils/taharah/cycle';
import { civilHebrewDayAt, hebrewDay } from '@/utils/taharah/onot';
import { taharahTasksFor } from '@/utils/taharah/tasks';
import { t } from '@/i18n';
import { dateKey } from '@/stores/useCompletionsStore';
import type { TaharahLeads } from '@/stores/useTaharahStore';
import { TAHARAH_BEDIKA_CATEGORY, TAHARAH_KIND, type PendingNotificationMeta } from '@/services/notifications/ids';
import type { PlanInput, ScheduleCandidate } from '@/services/notifications/types';
import { formatClock, holyBlocksWithin, type Horizon } from '@/services/notifications/planners/horizon';

const TAHARAH_BEDIKA_MORNING_DELAY_MIN = 30;
const TAHARAH_BEDIKA_VESET_LEAD_MIN = 60;
const TAHARAH_EXPECT_ONSET_HOUR = 10;
const TAHARAH_BEFORE_QUIET_MIN = 10;
const TAHARAH_POST_BLOCK_DELAY_MIN = 15;

type TaharahNotificationTask = NonNullable<PendingNotificationMeta['taharah']>['task'];

type TaharahDraft = {
  identifier: string;
  task: TaharahNotificationTask;
  day: number;
  onah?: OnahKind;
  trigger: Date;
  end: Date;
  params: { time?: string; day?: number; reasons?: string; in?: string };
  bodyKey?: string;
  disputed?: boolean;
  category?: string;
};

function shifted(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

// Whether a clean day of the cycle that falls inside the block still lacks a bedika slot.
export function bedikotMissingIn(state: CycleState, block: HolyBlock): boolean {
  return state.cleanDays.some(
    (day) => block.days.includes(dateKey(hebrewDay(day.day).greg())) && (day.morning === null || day.evening === null),
  );
}

// Nothing fires strictly inside a holy block, so a taharah reminder that would land there goes out
// ten minutes before candle lighting instead, while it can still be acted on — unless the task
// outlasts the block (a perisha night opening at motzaei Shabbat's shkia), when it waits for the
// block's end.
function beforeQuiet(trigger: Date, end: Date, location: Location): Date {
  const block = quietBlockAt(trigger, location);
  if (!block) return trigger;
  return end.getTime() > block.end.getTime() ? block.end : shifted(block.start, -TAHARAH_BEFORE_QUIET_MIN);
}

function firstDayAbs(block: HolyBlock, location: Location): number {
  const firstDay = DateTime.fromISO(block.days[0], { zone: location.tz }).set({ hour: 12 }).toJSDate();
  return civilHebrewDayAt(firstDay, location).abs();
}

function expectedOnsetCheck(netz: Date, location: Location): Date {
  return DateTime.fromJSDate(netz)
    .setZone(location.tz)
    .set({ hour: TAHARAH_EXPECT_ONSET_HOUR, minute: 0, second: 0, millisecond: 0 })
    .toJSDate();
}

function taharahDraftsFor(
  task: TaharahTask,
  civilAbs: number,
  location: Location,
  leads: TaharahLeads,
): TaharahDraft[] {
  const onah: OnahKind | undefined =
    task.kind === 'perisha' || task.kind === 'bedikaVeset' ? (task.day === civilAbs ? 'day' : 'night') : undefined;
  const reasons = task.reasons?.map((reason) => t(`taharah.reason.${reason}`)).join(' · ');
  const draft = (
    notification: TaharahNotificationTask,
    trigger: Date,
    time: string | undefined,
    extra: Partial<TaharahDraft> = {},
  ): TaharahDraft => ({
    identifier: `${TAHARAH_KIND}:${notification}:${task.day}${onah ? `:${onah}` : ''}`,
    task: notification,
    day: task.day,
    onah,
    trigger,
    end: notification === 'tevilaPrep' ? task.start : task.end,
    params: { time, day: task.cleanDayIndex, reasons },
    disputed: task.disputed,
    ...extra,
  });
  const until = formatClock(task.end);

  switch (task.kind) {
    case 'hefsek':
      return [draft('hefsek', shifted(task.end, -leads.hefsekLeadMin), until)];
    case 'bedikaMorning':
      return task.done
        ? []
        : [
            draft('bedikaMorning', shifted(task.start, TAHARAH_BEDIKA_MORNING_DELAY_MIN), until, {
              category: TAHARAH_BEDIKA_CATEGORY,
            }),
          ];
    case 'bedikaEvening':
      return task.done
        ? []
        : [
            draft('bedikaEvening', shifted(task.end, -leads.bedikaEveningLeadMin), until, {
              category: TAHARAH_BEDIKA_CATEGORY,
            }),
          ];
    case 'tevila': {
      const prep = shifted(task.start, -leads.tevilaPrepLeadMin);
      const block = quietBlockAt(task.start, location);
      if (block) {
        return [
          draft('tevilaPrep', prep, formatClock(block.start), { bodyKey: 'taharah.notify.body.tevilaPrepShabbat' }),
        ];
      }
      return [draft('tevilaPrep', prep, formatClock(task.start)), draft('tevila', task.start, formatClock(task.start))];
    }
    case 'perisha':
      return [draft('perisha', task.start, until)];
    case 'bedikaVeset':
      return task.required ? [draft('bedikaVeset', shifted(task.end, -TAHARAH_BEDIKA_VESET_LEAD_MIN), until)] : [];
    case 'expectOnset':
      return [draft('expectOnset', expectedOnsetCheck(task.start, location), undefined)];
  }
}

// The nudge to mark the bedikot a woman could not mark inside Shabbat / Yom Tov, once it ends.
function postBlockDrafts(blocks: HolyBlock[], state: CycleState, location: Location, now: Date): TaharahDraft[] {
  if (state.stage !== 'shivaNekiim' && state.stage !== 'safek') return [];
  return blocks
    .filter((block) => block.end.getTime() > now.getTime() && bedikotMissingIn(state, block))
    .map((block): TaharahDraft => ({
      identifier: `${TAHARAH_KIND}:postBlock:${block.days[0]}`,
      task: 'postBlock',
      day: firstDayAbs(block, location),
      trigger: shifted(block.end, TAHARAH_POST_BLOCK_DELAY_MIN),
      end: shifted(block.end, TAHARAH_POST_BLOCK_DELAY_MIN),
      params: { in: t(checkInPhraseKey(block)) },
    }));
}

function taharahText(draft: TaharahDraft, discreet: boolean): { title: string; body: string } {
  if (discreet) {
    return {
      title: t('taharah.notify.discreetTitle'),
      body: draft.params.time
        ? t('taharah.notify.discreet.untilBody', { time: draft.params.time })
        : t('taharah.notify.discreet.body'),
    };
  }
  const body = t(draft.bodyKey ?? `taharah.notify.body.${draft.task}`, draft.params);
  return {
    title: t(`taharah.notify.title.${draft.task}`, draft.params),
    body: draft.disputed ? `${body}\n${t('taharah.disputed')}` : body,
  };
}

function taharahCandidate(draft: TaharahDraft, trigger: Date, discreet: boolean): ScheduleCandidate {
  const { title, body } = taharahText(draft, discreet);
  const { task, day, onah } = draft;
  return {
    id: draft.identifier,
    trigger,
    channel: 'taharah',
    ...(draft.category && { categoryIdentifier: draft.category }),
    title,
    body,
    data: { kind: TAHARAH_KIND, taharah: { task, day, ...(onah && { onah }) } },
  };
}

type ShiftedTaharahGroup = { block: HolyBlock; trigger: Date; drafts: TaharahDraft[] };

// What a holy block pushed onto one instant reads as a single reminder: the tasks it left for
// before candle lighting, in the order they were due.
function preBlockCandidate(
  { block, trigger, drafts }: ShiftedTaharahGroup,
  location: Location,
  discreet: boolean,
): ScheduleCandidate {
  const phrase = { in: t(checkInPhraseKey(block)) };
  const lines = [...new Set(drafts.map((draft) => taharahText(draft, false).title))];
  if (drafts.some((draft) => draft.disputed)) lines.push(t('taharah.disputed'));
  return {
    id: `${TAHARAH_KIND}:preBlock:${block.days[0]}`,
    trigger,
    channel: 'taharah',
    title: discreet ? t('taharah.notify.discreetTitle') : t('taharah.notify.title.preBlock', phrase),
    body: discreet ? t('taharah.notify.discreet.preBlock', phrase) : lines.join('\n'),
    data: { kind: TAHARAH_KIND, taharah: { task: 'preBlock', day: firstDayAbs(block, location) } },
  };
}

// Nothing here exists unless the user opted into the taharah feature.
export function planTaharah(input: PlanInput, horizon: Horizon): ScheduleCandidate[] {
  if (!input.taharahEnabled) return [];
  const { location, now } = input;
  const { events, settings, discreet, leads } = input.taharah;
  const { days } = horizon;
  const drafts = days.flatMap((day) => {
    const civilAbs = civilHebrewDayAt(locationNoon(day, location), location).abs();
    return taharahTasksFor(day, events, settings, location, now).flatMap((task) =>
      taharahDraftsFor(task, civilAbs, location, leads),
    );
  });
  if (settings.role === 'woman') {
    const blocks = holyBlocksWithin([...horizon.recentDays, ...days], location);
    drafts.push(...postBlockDrafts(blocks, deriveCycle(events, settings.rules, location, now), location, now));
  }
  const scheduled = new Set<string>();
  const unshifted: ScheduleCandidate[] = [];
  const shiftedGroups = new Map<string, ShiftedTaharahGroup>();
  for (const draft of drafts) {
    const trigger = beforeQuiet(draft.trigger, draft.end, location);
    if (trigger.getTime() <= now.getTime() || scheduled.has(draft.identifier)) continue;
    scheduled.add(draft.identifier);
    // Only a reminder pulled ahead of the block joins the merged pre-block notice; one deferred to
    // the block's end is its own reminder, at the first instant it can be acted on.
    if (trigger.getTime() >= draft.trigger.getTime()) {
      unshifted.push(taharahCandidate(draft, trigger, discreet));
      continue;
    }
    const block = quietBlockAt(draft.trigger, location)!;
    const group = shiftedGroups.get(block.days[0]) ?? { block, trigger, drafts: [] };
    group.drafts.push(draft);
    shiftedGroups.set(block.days[0], group);
  }
  // A lone pulled-ahead reminder is also sent as the pre-block notice: its own text would name a
  // deadline inside the block, where nothing can be done about it.
  const fromShifted = [...shiftedGroups.values()].map((group) => {
    group.drafts.sort((a, b) => a.trigger.getTime() - b.trigger.getTime());
    return preBlockCandidate(group, location, discreet);
  });
  return [...unshifted, ...fromShifted];
}
