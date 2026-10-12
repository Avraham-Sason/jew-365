jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

import { MITZVOT } from '../mitzvot';
import { CITIES } from '../cities';
import { customToMitzvah } from '../customMitzvotAdapter';
import { HebcalService } from '@/services/HebcalService';
import { at, zmanimFor } from '@/testing/zmanim';
import { CustomMitzvah, UserSettings } from '@/types/mitzvah';
import { categoryForWindow } from '@/utils/customMitzvah';

describe('Mitzvot extras', () => {
  it('7.2 nusach options match supported set', () => {
    const all = ['ashkenaz', 'sefard', 'edot_hamizrach', 'chabad'];
    for (const m of MITZVOT) {
      for (const n of m.nuschaotSupported) {
        expect(all).toContain(n);
      }
      expect(m.nuschaotSupported.length).toBeGreaterThan(0);
    }
  });

  // Named "at least one" but only asserted `Array.isArray`, so `defaultReminders: []` passed — a
  // mitzvah that shows up everywhere in the UI and can never notify.
  it('11.4 every mitzvah has at least one usable defaultReminder', () => {
    for (const m of MITZVOT) {
      expect(m.defaultReminders.length).toBeGreaterThan(0);
      for (const reminder of m.defaultReminders) {
        expect(reminder.label.trim().length).toBeGreaterThan(0);
        expect(['start', 'end']).toContain(reminder.anchor);
        expect(Number.isFinite(reminder.offsetMin)).toBe(true);
      }
    }
  });

  // A duration in the text that disagrees with the offset tells the user they have more time than
  // they do — tefillin promised "an hour" while firing 45 minutes before the window closed.
  it('11.4b end-anchored labels that name a duration match their offset', () => {
    for (const m of MITZVOT) {
      for (const reminder of m.defaultReminders) {
        if (reminder.anchor !== 'end') continue;
        const stated = /(\d+)\s*דק/.exec(reminder.label);
        if (stated) expect(Number(stated[1])).toBe(Math.abs(reminder.offsetMin));
        if (/נותרה שעה/.test(reminder.label)) expect(Math.abs(reminder.offsetMin)).toBe(60);
      }
    }
  });

  it('every mitzvah has unique id', () => {
    const ids = MITZVOT.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every mitzvah has both he+en name', () => {
    for (const m of MITZVOT) {
      expect(m.name.he).toBeTruthy();
      expect(m.name.en).toBeTruthy();
    }
  });

  it('skipOn values are recognized tokens', () => {
    const allowed = new Set(['shabbat', 'yomtov', 'cholHamoed', 'fastDay']);
    for (const m of MITZVOT) {
      for (const s of m.skipOn) {
        expect(allowed.has(s)).toBe(true);
      }
    }
  });
});

describe('shouldSkip via HebcalService (16.1, 16.2 extra)', () => {
  it('16.1 — Saturday gregorian flagged as shabbat (current behavior, BUG-001)', () => {
    const sat = new Date(2026, 3, 25, 12); // no location: the device's Gregorian Saturday
    expect(HebcalService.isShabbat(sat)).toBe(true);
  });

  it('16.1 BUG-001 — isShabbat halachic with location (Friday after shkia = true)', () => {
    // With location, detect Friday-after-shkia as Shabbat.
    const friday = new Date('2026-04-24T20:00:00Z'); // Friday, 23:00 Jerusalem — past shkia
    expect(HebcalService.isShabbat(friday, CITIES[0])).toBe(true);
    // Saturday midday still Shabbat
    const sat = new Date('2026-04-25T10:00:00Z');
    expect(HebcalService.isShabbat(sat, CITIES[0])).toBe(true);
    // Sunday not Shabbat
    const sun = new Date('2026-04-26T10:00:00Z');
    expect(HebcalService.isShabbat(sun, CITIES[0])).toBe(false);
  });

  // Was `expect(typeof tested).toBe('boolean')` — a tautology. The boundary behaviour now lives in
  // HebcalService.test.ts (2.5b/2.5c); this one guards the `il` flag, which decides whether the
  // second day of a chag is Yom Tov at all.
  it('16.2 16 Nisan is chol hamoed in Israel and second-day Yom Tov in chu"l', () => {
    const sixteenNisan = '2026-04-03T12:00';
    const newYork = CITIES.find((c) => c.nameEn === 'New York')!;

    expect(HebcalService.isYomTov(at(CITIES[0], sixteenNisan), CITIES[0])).toBe(false);
    expect(HebcalService.isYomTov(at(newYork, sixteenNisan), newYork)).toBe(true);
  });
});

