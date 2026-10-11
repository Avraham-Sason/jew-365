import { HDate, Locale, months } from '@hebcal/core';

export type RoshChodeshOccurrence = { first: HDate; days: 1 | 2; month: HDate };

export function isRoshChodeshDay(day: HDate): boolean {
  return day.getDate() === 30 || (day.getDate() === 1 && day.getMonth() !== months.TISHREI);
}

export function startsRoshChodesh(day: HDate): boolean {
  return isRoshChodeshDay(day) && !isRoshChodeshDay(day.prev());
}

export function roshChodeshMonth(day: HDate): HDate {
  return day.getDate() === 30 ? day.next() : day;
}

export function roshChodeshLabel(monthFirst: HDate, language: 'he' | 'en'): string {
  const name = monthFirst.getMonthName();
  return language === 'en' ? name : Locale.gettext(name, 'he-x-NoNikud');
}

export function upcomingRoshChodesh(today: HDate, count: number): RoshChodeshOccurrence[] {
  const found: RoshChodeshOccurrence[] = [];
  for (let abs = today.abs() - 1; found.length < count; abs++) {
    const first = new HDate(abs);
    if (!startsRoshChodesh(first)) continue;
    const days = first.getDate() === 30 ? 2 : 1;
    if (abs + days - 1 >= today.abs()) found.push({ first, days, month: roshChodeshMonth(first) });
  }
  return found;
}
