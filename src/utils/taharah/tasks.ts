import { CycleState, TaharahEvent, TaharahSettings, TaharahTask, TaharahTaskKind } from '@/types/taharah';
import { Location } from '@/types/zmanim';
import { HebcalService } from '@/services/HebcalService';
import { locationNoon } from '@/utils/locationDay';
import { deriveCycle, husbandTevilaOn } from './cycle';
import { civilHebrewDayAt, currentOnah, nextTevilaNight, onsetCandidates, zmanimOfDay } from './onot';
import { activeOnsets, perishaOnot } from './vestot';

const HUSBAND_TASKS: readonly TaharahTaskKind[] = ['perisha', 'tevila', 'expectOnset'];
const FALLBACK_NIGHT_HOURS = 6;

export function taskKindsForRole(role: TaharahSettings['role']): readonly TaharahTaskKind[] {
  return role === 'husband'
    ? HUSBAND_TASKS
    : ['hefsek', 'bedikaMorning', 'bedikaEvening', 'tevila', 'perisha', 'bedikaVeset', 'expectOnset'];
}

// The woman's perisha onot matter once she is tahor. The husband records no bedikot and may never
// record the tevila, so for him every onah after an onset counts: a missed reminder costs more
// than a spare one.
function perishaApplies(state: CycleState, role: TaharahSettings['role']): boolean {
  if (state.stage === 'tahor') return true;
  return role === 'husband' && state.stage !== 'paused' && state.stage !== 'unknown';
}

// The tasks of a device calendar day, the day `dateKey()` names: the daytime of its Hebrew day and
// the night that opens the next Hebrew day at its shkia. Projected from the state as of `now`, so
// a hefsek not yet done keeps appearing on every eligible day until an event changes the state.
export function taharahTasksFor(
  day: Date,
  events: readonly TaharahEvent[],
  settings: TaharahSettings,
  location: Location,
  now: Date,
): TaharahTask[] {
  const abs = civilHebrewDayAt(locationNoon(day, location), location).abs();
  const zmanim = zmanimOfDay(abs, location);
  if (!zmanim) return [];
  const nightEnd =
    zmanimOfDay(abs + 1, location)?.netzHaChama ??
    new Date(zmanim.tzeitHakochavim.getTime() + FALLBACK_NIGHT_HOURS * 3_600_000);
  const state = deriveCycle(events, settings.rules, location, now);
  const today = currentOnah(now, location);
  const tasks: TaharahTask[] = [];
  const daytime = { start: zmanim.netzHaChama, end: zmanim.shkia };
  const night = { start: zmanim.shkia, end: nightEnd };

  const hefsekEligible = state.hefsekEarliestDay === null || abs >= state.hefsekEarliestDay;
  if ((state.stage === 'niddah' || state.stage === 'awaitingHefsek') && hefsekEligible && abs >= today.abs) {
    tasks.push({ kind: 'hefsek', ...daytime, day: abs, done: false, required: true });
  }

  const cleanDay = state.stage === 'shivaNekiim' ? state.cleanDays.find((d) => d.day === abs) : undefined;
  if (cleanDay) {
    const required = cleanDay.index === 1 || cleanDay.index === state.cleanDays.length;
    const base = { day: abs, required, cleanDayIndex: cleanDay.index };
    tasks.push({
      kind: 'bedikaMorning',
      start: zmanim.netzHaChama,
      end: zmanim.chatzot,
      done: cleanDay.morning !== null,
      ...base,
    });
    tasks.push({
      kind: 'bedikaEvening',
      start: zmanim.chatzot,
      end: zmanim.shkia,
      done: cleanDay.evening !== null,
      ...base,
    });
  }

  const awaitsTevila =
    state.stage === 'shivaNekiim' || state.stage === 'tevilaNight' || state.stage === 'awaitingTevila';
  const tevilaTonight =
    (awaitsTevila &&
      state.tevilaDay !== null &&
      abs + 1 >= state.tevilaDay &&
      nextTevilaNight(abs + 1, location) === abs + 1) ||
    (settings.role === 'husband' && husbandTevilaOn(state, abs + 1, location));
  // The tevila opens at nightfall: tzeit, or on motzaei Shabbat / Yom Tov the block's exit, so the
  // reminder is not one strictly inside the block and swallowed.
  if (tevilaTonight) {
    tasks.push({
      kind: 'tevila',
      start: HebcalService.nightfall(zmanim, location),
      end: nightEnd,
      day: abs + 1,
      done: false,
      required: true,
    });
  }

  if (perishaApplies(state, settings.role)) {
    for (const perisha of perishaOnot(events, settings.rules)) {
      const window =
        perisha.onah.kind === 'day' && perisha.onah.abs === abs
          ? daytime
          : perisha.onah.kind === 'night' && perisha.onah.abs === abs + 1
            ? night
            : null;
      if (!window) continue;
      const shared = {
        ...window,
        day: perisha.onah.abs,
        done: false,
        reasons: perisha.reasons,
        disputed: perisha.disputed,
      };
      tasks.push({ kind: 'perisha', required: true, ...shared });
      // An onah kept only as ohr zarua asks for separation, not for a bedika.
      if (perisha.reasons.some((reason) => reason !== 'ohrZarua')) {
        tasks.push({ kind: 'bedikaVeset', required: perisha.reasons.includes('onahBeinonit'), ...shared });
      }
    }
    const onsets = activeOnsets(events);
    const last = onsets[onsets.length - 1];
    if (last) {
      const furthest = Math.max(...settings.rules.onahBeinonitDays);
      const expected = onsetCandidates(last.onah, Boolean(last.doubtful)).map((c) => c.abs + furthest);
      if (expected.includes(abs))
        tasks.push({ kind: 'expectOnset', ...daytime, day: abs, done: false, required: false });
    }
  }

  const allowed = taskKindsForRole(settings.role);
  return tasks.filter((task) => allowed.includes(task.kind)).sort((a, b) => a.start.getTime() - b.start.getTime());
}
