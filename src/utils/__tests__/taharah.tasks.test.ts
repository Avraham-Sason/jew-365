import { HDate } from '@hebcal/core';
import { CITIES } from '@/data/cities';
import { TAHARAH_PRESETS } from '@/data/taharahPresets';
import { at, zmanimFor } from '@/testing/zmanim';
import { Location } from '@/types/zmanim';
import { TaharahEvent, TaharahSettings } from '@/types/taharah';
import { taharahTasksFor, taskKindsForRole } from '@/utils/taharah/tasks';
import { HebcalService } from '@/services/HebcalService';
import { HOLY_BLOCK_EXIT_MIN } from '@/services/ZmanimService';

const JERUSALEM = CITIES[0];
const NEW_YORK = CITIES.find((c) => c.nameEn === 'New York')!;

const absOf = (y: number, m: number, d: number) => new HDate(new Date(y, m - 1, d)).abs();
// 9 Cheshvan 5787, a Tuesday.
const O = absOf(2026, 10, 20);
const P = absOf(2026, 9, 1);
const L = absOf(2026, 9, 29);

const WOMAN: TaharahSettings = { preset: 'ashkenaz', rules: TAHARAH_PRESETS.ashkenaz, role: 'woman' };
const HUSBAND: TaharahSettings = { ...WOMAN, role: 'husband' };
const CHABAD: TaharahSettings = { preset: 'chabad', rules: TAHARAH_PRESETS.chabad, role: 'woman' };

type Draft<E> = E extends unknown ? Omit<E, 'id' | 'recordedAt'> : never;

const log = (...drafts: Draft<TaharahEvent>[]): TaharahEvent[] =>
  drafts.map((draft, i) => ({ ...draft, id: `e${i + 1}`, recordedAt: i + 1 }) as TaharahEvent);

const onset = (abs: number): Draft<TaharahEvent> => ({ type: 'onset', onah: { abs, kind: 'day' } });
const hefsek = (day: number): Draft<TaharahEvent> => ({ type: 'hefsek', day, result: 'clean' });
const morning = (day: number): Draft<TaharahEvent> => ({ type: 'bedika', day, slot: 'morning', result: 'clean' });
const tevila = (day: number): Draft<TaharahEvent> => ({ type: 'tevila', day });

// The zmanim of a civil date at the location.
const zmanim = (date: string, location: Location = JERUSALEM) => zmanimFor(at(location, `${date}T12:00`), location);
const time = (date: Date) => date.getTime();

const tasksOn = (
  device: Date,
  events: TaharahEvent[],
  now: string,
  settings: TaharahSettings = WOMAN,
  location: Location = JERUSALEM,
) => taharahTasksFor(device, events, settings, location, at(location, now));
const kinds = (tasks: ReturnType<typeof taharahTasksFor>) => tasks.map((task) => task.kind);

const tahor = () =>
  log(onset(P), onset(L), hefsek(L + 4), ...Array.from({ length: 7 }, (_, i) => morning(L + 5 + i)), tevila(L + 12));

