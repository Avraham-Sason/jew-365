import { appDay, appDayEnd, appDayKey, locationNoon } from '../locationDay';
import { calendarDay } from '../checkIn';
import { CITIES, findCityById } from '@/data/cities';
import { dateKey } from '@/stores/useCompletionsStore';
import { ZmanimService } from '@/services/ZmanimService';
import { at, zmanimFor } from '@/testing/zmanim';
import { Location } from '@/types/zmanim';

const JERUSALEM = CITIES[0];
const LOS_ANGELES = findCityById('los-angeles')!;
const LONDON = findCityById('london')!;
const LONGYEARBYEN: Location = {
  name: 'Longyearbyen',
  lat: 78.2232,
  lng: 15.6267,
  tz: 'Arctic/Longyearbyen',
  inIsrael: false,
};

const alotOf = (key: string, location: Location) =>
  zmanimFor(locationNoon(calendarDay(key), location), location).alotHaShachar;
const keyAt = (location: Location, wallClock: string) => appDayKey(at(location, wallClock), location);

describe('the app day turns at alot hashachar at the location', () => {
  it('1. is the location date by day and the previous date from local midnight until alot', () => {
    expect(keyAt(JERUSALEM, '2026-10-12T12:00')).toBe('2026-10-12');
    expect(keyAt(JERUSALEM, '2026-10-12T23:59')).toBe('2026-10-12');
    expect(keyAt(JERUSALEM, '2026-10-13T00:30')).toBe('2026-10-12');
    expect(keyAt(JERUSALEM, '2026-10-13T05:00')).toBe('2026-10-12');
    expect(keyAt(JERUSALEM, '2026-10-13T06:00')).toBe('2026-10-13');
  });

  it('2. turns exactly at alot, and the day ends at that same instant', () => {
    const alot = alotOf('2026-10-13', JERUSALEM);
    expect(appDayKey(alot, JERUSALEM)).toBe('2026-10-13');
    expect(appDayKey(new Date(alot.getTime() - 1), JERUSALEM)).toBe('2026-10-12');
    expect(appDayEnd(calendarDay('2026-10-12'), JERUSALEM).getTime()).toBe(alot.getTime());
  });

  it('3. depends only on the instant and the location, not on the device zone', () => {
    const day = appDay(at(LOS_ANGELES, '2026-10-12T22:00'), LOS_ANGELES);
    expect(dateKey(day)).toBe('2026-10-12');
    expect(day.getHours()).toBe(0);
    expect(keyAt(JERUSALEM, '2026-10-13T02:00')).toBe('2026-10-12');
  });

  it('4. follows the Los Angeles fall-back night of 2026-11-01', () => {
    expect(keyAt(LOS_ANGELES, '2026-11-01T00:30')).toBe('2026-10-31');
    expect(keyAt(LOS_ANGELES, '2026-11-01T04:30')).toBe('2026-10-31');
    expect(keyAt(LOS_ANGELES, '2026-11-01T05:30')).toBe('2026-11-01');
    expect(appDayEnd(calendarDay('2026-10-31'), LOS_ANGELES).getTime()).toBe(
      alotOf('2026-11-01', LOS_ANGELES).getTime(),
    );
  });

  it('5. follows the Los Angeles spring-forward night of 2027-03-14', () => {
    expect(keyAt(LOS_ANGELES, '2027-03-14T01:30')).toBe('2027-03-13');
    expect(keyAt(LOS_ANGELES, '2027-03-14T03:30')).toBe('2027-03-13');
    expect(keyAt(LOS_ANGELES, '2027-03-14T06:15')).toBe('2027-03-14');
  });

  it('6. follows both Jerusalem DST nights', () => {
    expect(keyAt(JERUSALEM, '2026-10-25T00:30')).toBe('2026-10-24');
    expect(keyAt(JERUSALEM, '2026-10-25T03:00')).toBe('2026-10-24');
    expect(keyAt(JERUSALEM, '2026-10-25T05:00')).toBe('2026-10-25');
    expect(keyAt(JERUSALEM, '2027-03-26T01:30')).toBe('2027-03-25');
    expect(keyAt(JERUSALEM, '2027-03-26T03:30')).toBe('2027-03-25');
    expect(keyAt(JERUSALEM, '2027-03-26T05:45')).toBe('2027-03-26');
    expect(appDayEnd(calendarDay('2026-10-24'), JERUSALEM).getTime()).toBe(alotOf('2026-10-25', JERUSALEM).getTime());
    expect(appDayEnd(calendarDay('2027-03-25'), JERUSALEM).getTime()).toBe(alotOf('2027-03-26', JERUSALEM).getTime());
  });

  it('7. follows the London DST nights', () => {
    expect(keyAt(LONDON, '2026-10-25T03:00')).toBe('2026-10-24');
    expect(keyAt(LONDON, '2026-10-25T05:30')).toBe('2026-10-25');
    expect(keyAt(LONDON, '2027-06-15T02:30')).toBe('2027-06-14');
    expect(keyAt(LONDON, '2027-06-15T04:15')).toBe('2027-06-15');
  });

  it('8. turns at 04:00 on the location clock where the sun never sets', () => {
    expect(ZmanimService.getZmanim(at(LONGYEARBYEN, '2026-06-18T12:00'), LONGYEARBYEN)).toBeNull();
    expect(keyAt(LONGYEARBYEN, '2026-06-18T03:59')).toBe('2026-06-17');
    expect(keyAt(LONGYEARBYEN, '2026-06-18T04:00')).toBe('2026-06-18');
    expect(appDayEnd(calendarDay('2026-06-17'), LONGYEARBYEN).getTime()).toBe(
      at(LONGYEARBYEN, '2026-06-18T04:00').getTime(),
    );
  });

  it.each([
    ['Jerusalem fall-back', JERUSALEM, '2026-10-24'],
    ['Jerusalem summer', JERUSALEM, '2027-06-14'],
    ['Los Angeles fall-back', LOS_ANGELES, '2026-10-31'],
    ['Longyearbyen midnight sun', LONGYEARBYEN, '2026-06-17'],
  ])('9. %s: appDayEnd closes exactly the instants appDay names', (_label, location, key) => {
    const end = appDayEnd(calendarDay(key), location);
    expect(appDayKey(new Date(end.getTime() - 1), location)).toBe(key);
    expect(appDayKey(end, location)).toBe(dateKey(calendarDay(key, 1)));
  });
});
