jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { HIGH: 'high' },
  AndroidNotificationVisibility: { PUBLIC: 'public' },
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  getStatusAsync: jest.fn(),
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
}));

// Previously this file re-declared its own copy of buildTriggerTime — the shipped one was not even
// exported, so a sign flip in the real implementation could never fail a test here.
import { buildTriggerTime } from '../NotificationScheduler';
import * as web from '../NotificationScheduler.web';
import { CITIES } from '@/data/cities';
import { at } from '@/testing/zmanim';
import { Reminder } from '@/types/mitzvah';
import type { Location } from '@/types/zmanim';

const JERUSALEM = CITIES[0];
const LONDON = CITIES.find((city) => city.cityId === 'london')!;
const NEW_YORK = CITIES.find((city) => city.cityId === 'new-york')!;
const EVENING_CLOCK = 20 * 60 + 30;

const window = {
  start: new Date(2026, 4, 6, 6, 0, 0),
  end: new Date(2026, 4, 6, 10, 0, 0),
};

describe('buildTriggerTime', () => {
  it('16.1 offsets forward from the window start', () => {
    const r: Reminder = { anchor: 'start', offsetMin: 30, label: 'x' };
    expect(buildTriggerTime(r, window, JERUSALEM).getTime()).toBe(window.start.getTime() + 30 * 60_000);
  });

  it('16.2 a zero offset fires exactly at the anchor', () => {
    expect(buildTriggerTime({ anchor: 'start', offsetMin: 0, label: 'x' }, window, JERUSALEM).getTime()).toBe(
      window.start.getTime(),
    );
    expect(buildTriggerTime({ anchor: 'end', offsetMin: 0, label: 'x' }, window, JERUSALEM).getTime()).toBe(
      window.end.getTime(),
    );
  });

  it('16.3 a negative offset on the end anchor lands BEFORE the window closes', () => {
    const r: Reminder = { anchor: 'end', offsetMin: -45, label: 'x' };
    const trigger = buildTriggerTime(r, window, JERUSALEM);
    expect(trigger.getTime()).toBe(window.end.getTime() - 45 * 60_000);
    expect(trigger.getTime()).toBeLessThan(window.end.getTime());
    expect(trigger.getTime()).toBeGreaterThan(window.start.getTime());
  });

  it('16.4 a positive offset on the end anchor lands after the window — the scheduler drops these', () => {
    const r: Reminder = { anchor: 'end', offsetMin: 30, label: 'x' };
    expect(buildTriggerTime(r, window, JERUSALEM).getTime()).toBeGreaterThan(window.end.getTime());
  });

  it('16.5 a start or end anchor ignores the location', () => {
    for (const anchor of ['start', 'end'] as const) {
      const r: Reminder = { anchor, offsetMin: 25, label: 'x' };
      const times = [JERUSALEM, LONDON, NEW_YORK].map((location) => buildTriggerTime(r, window, location).getTime());
      expect(new Set(times).size).toBe(1);
    }
  });

  it('16.6 the web shim exports the very same function', () => {
    expect(web.buildTriggerTime).toBe(buildTriggerTime);
  });
});

describe('buildTriggerTime with a clock anchor', () => {
  const clockAt = (offsetMin: number): Reminder => ({ anchor: 'clock', offsetMin, label: 'x' });
  const windowFrom = (location: Location, start: string) => ({
    start: at(location, start),
    end: new Date(at(location, start).getTime() + 24 * 60 * 60_000),
  });

  it.each([
    ['Jerusalem in winter', JERUSALEM, '2026-12-14T05:13', '2026-12-14T20:30'],
    ['Jerusalem in summer', JERUSALEM, '2027-06-14T04:05', '2027-06-14T20:30'],
    ['London in winter', LONDON, '2026-12-14T07:00', '2026-12-14T20:30'],
    ['London in summer', LONDON, '2027-06-14T03:30', '2027-06-14T20:30'],
    ['New York in winter', NEW_YORK, '2026-12-14T06:20', '2026-12-14T20:30'],
    ['New York in summer', NEW_YORK, '2027-06-14T03:35', '2027-06-14T20:30'],
  ])('lands on 20:30 of the window start day on the clock of the location: %s', (_label, location, start, expected) => {
    const trigger = buildTriggerTime(clockAt(EVENING_CLOCK), windowFrom(location, start), location);
    expect(trigger.getTime()).toBe(at(location, expected).getTime());
  });

  it('is the wall clock of the location, so the same minutes land on different instants in different zones', () => {
    const summerInstants = [JERUSALEM, LONDON, NEW_YORK].map((location) =>
      buildTriggerTime(clockAt(EVENING_CLOCK), windowFrom(location, '2027-06-14T03:00'), location).toISOString(),
    );
    expect(summerInstants).toEqual([
      '2027-06-14T17:30:00.000Z',
      '2027-06-14T19:30:00.000Z',
      '2027-06-15T00:30:00.000Z',
    ]);
  });

  it('moves to the next day when the clock time is before the window start', () => {
    const start = '2026-12-14T21:00';
    expect(buildTriggerTime(clockAt(EVENING_CLOCK), windowFrom(LONDON, start), LONDON).getTime()).toBe(
      at(LONDON, '2026-12-15T20:30').getTime(),
    );
    expect(buildTriggerTime(clockAt(30), windowFrom(NEW_YORK, '2026-12-14T05:00'), NEW_YORK).getTime()).toBe(
      at(NEW_YORK, '2026-12-15T00:30').getTime(),
    );
  });

  it('keeps the same day when the clock time is exactly the window start', () => {
    const start = '2026-12-14T20:30';
    expect(buildTriggerTime(clockAt(EVENING_CLOCK), windowFrom(JERUSALEM, start), JERUSALEM).getTime()).toBe(
      at(JERUSALEM, start).getTime(),
    );
  });

  it('keeps the wall clock across the day it moves on over a DST change', () => {
    const trigger = buildTriggerTime(clockAt(EVENING_CLOCK), windowFrom(LONDON, '2027-03-27T21:00'), LONDON);
    expect(trigger.toISOString()).toBe('2027-03-28T19:30:00.000Z');
  });

  it('puts a London wall time that spring forward skips (01:30 on 2027-03-28) an hour later', () => {
    const inTheGap = clockAt(90);
    expect(buildTriggerTime(inTheGap, windowFrom(LONDON, '2027-03-27T20:00'), LONDON).toISOString()).toBe(
      '2027-03-28T01:30:00.000Z',
    );
    expect(buildTriggerTime(inTheGap, windowFrom(LONDON, '2027-03-28T00:10'), LONDON).toISOString()).toBe(
      '2027-03-28T01:30:00.000Z',
    );
  });

  it('puts a New York wall time that spring forward skips (02:30 on 2027-03-14) an hour later', () => {
    const inTheGap = clockAt(150);
    expect(buildTriggerTime(inTheGap, windowFrom(NEW_YORK, '2027-03-13T20:00'), NEW_YORK).toISOString()).toBe(
      '2027-03-14T07:30:00.000Z',
    );
    expect(buildTriggerTime(inTheGap, windowFrom(NEW_YORK, '2027-03-14T00:10'), NEW_YORK).toISOString()).toBe(
      '2027-03-14T07:30:00.000Z',
    );
  });

  it('takes the first of the two London wall times that fall-back repeats (01:30 on 2026-10-25)', () => {
    const repeated = clockAt(90);
    expect(buildTriggerTime(repeated, windowFrom(LONDON, '2026-10-24T20:00'), LONDON).toISOString()).toBe(
      '2026-10-25T00:30:00.000Z',
    );
  });
});