describe('taharahTasksFor', () => {
  it('anchors the fixtures on their calendar dates', () => {
    expect(new HDate(O).getDate()).toBe(9);
    expect(L + 28).toBe(absOf(2026, 10, 27));
  });

  describe('waiting for the hefsek', () => {
    const events = log(onset(O));
    const now = '2026-10-24T09:00';

    it('asks for the hefsek between sunrise and sunset of the fifth day', () => {
      const tasks = tasksOn(new Date(2026, 9, 24), events, now);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({ kind: 'hefsek', day: O + 4, required: true, done: false });
      expect(time(tasks[0].start)).toBe(time(zmanim('2026-10-24').netzHaChama));
      expect(time(tasks[0].end)).toBe(time(zmanim('2026-10-24').shkia));
    });

    it('asks for nothing before the earliest day', () => {
      expect(tasksOn(new Date(2026, 9, 23), events, now)).toEqual([]);
    });

    it('projects the hefsek onto the days after, until it is done', () => {
      const tasks = tasksOn(new Date(2026, 9, 25), events, now);
      expect(kinds(tasks)).toEqual(['hefsek']);
      expect(tasks[0].day).toBe(O + 5);
    });

    it('asks for nothing about days already past', () => {
      expect(tasksOn(new Date(2026, 9, 24), events, '2026-10-26T09:00')).toEqual([]);
    });
  });

  describe('during the seven clean days', () => {
    const events = log(onset(O), hefsek(O + 4), morning(O + 5));
    const now = '2026-10-25T12:00';

    it('requires both bedikot on the first day and shows what is done', () => {
      const tasks = tasksOn(new Date(2026, 9, 25), events, now);
      expect(tasks).toHaveLength(2);
      expect(tasks[0]).toMatchObject({
        kind: 'bedikaMorning',
        day: O + 5,
        done: true,
        required: true,
        cleanDayIndex: 1,
      });
      expect(tasks[1]).toMatchObject({
        kind: 'bedikaEvening',
        day: O + 5,
        done: false,
        required: true,
        cleanDayIndex: 1,
      });
      const day = zmanim('2026-10-25');
      expect([time(tasks[0].start), time(tasks[0].end)]).toEqual([time(day.netzHaChama), time(day.chatzot)]);
      expect([time(tasks[1].start), time(tasks[1].end)]).toEqual([time(day.chatzot), time(day.shkia)]);
    });

    it('makes the middle days optional', () => {
      const tasks = tasksOn(new Date(2026, 9, 27), events, now);
      expect(kinds(tasks)).toEqual(['bedikaMorning', 'bedikaEvening']);
      expect(tasks.map((t) => t.required)).toEqual([false, false]);
      expect(tasks.map((t) => t.cleanDayIndex)).toEqual([3, 3]);
    });

    it('asks for nothing on the hefsek day once it is done', () => {
      expect(tasksOn(new Date(2026, 9, 24), events, now)).toEqual([]);
    });
  });

  describe('the seventh day', () => {
    const events = log(onset(O), hefsek(O + 4), morning(O + 5), morning(O + 11));

    it('requires the bedikot and adds the tevila of the coming night, sorted by start', () => {
      // 2026-10-31 is Shabbat: the tevila night opens at the block's exit, ten minutes after tzeit.
      const tasks = tasksOn(new Date(2026, 9, 31), events, '2026-10-31T12:00');
      expect(kinds(tasks)).toEqual(['bedikaMorning', 'bedikaEvening', 'tevila']);
      expect(tasks[0]).toMatchObject({ done: true, required: true, cleanDayIndex: 7 });
      expect(tasks[1]).toMatchObject({ done: false, required: true, cleanDayIndex: 7 });
      expect(tasks[2]).toMatchObject({ day: O + 12, required: true, done: false });
      const block = HebcalService.holyBlockAt(at(JERUSALEM, '2026-10-31T12:00'), JERUSALEM)!;
      expect(time(tasks[2].start)).toBe(time(block.end));
      expect(time(tasks[2].start)).toBe(time(zmanim('2026-10-31').tzeitHakochavim) + HOLY_BLOCK_EXIT_MIN * 60_000);
      expect(time(tasks[2].end)).toBe(time(zmanim('2026-11-01').netzHaChama));
      expect(tasks.map((t) => time(t.start))).toEqual([...tasks.map((t) => time(t.start))].sort((a, b) => a - b));
    });

    it('moves the tevila to the next night when the first was missed, opening at tzeit on a weeknight', () => {
      const tasks = tasksOn(new Date(2026, 10, 1), events, '2026-11-01T12:00');
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({ kind: 'tevila', day: O + 13 });
      expect(time(tasks[0].start)).toBe(time(zmanim('2026-11-01').tzeitHakochavim));
    });
  });

  describe('immersion around Yom Kippur', () => {
    const H = absOf(2026, 9, 13);
    const afterYomKippur = absOf(2026, 9, 22);
    const tevilaDayOn = (tasks: ReturnType<typeof taharahTasksFor>) => tasks.find((t) => t.kind === 'tevila')?.day;

    it('moves a tevila due on the night of Yom Kippur to the night after', () => {
      const deferred = log(onset(H - 4), hefsek(H), ...Array.from({ length: 7 }, (_, i) => morning(H + i + 1)));
      expect(tevilaDayOn(tasksOn(new Date(2026, 8, 20), deferred, '2026-09-20T12:00'))).toBeUndefined();
      expect(tevilaDayOn(tasksOn(new Date(2026, 8, 21), deferred, '2026-09-21T12:00'))).toBe(afterYomKippur);
    });

    it('does not project a missed tevila onto the night of Yom Kippur, but does onto the night after', () => {
      const missed = log(onset(H - 12), hefsek(H - 8), ...Array.from({ length: 7 }, (_, i) => morning(H - 7 + i)));
      const now = '2026-09-16T12:00';
      expect(tevilaDayOn(tasksOn(new Date(2026, 8, 16), missed, now))).toBe(H + 4);
      expect(kinds(tasksOn(new Date(2026, 8, 20), missed, now))).toEqual([]);
      expect(tevilaDayOn(tasksOn(new Date(2026, 8, 21), missed, now))).toBe(afterYomKippur);
    });
  });

  describe('after the tevila', () => {
    const now = '2026-10-20T12:00';

    it('asks to separate on the haflaga day, and for a bedika only where it is required', () => {
      const tasks = tasksOn(new Date(2026, 9, 27), tahor(), now);
      expect(kinds(tasks)).toEqual(['perisha', 'bedikaVeset']);
      expect(tasks[0]).toMatchObject({ day: L + 28, reasons: ['haflaga'], required: true });
      expect(tasks[1]).toMatchObject({ day: L + 28, required: false });
      expect(time(tasks[0].start)).toBe(time(zmanim('2026-10-27').netzHaChama));
      expect(time(tasks[0].end)).toBe(time(zmanim('2026-10-27').shkia));
    });

    it('requires the bedika on the onah beinonit', () => {
      const tasks = tasksOn(new Date(2026, 9, 29), tahor(), now);
      expect(kinds(tasks)).toEqual(['perisha', 'bedikaVeset']);
      expect(tasks[0]).toMatchObject({ day: L + 30, reasons: ['yomHachodesh', 'onahBeinonit'], required: true });
      expect(tasks[1]).toMatchObject({ required: true });
    });

    it('expects the next onset on the day after the last onah beinonit', () => {
      const tasks = tasksOn(new Date(2026, 9, 30), tahor(), now);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({ kind: 'expectOnset', day: L + 31, required: false });
    });

    it('asks for nothing on an ordinary day', () => {
      expect(tasksOn(new Date(2026, 9, 26), tahor(), now)).toEqual([]);
    });

    it('lays a night onah on the evening before its Hebrew day', () => {
      const tasks = tasksOn(new Date(2026, 9, 27), tahor(), now, CHABAD);
      const nightL29 = tasks.find((t) => t.kind === 'perisha' && t.day === L + 29);
      expect(nightL29).toBeDefined();
      expect(nightL29!.reasons).toEqual(['onahBeinonit', 'ohrZarua']);
      expect(time(nightL29!.start)).toBe(time(zmanim('2026-10-27').shkia));
      expect(time(nightL29!.end)).toBe(time(zmanim('2026-10-28').netzHaChama));

      const dayL28 = tasks.find((t) => t.kind === 'perisha' && t.day === L + 28);
      expect(dayL28).toBeDefined();
      expect(dayL28!.reasons).toEqual(['haflaga', 'ohrZarua']);
      expect(time(dayL28!.start)).toBe(time(zmanim('2026-10-27').netzHaChama));
      expect(time(dayL28!.end)).toBe(time(zmanim('2026-10-27').shkia));
    });

    it('starts the ohr zarua of the first onah on the evening before it, with no bedika', () => {
      const tasks = tasksOn(new Date(2026, 9, 26), tahor(), now, CHABAD);
      expect(kinds(tasks)).toEqual(['perisha']);
      expect(tasks[0]).toMatchObject({ day: L + 28, reasons: ['ohrZarua'] });
      expect(time(tasks[0].start)).toBe(time(zmanim('2026-10-26').shkia));
      expect(time(tasks[0].end)).toBe(time(zmanim('2026-10-27').netzHaChama));
    });

    it('lays the ohr zarua of the yom hachodesh on the evening before it', () => {
      const tasks = tasksOn(new Date(2026, 9, 28), tahor(), now, CHABAD);
      const night = tasks.find(
        (t) => t.kind === 'perisha' && t.day === L + 30 && t.start.getTime() === time(zmanim('2026-10-28').shkia),
      );
      expect(night).toBeDefined();
      expect(night!.reasons).toEqual(['ohrZarua']);
      expect(time(night!.end)).toBe(time(zmanim('2026-10-29').netzHaChama));
    });
  });

  describe('the husband', () => {
    const events = log(onset(O), hefsek(O + 4), morning(O + 5), morning(O + 11));

    it('is asked about the tevila only, never the bedikot', () => {
      expect(taskKindsForRole('husband')).toEqual(['perisha', 'tevila', 'expectOnset']);
      expect(tasksOn(new Date(2026, 9, 25), events, '2026-10-31T12:00', HUSBAND)).toEqual([]);
      expect(kinds(tasksOn(new Date(2026, 9, 31), events, '2026-10-31T12:00', HUSBAND))).toEqual(['tevila']);
    });

    it('is asked about the perisha and the expected onset, not the bedika veset', () => {
      expect(kinds(tasksOn(new Date(2026, 9, 29), tahor(), '2026-10-20T12:00', HUSBAND))).toEqual(['perisha']);
      expect(kinds(tasksOn(new Date(2026, 9, 30), tahor(), '2026-10-20T12:00', HUSBAND))).toEqual(['expectOnset']);
    });

    it('leaves the woman every kind', () => {
      expect(taskKindsForRole('woman')).toEqual(
        expect.arrayContaining([
          'hefsek',
          'bedikaMorning',
          'bedikaEvening',
          'tevila',
          'perisha',
          'bedikaVeset',
          'expectOnset',
        ]),
      );
    });
  });

  describe('with no active cycle', () => {
    it('asks for nothing while paused', () => {
      const events = log(onset(O), { type: 'pause', day: O + 2, reason: 'pregnancy' });
      for (const day of [24, 25, 31]) {
        expect(tasksOn(new Date(2026, 9, day), events, '2026-10-25T12:00')).toEqual([]);
      }
    });

    it('asks for nothing without events', () => {
      expect(tasksOn(new Date(2026, 9, 24), [], '2026-10-24T09:00')).toEqual([]);
    });
  });

  describe('at another location', () => {
    it("takes the day's times from the location", () => {
      const tasks = tasksOn(new Date(2026, 9, 24), log(onset(O)), '2026-10-24T09:00', WOMAN, NEW_YORK);
      expect(kinds(tasks)).toEqual(['hefsek']);
      const day = zmanim('2026-10-24', NEW_YORK);
      expect([time(tasks[0].start), time(tasks[0].end)]).toEqual([time(day.netzHaChama), time(day.shkia)]);
    });
  });

  describe('the husband before the tevila', () => {
    // He records no bedikot and may never record the tevila, so his perisha onot are not gated on
    // the tahor stage: a missed reminder costs more than a spare one.
    it('gets the perisha and the expected-onset tasks while the woman would not', () => {
      const events = log(onset(P), onset(L));
      const husband = tasksOn(new Date(2026, 9, 27), events, '2026-10-20T12:00', HUSBAND);
      expect(kinds(husband)).toEqual(['perisha']);
      expect(husband[0].reasons).toEqual(['haflaga']);
      expect(kinds(tasksOn(new Date(2026, 9, 30), events, '2026-10-20T12:00', HUSBAND))).toEqual(['expectOnset']);
      expect(kinds(tasksOn(new Date(2026, 9, 27), events, '2026-10-20T12:00', WOMAN))).toEqual(['hefsek']);
    });

    it('gets nothing while paused or before any onset', () => {
      const paused = log(onset(L), { type: 'pause', day: L + 2, reason: 'pregnancy' });
      expect(tasksOn(new Date(2026, 9, 27), paused, '2026-10-20T12:00', HUSBAND)).toEqual([]);
      expect(tasksOn(new Date(2026, 9, 27), [], '2026-10-20T12:00', HUSBAND)).toEqual([]);
    });
  });

  describe("the husband's estimated mikveh night", () => {
    // Onset O, five days to the hefsek, seven clean days: the estimate opens on O+12.
    it('offers the tevila on the estimated night and the two after it, then lets go', () => {
      const events = log(onset(O));
      expect(kinds(tasksOn(new Date(2026, 9, 30), events, '2026-10-30T12:00', HUSBAND))).toEqual([]);
      expect(kinds(tasksOn(new Date(2026, 9, 31), events, '2026-10-31T12:00', HUSBAND))).toEqual(['tevila']);
      expect(tasksOn(new Date(2026, 9, 31), events, '2026-10-31T12:00', HUSBAND)[0].day).toBe(O + 12);
      expect(kinds(tasksOn(new Date(2026, 10, 2), events, '2026-11-02T12:00', HUSBAND))).toEqual(['tevila']);
      expect(kinds(tasksOn(new Date(2026, 10, 3), events, '2026-11-03T12:00', HUSBAND))).toEqual([]);
      expect(kinds(tasksOn(new Date(2026, 9, 31), events, '2026-10-31T12:00', WOMAN))).toEqual(['hefsek']);
    });

    it('stops once he records the tevila', () => {
      const events = log(onset(O), tevila(O + 12));
      expect(kinds(tasksOn(new Date(2026, 10, 1), events, '2026-11-01T12:00', HUSBAND))).toEqual([]);
    });
  });
});
