import { DateTime } from 'luxon';
import type { HDate } from '@hebcal/core';
import type { HolyBlock, Location } from '@/types/zmanim';
import { isRoshChodeshDay, roshChodeshLabel, roshChodeshMonth, startsRoshChodesh } from '@/data/roshChodesh';
import { ZmanimService } from '@/services/ZmanimService';
import { isQuietAt } from '@/utils/skipRules';
import { locationNoon } from '@/utils/locationDay';
import { civilHebrewDayAt } from '@/utils/taharah/onot';
import { t } from '@/i18n';
import { ROSH_CHODESH_KIND, type RoshChodeshWhen } from '@/services/notifications/ids';
import type { PlanInput, ScheduleCandidate } from '@/services/notifications/types';
import type { Horizon } from '@/services/notifications/planners/horizon';

export const ROSH_CHODESH_BEFORE_DAYS = 3;
export const ROSH_CHODESH_BEFORE_HOUR = 20;
export const ROSH_CHODESH_DAY_HOUR = 7;

type RoshChodeshNotice = {
  trigger: Date;
  when: RoshChodeshWhen;
  id: number;
  month: HDate;
  date: DateTime;
};

const civilDate = (hebrewDay: HDate) => DateTime.fromJSDate(hebrewDay.greg());

const clockAt = (noon: Date, location: Location, hour: number) =>
  DateTime.fromJSDate(noon).setZone(location.tz).set({ hour, minute: 0, second: 0, millisecond: 0 }).toJSDate();

function roshChodeshNoticesOn(day: Date, location: Location): RoshChodeshNotice[] {
  const noon = locationNoon(day, location);
  const today = civilHebrewDayAt(noon, location);
  const notices: RoshChodeshNotice[] = [];

  const entering = today.add(ROSH_CHODESH_BEFORE_DAYS);
  if (startsRoshChodesh(entering)) {
    const month = roshChodeshMonth(entering);
    const trigger = clockAt(noon, location, ROSH_CHODESH_BEFORE_HOUR);
    notices.push({ trigger, when: 'before', id: month.abs(), month, date: civilDate(entering.prev()) });
  }

  const tonight = today.next();
  const shkia = ZmanimService.getZmanim(noon, location)?.shkia;
  if (shkia && startsRoshChodesh(tonight)) {
    const month = roshChodeshMonth(tonight);
    notices.push({ trigger: shkia, when: 'evening', id: month.abs(), month, date: civilDate(today) });
  }

  if (isRoshChodeshDay(today)) {
    const trigger = clockAt(noon, location, ROSH_CHODESH_DAY_HOUR);
    notices.push({ trigger, when: 'day', id: today.abs(), month: roshChodeshMonth(today), date: civilDate(today) });
  }
  return notices;
}

function weekdayOf(date: DateTime, language: PlanInput['language']): string {
  return date.setLocale(language).toFormat('cccc');
}

function roshChodeshCandidate(notice: RoshChodeshNotice, language: PlanInput['language']): ScheduleCandidate {
  const params = { month: roshChodeshLabel(notice.month, language), day: weekdayOf(notice.date, language) };
  return {
    id: `${ROSH_CHODESH_KIND}:${notice.id}:${notice.when}`,
    trigger: notice.trigger,
    channel: 'roshChodesh',
    title: t(`roshChodesh.notice.${notice.when}.title`, params),
    body: t(`roshChodesh.notice.${notice.when}.body`, params),
    data: { kind: ROSH_CHODESH_KIND, roshChodesh: { day: notice.id, when: notice.when } },
  };
}

export function planRoshChodesh(input: PlanInput, horizon: Horizon): ScheduleCandidate[] {
  if (!input.roshChodeshEnabled) return [];
  const { location, language, now } = input;
  return horizon.days
    .flatMap((day) => roshChodeshNoticesOn(day, location))
    .filter((notice) => notice.trigger.getTime() > now.getTime() && !isQuietAt(notice.trigger, location))
    .map((notice) => roshChodeshCandidate(notice, language));
}

export function roshChodeshLines(block: HolyBlock, input: PlanInput): string[] {
  const { location, language } = input;
  const erev = DateTime.fromISO(block.days[0], { zone: location.tz }).minus({ days: 1 });
  const evenings = [erev, ...block.days.map((day) => DateTime.fromISO(day, { zone: location.tz }))];
  const swallowed = new Map<string, RoshChodeshNotice>();
  for (const evening of evenings) {
    const day = new Date(evening.year, evening.month - 1, evening.day);
    for (const notice of roshChodeshNoticesOn(day, location)) {
      const key = `${notice.when === 'day' ? 'day' : 'month'}:${notice.id}`;
      if (isQuietAt(notice.trigger, location) && !swallowed.has(key)) swallowed.set(key, notice);
    }
  }
  return [...swallowed.values()]
    .sort((a, b) => a.trigger.getTime() - b.trigger.getTime())
    .map((notice) => {
      const month = roshChodeshLabel(notice.month, language);
      const day = weekdayOf(notice.date, language);
      if (notice.when === 'day') return t('holyBlock.notice.roshChodeshDay', { month, day });
      return notice.date.toISODate() === erev.toISODate()
        ? t('holyBlock.notice.roshChodeshTonight', { month })
        : t('holyBlock.notice.roshChodeshOn', { month, day });
    });
}