describe('Zmanim sanity (covers more of zone 1)', () => {
  it('1.x getZmanim returns non-null fields for Jerusalem today', () => {
    const z = zmanimFor(new Date('2026-04-23T10:00:00Z'), CITIES[0]);
    expect(z.alotHaShachar).toBeInstanceOf(Date);
    expect(z.netzHaChama).toBeInstanceOf(Date);
    expect(z.shkia).toBeInstanceOf(Date);
    expect(z.tzeitHakochavim).toBeInstanceOf(Date);
    expect(z.chatzot).toBeInstanceOf(Date);
  });

  it('1.x zmanim are monotonically increasing', () => {
    const z = zmanimFor(new Date('2026-04-23T10:00:00Z'), CITIES[0]);
    expect(z.alotHaShachar.getTime()).toBeLessThan(z.netzHaChama.getTime());
    expect(z.netzHaChama.getTime()).toBeLessThan(z.chatzot.getTime());
    expect(z.chatzot.getTime()).toBeLessThan(z.shkia.getTime());
    expect(z.shkia.getTime()).toBeLessThan(z.tzeitHakochavim.getTime());
  });
});

describe('nusach filtering', () => {
  it('getAllMitzvot honours nuschaotSupported and returns everything when unfiltered', () => {
    const { getAllMitzvot } = require('@/data/customMitzvotAdapter');
    const all = getAllMitzvot();
    expect(all.length).toBeGreaterThan(0);
    expect(getAllMitzvot('ashkenaz').length).toBe(
      all.filter((m: { nuschaotSupported: string[] }) => m.nuschaotSupported.includes('ashkenaz')).length,
    );

    const restricted = { ...all[0], id: 'chabad_only', nuschaotSupported: ['chabad'] };
    const filter = (nusach: string) =>
      [...all, restricted].filter((m: { nuschaotSupported: string[] }) => m.nuschaotSupported.includes(nusach));
    expect(filter('chabad').map((m: { id: string }) => m.id)).toContain('chabad_only');
    expect(filter('ashkenaz').map((m: { id: string }) => m.id)).not.toContain('chabad_only');
  });
});

const customMitzvah = (overrides: Partial<CustomMitzvah> = {}): CustomMitzvah => ({
  id: 'custom_1_a',
  name: 'לימוד',
  startHHMM: '08:00',
  endHHMM: '12:00',
  reminders: [{ anchor: 'start', offsetMin: 0, label: 'זמן ללמוד' }],
  skipOn: [],
  createdAt: 1,
  ...overrides,
});

describe('custom mitzvah reminders', () => {
  it('drops stored bodyVariants, so only registry mitzvot rotate their notification body', () => {
    const custom = customMitzvah({
      reminders: [{ anchor: 'start', offsetMin: 0, label: 'זמן ללמוד', bodyVariants: ['א', 'ב'] }],
    });
    const [reminder] = customToMitzvah(custom).defaultReminders;
    expect(reminder).toEqual({ anchor: 'start', offsetMin: 0, label: 'זמן ללמוד' });
    expect(custom.reminders[0].bodyVariants).toEqual(['א', 'ב']);
  });
});

describe('custom mitzvah category', () => {
  it.each([
    ['08:00', '12:00', 'daily-morning'],
    ['06:00', '20:00', 'daily-allday'],
    ['23:00', '01:00', 'daily-evening'],
    ['22:00', '08:00', 'daily-allday'],
    ['08:00', '08:00', 'daily-allday'],
  ])('%s to %s is derived as %s', (startHHMM, endHHMM, expected) => {
    const mitzvah = customToMitzvah(customMitzvah({ startHHMM, endHHMM }));
    expect(mitzvah.category).toBe(expected);
    expect(mitzvah.category).toBe(categoryForWindow(startHHMM, endHHMM));
  });

  it('ignores a category key left on a mitzvah stored before the category was derived', () => {
    const stored = { ...customMitzvah({ startHHMM: '17:00', endHHMM: '19:00' }), category: 'learning' };
    expect(customToMitzvah(stored).category).toBe('daily-evening');
  });
});

