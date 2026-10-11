import { HDate, HebrewCalendar, months } from '@hebcal/core';
import {
  isRoshChodeshDay,
  roshChodeshLabel,
  roshChodeshMonth,
  startsRoshChodesh,
  upcomingRoshChodesh,
} from '../roshChodesh';

const tishrei30 = new HDate(30, months.TISHREI, 5787);
const cheshvan1 = new HDate(1, months.CHESHVAN, 5787);

const hebcalRoshChodesh = (day: HDate) =>
  (HebrewCalendar.getHolidaysOnDate(day, false) ?? []).filter((event) => event.getDesc().startsWith('Rosh Chodesh'));

describe('isRoshChodeshDay', () => {
  it('holds for the 30th of a full month and the 1st of a month, but not for 1 Tishrei', () => {
    expect(isRoshChodeshDay(tishrei30)).toBe(true);
    expect(isRoshChodeshDay(cheshvan1)).toBe(true);
    expect(isRoshChodeshDay(new HDate(1, months.TISHREI, 5787))).toBe(false);
    expect(isRoshChodeshDay(new HDate(29, months.TISHREI, 5787))).toBe(false);
    expect(isRoshChodeshDay(new HDate(2, months.CHESHVAN, 5787))).toBe(false);
  });

  it('agrees with hebcal on every day of ten Hebrew years, and names the new month on both days', () => {
    let seen = 0;
    for (let year = 5786; year <= 5795; year++) {
      const first = new HDate(1, months.TISHREI, year).abs();
      const last = new HDate(1, months.TISHREI, year + 1).abs();
      for (let abs = first; abs < last; abs++) {
        const day = new HDate(abs);
        const events = hebcalRoshChodesh(day);
        expect(isRoshChodeshDay(day)).toBe(events.length > 0);
        if (events.length) {
          seen++;
          expect(events[0].getDesc()).toBe(`Rosh Chodesh ${roshChodeshMonth(day).getMonthName()}`);
        }
      }
    }
    expect(seen).toBeGreaterThan(170);
  });
});

describe('startsRoshChodesh', () => {
  it('holds on the first day only: 30 Tishrei starts it, 1 Cheshvan continues it', () => {
    expect(startsRoshChodesh(tishrei30)).toBe(true);
    expect(startsRoshChodesh(cheshvan1)).toBe(false);
  });

  it('holds on the 1st when the month before has 29 days', () => {
    expect(HDate.daysInMonth(months.TEVET, 5787)).toBe(29);
    expect(startsRoshChodesh(new HDate(1, months.SHVAT, 5787))).toBe(true);
    expect(HDate.daysInMonth(months.CHESHVAN, 5786)).toBe(29);
    expect(startsRoshChodesh(new HDate(1, months.KISLEV, 5786))).toBe(true);
  });

  it('does not hold on 1 Tishrei', () => {
    expect(startsRoshChodesh(new HDate(1, months.TISHREI, 5787))).toBe(false);
  });
});

describe('roshChodeshMonth', () => {
  it('names the 1st of the new month from either day', () => {
    expect(roshChodeshMonth(tishrei30).abs()).toBe(cheshvan1.abs());
    expect(roshChodeshMonth(cheshvan1).abs()).toBe(cheshvan1.abs());
  });

  it('moves the 30th of Shvat to the first Adar of a leap year and to the one Adar otherwise', () => {
    expect(HDate.isLeapYear(5787)).toBe(true);
    expect(HDate.isLeapYear(5786)).toBe(false);
    expect(roshChodeshLabel(roshChodeshMonth(new HDate(30, months.SHVAT, 5787)), 'en')).toBe('Adar I');
    expect(roshChodeshLabel(roshChodeshMonth(new HDate(30, months.SHVAT, 5786)), 'en')).toBe('Adar');
  });
});

