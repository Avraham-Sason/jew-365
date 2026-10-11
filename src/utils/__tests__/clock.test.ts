import { TIME_PATTERN, clockOf, clockRange, formatRemaining, timeToMinutes } from '../clock';
import { translate } from '@/i18n';

const he = (scope: string) => translate(scope, undefined, 'he');
const en = (scope: string) => translate(scope, undefined, 'en');
const MINUTE = 60_000;

describe('TIME_PATTERN', () => {
  it.each(['00:00', '08:05', '12:00', '19:59', '23:59'])('accepts %s', (value) => {
    expect(TIME_PATTERN.test(value)).toBe(true);
  });

  it.each(['24:00', '12:60', '8:00', '08:5', '0800', '08:00:00', ' 08:00', '', 'ab:cd'])('rejects "%s"', (value) => {
    expect(TIME_PATTERN.test(value)).toBe(false);
  });
});

describe('timeToMinutes', () => {
  it('counts minutes since midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('00:01')).toBe(1);
    expect(timeToMinutes('08:30')).toBe(510);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('orders a window the way the custom mitzvah form compares it', () => {
    expect(timeToMinutes('12:00')).toBeGreaterThan(timeToMinutes('08:00'));
    expect(timeToMinutes('09:59')).toBeLessThan(timeToMinutes('10:00'));
  });
});

describe('formatRemaining', () => {
  it.each([
    [0, "0 דק'"],
    [29_000, "0 דק'"],
    [31_000, "1 דק'"],
    [59 * MINUTE, "59 דק'"],
    [60 * MINUTE, '1:00 שעות'],
    [125 * MINUTE, '2:05 שעות'],
    [600 * MINUTE, '10:00 שעות'],
  ])('writes %d ms as "%s"', (ms, expected) => {
    expect(formatRemaining(ms, he)).toBe(expected);
  });

  it('floors a window that already closed at zero', () => {
    expect(formatRemaining(-5 * MINUTE, he)).toBe("0 דק'");
  });

  it('takes its unit words from the translator it is given', () => {
    expect(formatRemaining(59 * MINUTE, en)).toBe('59 min');
    expect(formatRemaining(125 * MINUTE, en)).toBe('2:05 h');
  });
});

describe('clockOf', () => {
  const instant = new Date('2026-05-06T08:30:00Z');
  const pad = (value: number) => String(value).padStart(2, '0');

  it('reads the device clock when no zone is given', () => {
    expect(clockOf(instant)).toBe(`${pad(instant.getHours())}:${pad(instant.getMinutes())}`);
  });

  it.each([
    ['UTC', '08:30'],
    ['Asia/Jerusalem', '11:30'],
    ['America/Los_Angeles', '01:30'],
    ['Pacific/Kiritimati', '22:30'],
  ])('reads the clock of %s as %s', (zone, expected) => {
    expect(clockOf(instant, zone)).toBe(expected);
  });

  it('pads single digits on both parts', () => {
    expect(clockOf(new Date('2026-05-06T00:05:00Z'), 'UTC')).toBe('00:05');
  });
});

describe('clockRange', () => {
  const heWith = (scope: string, options?: Record<string, unknown>) => translate(scope, options, 'he');
  const enWith = (scope: string, options?: Record<string, unknown>) => translate(scope, options, 'en');

  it('prints a window within one calendar day as two clocks', () => {
    const start = new Date(2026, 9, 12, 5, 27);
    const end = new Date(2026, 9, 12, 18, 5);
    expect(clockRange(start, end, heWith)).toBe('05:27 עד 18:05');
    expect(clockRange(start, end, enWith)).toBe('05:27 to 18:05');
    expect(clockRange(new Date(2026, 9, 12, 20, 15), new Date(2026, 9, 12, 23, 59), heWith)).toBe('20:15 עד 23:59');
  });

  it('says the end falls on the next day when it does, as the Chok LeYisrael day and a night window do', () => {
    const start = new Date(2026, 9, 12, 5, 27);
    const end = new Date(2026, 9, 13, 5, 28);
    expect(clockRange(start, end, heWith)).toBe('05:27 עד 05:28 למחרת');
    expect(clockRange(start, end, enWith)).toBe('05:27 to 05:28 the next day');
    expect(clockRange(new Date(2026, 9, 12, 20, 15), new Date(2026, 9, 13), heWith)).toBe('20:15 עד 00:00 למחרת');
  });
});
