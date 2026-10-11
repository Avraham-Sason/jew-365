import { HDate } from '@hebcal/core';
import { MITZVOT, findMitzvah, omerDayFor } from '../mitzvot';
import { zmanimFor } from '@/testing/zmanim';
import { UserSettings } from '@/types/mitzvah';
import { CITIES } from '../cities';

const JERUSALEM = CITIES[0];
const SETTINGS: UserSettings = {
  nusach: 'ashkenaz',
  halachicOpinions: { ksSofZman: 'GRA' },
  inIsrael: true,
};

const DATES = [new Date('2026-04-23T12:00:00Z'), new Date('2026-05-15T12:00:00Z')];

function ctxFor(date: Date) {
  return { date, location: JERUSALEM, settings: SETTINGS, zmanim: zmanimFor(date, JERUSALEM) };
}

describe('mitzvot windows', () => {
  it('has all 9 MVP mitzvot and no tzitzit', () => {
    const ids = [
      'tefillin',
      'krias_shma_shacharit',
      'shacharit',
      'mincha',
      'maariv',
      'birchot_hashachar',
      'candle_lighting',
      'havdalah',
      'sefirat_haomer',
    ];
    for (const id of ids) {
      expect(findMitzvah(id)).toBeDefined();
    }
    expect(MITZVOT.length).toBeGreaterThanOrEqual(9);
    expect(findMitzvah('tzitzit')).toBeUndefined();
  });

  it.each(DATES)('computes valid windows for all mitzvot on %s', (date) => {
    const ctx = ctxFor(date);
    for (const m of MITZVOT) {
      const w = m.computeWindow(ctx);
      if (w) {
        expect(w.end.getTime()).toBeGreaterThan(w.start.getTime());
      }
    }
  });

  it('tefillin window = misheyakir..shkia', () => {
    const ctx = ctxFor(DATES[0]);
    const w = findMitzvah('tefillin')!.computeWindow(ctx);
    expect(w).not.toBeNull();
    expect(w!.start.getTime()).toBe(ctx.zmanim.misheyakir.getTime());
    expect(w!.end.getTime()).toBe(ctx.zmanim.shkia.getTime());
  });

  // omerDayFor answers "which count is due on the night that OPENS at tzeit of this day", and that
  // night already belongs to the next Hebrew day — so the evening of 25 Nisan opens night 11.
  it('the evening of 25 Nisan opens omer night 11', () => {
    // Without a zone both HDate and omerDayFor read the device's calendar date.
    const april12 = new Date(2026, 3, 12, 12);
    const hd = new HDate(april12);
    expect(hd.getMonthName()).toBe('Nisan');
    expect(hd.getDate()).toBe(25);
    expect(omerDayFor(april12)).toBe(11);
  });

  it('a reminder that rotates body variants shows its first variant as the label', () => {
    const rotating = MITZVOT.flatMap((m) =>
      m.defaultReminders.flatMap((reminder) =>
        reminder.bodyVariants ? [{ id: m.id, label: reminder.label, first: reminder.bodyVariants[0] }] : [],
      ),
    );
    expect(rotating.map((r) => r.id)).toContain('krias_shma_shacharit');
    expect(rotating.map(({ id, label }) => ({ id, label }))).toEqual(
      rotating.map(({ id, first }) => ({ id, label: first })),
    );
  });

  it('candle lighting returns null on non-Friday', () => {
    const monday = new Date('2026-04-20T12:00:00Z');
    const w = findMitzvah('candle_lighting')!.computeWindow(ctxFor(monday));
    expect(w).toBeNull();
  });
});