describe('roshChodeshLabel', () => {
  it('writes the Hebrew month name without nikud and the English one as hebcal spells it', () => {
    expect(roshChodeshLabel(cheshvan1, 'he')).toBe('חשון');
    expect(roshChodeshLabel(cheshvan1, 'en')).toBe('Cheshvan');
    expect(roshChodeshLabel(new HDate(1, months.SHVAT, 5787), 'he')).toBe('שבט');
    expect(roshChodeshLabel(new HDate(1, months.TAMUZ, 5787), 'en')).toBe('Tamuz');
  });

  it('tells the two Adars of a leap year apart and writes a plain Adar otherwise', () => {
    expect(roshChodeshLabel(new HDate(1, months.ADAR_I, 5787), 'he')).toBe('אדר א׳');
    expect(roshChodeshLabel(new HDate(1, months.ADAR_II, 5787), 'he')).toBe('אדר ב׳');
    expect(roshChodeshLabel(new HDate(1, months.ADAR_I, 5787), 'en')).toBe('Adar I');
    expect(roshChodeshLabel(new HDate(1, months.ADAR_II, 5787), 'en')).toBe('Adar II');
    expect(roshChodeshLabel(new HDate(1, months.ADAR_I, 5786), 'he')).toBe('אדר');
    expect(roshChodeshLabel(new HDate(1, months.ADAR_I, 5786), 'en')).toBe('Adar');
  });
});

describe('upcomingRoshChodesh', () => {
  const upcoming = upcomingRoshChodesh(new HDate(15, months.TISHREI, 5787), 8);
  const monthNames = upcoming.map(({ month }) => roshChodeshLabel(month, 'en'));

  it('lists the next occurrences in order, starting with Cheshvan as a two-day Rosh Chodesh', () => {
    expect(upcoming).toHaveLength(8);
    expect(upcoming[0].first.abs()).toBe(tishrei30.abs());
    expect(upcoming[0].days).toBe(2);
    expect(upcoming[0].month.abs()).toBe(cheshvan1.abs());
    expect(monthNames).toEqual(['Cheshvan', 'Kislev', 'Tevet', "Sh'vat", 'Adar I', 'Adar II', 'Nisan', 'Iyyar']);
    upcoming.forEach(({ first }, index) => {
      if (index > 0) expect(first.abs()).toBeGreaterThan(upcoming[index - 1].first.abs());
    });
  });

  it('counts a one-day Rosh Chodesh as one day, and a two-day one as two', () => {
    const days = Object.fromEntries(upcoming.map(({ month, days }) => [roshChodeshLabel(month, 'en'), days]));
    expect(days).toEqual({
      Cheshvan: 2,
      Kislev: 2,
      Tevet: 2,
      "Sh'vat": 1,
      'Adar I': 2,
      'Adar II': 2,
      Nisan: 1,
      Iyyar: 2,
    });
  });

  it('keeps an occurrence whose second day is today, and drops one that ended yesterday', () => {
    const secondDay = upcomingRoshChodesh(cheshvan1, 2);
    expect(secondDay[0].first.abs()).toBe(tishrei30.abs());
    expect(roshChodeshLabel(secondDay[1].month, 'en')).toBe('Kislev');

    const dayAfter = upcomingRoshChodesh(new HDate(2, months.CHESHVAN, 5787), 1);
    expect(roshChodeshLabel(dayAfter[0].month, 'en')).toBe('Kislev');
  });

  it('keeps a one-day Rosh Chodesh on its own day and moves past it the day after', () => {
    const shvat1 = new HDate(1, months.SHVAT, 5787);
    expect(upcomingRoshChodesh(shvat1, 1)[0].first.abs()).toBe(shvat1.abs());
    expect(roshChodeshLabel(upcomingRoshChodesh(shvat1.next(), 1)[0].month, 'en')).toBe('Adar I');
  });

  it('returns nothing for a count of zero', () => {
    expect(upcomingRoshChodesh(tishrei30, 0)).toEqual([]);
  });
});