describe('custom mitzvah active days', () => {
  const JERUSALEM = CITIES[0];
  const SETTINGS: UserSettings = { nusach: 'ashkenaz', halachicOpinions: { ksSofZman: 'GRA' }, inIsrael: true };
  const windowOn = (custom: CustomMitzvah, date: Date) =>
    customToMitzvah(custom).computeWindow({
      date,
      location: JERUSALEM,
      settings: SETTINGS,
      zmanim: zmanimFor(date, JERUSALEM),
    });
  const SUNDAY = new Date(2026, 9, 11);
  const SATURDAY = new Date(2026, 9, 17);
  const WEEK = Array.from({ length: 7 }, (_, offset) => new Date(2026, 9, 11 + offset));
  const sundayToThursday = customMitzvah({ activeDays: [0, 1, 2, 3, 4] });

  it('has no window on a day that is not listed, and a window at the configured hours on one that is', () => {
    expect(SATURDAY.getDay()).toBe(6);
    expect(windowOn(sundayToThursday, SATURDAY)).toBeNull();
    const nextSunday = new Date(2026, 9, 18);
    expect(nextSunday.getDay()).toBe(0);
    const window = windowOn(sundayToThursday, nextSunday);
    expect(window?.start.getTime()).toBe(at(JERUSALEM, '2026-10-18T08:00').getTime());
    expect(window?.end.getTime()).toBe(at(JERUSALEM, '2026-10-18T12:00').getTime());
  });

  it('judges each weekday of a week against the list', () => {
    expect(SUNDAY.getDay()).toBe(0);
    expect(WEEK.map((day) => windowOn(sundayToThursday, day) !== null)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it('is active every day when no days are set', () => {
    const everyDay = customMitzvah({ activeDays: undefined });
    expect(WEEK.map((day) => windowOn(everyDay, day) !== null)).toEqual([true, true, true, true, true, true, true]);
    expect(windowOn(everyDay, SATURDAY)).not.toBeNull();
  });

  it('never has a window with an empty list', () => {
    expect(WEEK.some((day) => windowOn(customMitzvah({ activeDays: [] }), day) !== null)).toBe(false);
  });
});

describe('custom mitzvah windows across midnight', () => {
  const JERUSALEM = CITIES[0];
  const LOS_ANGELES = CITIES.find((city) => city.tz === 'America/Los_Angeles')!;
  const SETTINGS: UserSettings = { nusach: 'ashkenaz', halachicOpinions: { ksSofZman: 'GRA' }, inIsrael: true };
  const windowOn = (custom: CustomMitzvah, date: Date, location = JERUSALEM) =>
    customToMitzvah(custom).computeWindow({
      date,
      location,
      settings: SETTINGS,
      zmanim: zmanimFor(date, location),
    });
  const minutesBetween = (window: NonNullable<ReturnType<typeof windowOn>>) =>
    (window.end.getTime() - window.start.getTime()) / 60_000;

  it('ends an overnight window the next calendar day at the end clock of the location', () => {
    const window = windowOn(customMitzvah({ startHHMM: '22:00', endHHMM: '01:00' }), new Date(2026, 10, 11));
    expect(window?.start.getTime()).toBe(at(JERUSALEM, '2026-11-11T22:00').getTime());
    expect(window?.end.getTime()).toBe(at(JERUSALEM, '2026-11-12T01:00').getTime());
    expect(minutesBetween(window!)).toBe(180);
  });

  it.each([
    ['a month end', new Date(2026, 9, 31), '2026-10-31T22:00', '2026-11-01T01:00'],
    ['a year end', new Date(2026, 11, 31), '2026-12-31T22:00', '2027-01-01T01:00'],
  ])('rolls an overnight window over %s', (_name, day, startClock, endClock) => {
    const window = windowOn(customMitzvah({ startHHMM: '22:00', endHHMM: '01:00' }), day);
    expect(window?.start.getTime()).toBe(at(JERUSALEM, startClock).getTime());
    expect(window?.end.getTime()).toBe(at(JERUSALEM, endClock).getTime());
  });

  it('reads an overnight window on the clock of the location, not of the device', () => {
    const window = windowOn(
      customMitzvah({ startHHMM: '23:30', endHHMM: '00:15' }),
      new Date(2026, 10, 11),
      LOS_ANGELES,
    );
    expect(window?.start.getTime()).toBe(at(LOS_ANGELES, '2026-11-11T23:30').getTime());
    expect(window?.end.getTime()).toBe(at(LOS_ANGELES, '2026-11-12T00:15').getTime());
  });

  it.each([
    ['08:00', '08:00', '2026-11-11T08:00', '2026-11-12T08:00'],
    ['00:00', '00:00', '2026-11-11T00:00', '2026-11-12T00:00'],
    ['23:59', '23:59', '2026-11-11T23:59', '2026-11-12T23:59'],
  ])('lasts 24 hours from %s to %s on a normal day', (startHHMM, endHHMM, startClock, endClock) => {
    const window = windowOn(customMitzvah({ startHHMM, endHHMM }), new Date(2026, 10, 11));
    expect(window?.start.getTime()).toBe(at(JERUSALEM, startClock).getTime());
    expect(window?.end.getTime()).toBe(at(JERUSALEM, endClock).getTime());
    expect(minutesBetween(window!)).toBe(1440);
  });

  it('keeps a same-day window on its own day', () => {
    const window = windowOn(customMitzvah({ startHHMM: '00:00', endHHMM: '23:59' }), new Date(2026, 10, 11));
    expect(window?.end.getTime()).toBe(at(JERUSALEM, '2026-11-11T23:59').getTime());
    expect(minutesBetween(window!)).toBe(1439);
  });

  it('judges the active days on the day the window starts', () => {
    const sundayToThursday = customMitzvah({ startHHMM: '22:00', endHHMM: '01:00', activeDays: [0, 1, 2, 3, 4] });
    const thursday = new Date(2026, 9, 15);
    const friday = new Date(2026, 9, 16);
    const saturday = new Date(2026, 9, 17);
    expect([thursday.getDay(), friday.getDay(), saturday.getDay()]).toEqual([4, 5, 6]);
    const window = windowOn(sundayToThursday, thursday);
    expect(window?.end.getTime()).toBe(at(JERUSALEM, '2026-10-16T01:00').getTime());
    expect(windowOn(sundayToThursday, friday)).toBeNull();
    expect(windowOn(sundayToThursday, saturday)).toBeNull();
  });

  it.each([
    ['Jerusalem, spring forward', JERUSALEM, new Date(2026, 2, 26), '22:00', '06:00', '2026-03-27T06:00', 420],
    ['Jerusalem, fall back', JERUSALEM, new Date(2026, 9, 24), '22:00', '06:00', '2026-10-25T06:00', 540],
    ['Los Angeles, spring forward', LOS_ANGELES, new Date(2026, 2, 7), '22:00', '06:00', '2026-03-08T06:00', 420],
    ['Los Angeles, fall back', LOS_ANGELES, new Date(2026, 9, 31), '22:00', '06:00', '2026-11-01T06:00', 540],
    [
      'Jerusalem, full day over the spring change',
      JERUSALEM,
      new Date(2026, 2, 26),
      '08:00',
      '08:00',
      '2026-03-27T08:00',
      1380,
    ],
    [
      'Los Angeles, full day over the fall change',
      LOS_ANGELES,
      new Date(2026, 9, 31),
      '08:00',
      '08:00',
      '2026-11-01T08:00',
      1500,
    ],
  ])('%s: ends at the wall clock of the next day', (_name, location, day, startHHMM, endHHMM, endClock, minutes) => {
    const window = windowOn(customMitzvah({ startHHMM, endHHMM }), day, location);
    expect(window?.end.getTime()).toBe(at(location, endClock).getTime());
    expect(minutesBetween(window!)).toBe(minutes);
  });

  it('keeps the configured length when a spring-forward gap swallows the start', () => {
    const window = windowOn(customMitzvah({ startHHMM: '02:30', endHHMM: '03:00' }), new Date(2026, 2, 27));
    expect(window).not.toBeNull();
    expect(minutesBetween(window!)).toBe(30);
  });
});
