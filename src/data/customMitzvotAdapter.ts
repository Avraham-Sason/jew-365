import { DateTime } from 'luxon';
import { CustomMitzvah, Mitzvah, MitzvahWindow, Nusach, Weekday } from '@/types/mitzvah';
import { MITZVOT, findMitzvah as findStaticMitzvah } from '@/data/mitzvot';
import { useCustomMitzvotStore } from '@/stores/useCustomMitzvotStore';
import { categoryForWindow, isActiveOn, windowMinutes } from '@/utils/customMitzvah';

const ALL_NUSCHAOT: Nusach[] = ['ashkenaz', 'sefard', 'edot_hamizrach', 'chabad'];

function parseHHMM(value: string): { h: number; m: number } {
  const [hStr, mStr] = (value ?? '').split(':');
  const h = Math.max(0, Math.min(23, Number(hStr) || 0));
  const m = Math.max(0, Math.min(59, Number(mStr) || 0));
  return { h, m };
}

function buildWindow(start: Date, end: Date): MitzvahWindow {
  if (end.getTime() <= start.getTime()) return null;
  return { start, end };
}

export function customToMitzvah(c: CustomMitzvah): Mitzvah {
  const { h: sh, m: sm } = parseHHMM(c.startHHMM);
  const { h: eh, m: em } = parseHHMM(c.endHHMM);
  return {
    id: c.id,
    name: { he: c.name },
    icon: 'custom',
    timeType: 'range-within-day',
    category: categoryForWindow(c.startHHMM, c.endHHMM),
    skipOn: c.skipOn,
    nuschaotSupported: ALL_NUSCHAOT,
    defaultReminders: c.reminders.map(({ bodyVariants: _dropped, ...reminder }) => reminder),
    contentBlocks: c.contentBlocks,
    isCustom: true,
    computeWindow: ({ date, location }) => {
      // Anchor on the caller's calendar day rather than re-zoning the raw instant: callers pass
      // local midnight (schedule/history) or "now" (home), and re-zoning made those resolve to
      // different days whenever the device zone differed from the location's — so the same custom
      // mitzvah showed up on different days on Home and Schedule.
      const base = DateTime.fromObject(
        { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() },
        { zone: location.tz },
      );
      if (!isActiveOn(c.activeDays, (base.weekday % 7) as Weekday)) return null;
      const start = base.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
      const endsNextDay = eh * 60 + em <= sh * 60 + sm;
      let end = (endsNextDay ? base.plus({ days: 1 }) : base).set({ hour: eh, minute: em, second: 0, millisecond: 0 });
      // On a DST spring-forward day both endpoints can collapse onto the same instant, which used
      // to make the mitzvah silently not exist that day. Preserve the configured duration instead.
      if (end <= start) {
        end = start.plus({ minutes: windowMinutes(c.startHHMM, c.endHHMM) });
      }
      return buildWindow(start.toJSDate(), end.toJSDate());
    },
  };
}

export function getAllMitzvot(nusach?: Nusach): Mitzvah[] {
  const customs = useCustomMitzvotStore.getState().list().map(customToMitzvah);
  const all = [...MITZVOT, ...customs];
  // `nuschaotSupported` was declared on every mitzvah and read nowhere, so the nusach the user
  // picks in onboarding decided nothing. Honour it wherever the caller knows the nusach.
  return nusach ? all.filter((m) => m.nuschaotSupported.includes(nusach)) : all;
}

export function findAnyMitzvah(id: string): Mitzvah | undefined {
  const fromStatic = findStaticMitzvah(id);
  if (fromStatic) return fromStatic;
  const custom = useCustomMitzvotStore.getState().items[id];
  return custom ? customToMitzvah(custom) : undefined;
}
