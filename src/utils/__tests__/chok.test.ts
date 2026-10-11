import { HDate } from '@hebcal/core';
import {
  CHOK_SLOTS,
  VEZOT_HABERACHA,
  chokDayHasText,
  chokDoneDay,
  chokMakeUpsBefore,
  chokOpenMakeUps,
  chokParashiyot,
  chokPortionAt,
  chokPortionOn,
  chokSlotDay,
  chokSlotsOf,
  chokToday,
} from '../chok';
import type { ChokPortion } from '../chok';
import { CITIES } from '@/data/cities';
import { HebcalService } from '@/services/HebcalService';
import { ZmanimService } from '@/services/ZmanimService';
import { dateKey } from '@/stores/useCompletionsStore';
import { at, zmanimFor } from '@/testing/zmanim';
import { Location } from '@/types/zmanim';

const JERUSALEM = CITIES[0];
const LOS_ANGELES = CITIES.find((city) => city.nameEn === 'Los Angeles')!;
const LONGYEARBYEN: Location = {
  name: 'Longyearbyen',
  lat: 78.2232,
  lng: 15.6267,
  tz: 'Arctic/Longyearbyen',
  inIsrael: false,
};
const MINUTE = 60_000;

const day = (year: number, month: number, date: number) => new Date(year, month - 1, date);
const shabbatOfWeek = (year: number, month: number, date: number) => new HDate(day(year, month, date)).onOrAfter(6);
const minutesFrom = (instant: Date, minutes: number) => new Date(instant.getTime() + minutes * MINUTE);
const view = (portion: ChokPortion | null) =>
  portion && { parashiyot: portion.parashiyot, slot: portion.slot, shabbat: dateKey(portion.shabbat.greg()) };
const blockAround = (location: Location, wallClock: string) =>
  HebcalService.holyBlockAt(at(location, wallClock), location)!;

type Week = { label: string; sunday: [number, number, number]; il: string[]; diaspora: string[] };

const WEEKS: Week[] = [
  {
    label: 'Rosh Hashana on Shabbat 1 Tishrei 5787 gives the next parasha read',
    sunday: [2026, 9, 6],
    il: ["Ha'azinu"],
    diaspora: ["Ha'azinu"],
  },
  {
    label: 'Shabbat Shuva 5787 reads its own parasha',
    sunday: [2026, 9, 13],
    il: ["Ha'azinu"],
    diaspora: ["Ha'azinu"],
  },
  {
    label: 'the first day of Sukkot 5787 on Shabbat 15 Tishrei gives Vezot Haberakhah',
    sunday: [2026, 9, 20],
    il: ['Vezot Haberakhah'],
    diaspora: ['Vezot Haberakhah'],
  },
  {
    label: 'Shmini Atzeret 5787 on Shabbat 22 Tishrei gives Vezot Haberakhah',
    sunday: [2026, 9, 27],
    il: ['Vezot Haberakhah'],
    diaspora: ['Vezot Haberakhah'],
  },
  {
    label: 'the week after Simchat Torah 5787 is Bereshit',
    sunday: [2026, 10, 4],
    il: ['Bereshit'],
    diaspora: ['Bereshit'],
  },
  {
    label: 'Shabbat chol hamoed Pesach 5787 gives the next parasha read',
    sunday: [2027, 4, 18],
    il: ['Achrei Mot'],
    diaspora: ['Achrei Mot'],
  },
  {
    label: 'the week after Pesach 5787 reads Achrei Mot itself',
    sunday: [2027, 4, 25],
    il: ['Achrei Mot'],
    diaspora: ['Achrei Mot'],
  },
  {
    label: 'the second day of Shavuot 5787 on Shabbat abroad gives the next parasha read',
    sunday: [2027, 6, 6],
    il: ['Nasso'],
    diaspora: ['Nasso'],
  },
  {
    label: 'Israel and abroad diverge after Shavuot 5787',
    sunday: [2027, 6, 13],
    il: ["Beha'alotcha"],
    diaspora: ['Nasso'],
  },
  {
    label: 'Yom Kippur 5789 on Shabbat 10 Tishrei gives Vezot Haberakhah',
    sunday: [2028, 9, 24],
    il: ['Vezot Haberakhah'],
    diaspora: ['Vezot Haberakhah'],
  },
  {
    label: 'Shabbat chol hamoed Sukkot 5789 gives Vezot Haberakhah',
    sunday: [2028, 10, 1],
    il: ['Vezot Haberakhah'],
    diaspora: ['Vezot Haberakhah'],
  },
  {
    label: 'the week after Simchat Torah 5789 is Bereshit',
    sunday: [2028, 10, 8],
    il: ['Bereshit'],
    diaspora: ['Bereshit'],
  },
  {
    label: 'the first day of Pesach 5789 on Shabbat gives the next parasha read',
    sunday: [2029, 3, 25],
    il: ['Shmini'],
    diaspora: ['Shmini'],
  },
  {
    label: 'Pesach VIII 5789 on Shabbat abroad gives the parasha Israel reads that Shabbat',
    sunday: [2029, 4, 1],
    il: ['Shmini'],
    diaspora: ['Shmini'],
  },
  {
    label: 'Israel reads a double parasha while abroad catches up after Pesach 5789',
    sunday: [2029, 4, 8],
    il: ['Tazria', 'Metzora'],
    diaspora: ['Shmini'],
  },
  {
    label: 'Vayakhel-Pekudei 5788 is a double week',
    sunday: [2028, 3, 19],
    il: ['Vayakhel', 'Pekudei'],
    diaspora: ['Vayakhel', 'Pekudei'],
  },
  {
    label: 'Chukat-Balak 5787 is doubled abroad only',
    sunday: [2027, 7, 11],
    il: ['Balak'],
    diaspora: ['Chukat', 'Balak'],
  },
  {
    label: 'Matot-Masei 5787 is a double week',
    sunday: [2027, 7, 25],
    il: ['Matot', 'Masei'],
    diaspora: ['Matot', 'Masei'],
  },
];

describe('chokParashiyot', () => {
  it.each(WEEKS)('$label', ({ sunday, il, diaspora }) => {
    const shabbat = shabbatOfWeek(...sunday);
    expect(chokParashiyot(shabbat, true)).toEqual(il);
    expect(chokParashiyot(shabbat, false)).toEqual(diaspora);
  });
});

describe('chokSlotsOf', () => {
  it('lists the seven slots in order, and Vezot Haberakhah without Friday', () => {
    expect(CHOK_SLOTS).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'thuNight', 'fri']);
    expect(chokSlotsOf('Noach')).toEqual(CHOK_SLOTS);
    expect(VEZOT_HABERACHA).toBe('Vezot Haberakhah');
    expect(chokSlotsOf(VEZOT_HABERACHA)).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'thuNight']);
  });
});

describe('chokPortionAt in Jerusalem, the week of Vayetzei 5787', () => {
  const VAYETZEI = { parashiyot: ['Vayetzei'], shabbat: '2026-11-21' };
  const VAYISHLACH = { parashiyot: ['Vayishlach'], shabbat: '2026-11-28' };
  const portionAt = (instant: Date) => view(chokPortionAt(instant, JERUSALEM, true));

  it('names Thursday daytime thu', () => {
    expect(portionAt(at(JERUSALEM, '2026-11-19T12:00'))).toEqual({ ...VAYETZEI, slot: 'thu' });
  });

  it("opens Thursday night at Thursday's nightfall", () => {
    const nightfall = HebcalService.nightfall(zmanimFor(at(JERUSALEM, '2026-11-19T12:00'), JERUSALEM), JERUSALEM);
    expect(portionAt(minutesFrom(nightfall, -1))).toEqual({ ...VAYETZEI, slot: 'thu' });
    expect(portionAt(nightfall)).toEqual({ ...VAYETZEI, slot: 'thuNight' });
    expect(portionAt(at(JERUSALEM, '2026-11-19T20:00'))).toEqual({ ...VAYETZEI, slot: 'thuNight' });
  });

  it("keeps Thursday night until Friday's alot, then Friday", () => {
    const { alotHaShachar } = zmanimFor(at(JERUSALEM, '2026-11-20T12:00'), JERUSALEM);
    expect(portionAt(at(JERUSALEM, '2026-11-20T03:00'))).toEqual({ ...VAYETZEI, slot: 'thuNight' });
    expect(portionAt(minutesFrom(alotHaShachar, -1))).toEqual({ ...VAYETZEI, slot: 'thuNight' });
    expect(portionAt(alotHaShachar)).toEqual({ ...VAYETZEI, slot: 'fri' });
    expect(portionAt(at(JERUSALEM, '2026-11-20T08:00'))).toEqual({ ...VAYETZEI, slot: 'fri' });
  });

  it('keeps the previous learning day before alot: Monday 02:00 is still Sunday', () => {
    expect(portionAt(at(JERUSALEM, '2026-11-16T02:00'))).toEqual({ ...VAYETZEI, slot: 'sun' });
  });

  it('has nothing strictly inside Shabbat, whose candle lighting edge is still Friday', () => {
    const block = blockAround(JERUSALEM, '2026-11-21T12:00');
    expect(portionAt(block.start)).toEqual({ ...VAYETZEI, slot: 'fri' });
    expect(chokPortionAt(minutesFrom(block.start, 1), JERUSALEM, true)).toBeNull();
    expect(chokPortionAt(at(JERUSALEM, '2026-11-20T16:30'), JERUSALEM, true)).toBeNull();
    expect(chokPortionAt(at(JERUSALEM, '2026-11-21T12:00'), JERUSALEM, true)).toBeNull();
  });

  it("gives motzaei Shabbat from the block's exit to the next week's Sunday", () => {
    const block = blockAround(JERUSALEM, '2026-11-21T12:00');
    expect(chokPortionAt(minutesFrom(block.end, -1), JERUSALEM, true)).toBeNull();
    expect(portionAt(block.end)).toEqual({ ...VAYISHLACH, slot: 'sun' });
    expect(portionAt(at(JERUSALEM, '2026-11-21T20:00'))).toEqual({ ...VAYISHLACH, slot: 'sun' });
    expect(portionAt(at(JERUSALEM, '2026-11-22T03:00'))).toEqual({ ...VAYISHLACH, slot: 'sun' });
  });
});

describe('chokPortionAt in Los Angeles, abroad, the week of Nasso 5787', () => {
  const NASSO = { parashiyot: ['Nasso'], shabbat: '2027-06-19' };
  const portionAt = (wallClock: string) => view(chokPortionAt(at(LOS_ANGELES, wallClock), LOS_ANGELES, false));

  it('takes the parasha from the inIsrael argument', () => {
    expect(portionAt('2027-06-17T12:00')).toEqual({ ...NASSO, slot: 'thu' });
    expect(view(chokPortionAt(at(LOS_ANGELES, '2027-06-17T12:00'), LOS_ANGELES, true))).toEqual({
      parashiyot: ["Beha'alotcha"],
      slot: 'thu',
      shabbat: '2027-06-19',
    });
  });

  it('runs Thursday night from nightfall to Friday alot, then Friday', () => {
    expect(portionAt('2027-06-17T22:00')).toEqual({ ...NASSO, slot: 'thuNight' });
    expect(portionAt('2027-06-18T03:00')).toEqual({ ...NASSO, slot: 'thuNight' });
    expect(portionAt('2027-06-18T08:00')).toEqual({ ...NASSO, slot: 'fri' });
  });

  it('keeps Sunday until Monday alot', () => {
    expect(portionAt('2027-06-14T02:00')).toEqual({ ...NASSO, slot: 'sun' });
  });

  it('has nothing on Shabbat and the next week from motzaei Shabbat', () => {
    expect(chokPortionAt(at(LOS_ANGELES, '2027-06-19T12:00'), LOS_ANGELES, false)).toBeNull();
    expect(portionAt('2027-06-19T22:00')).toEqual({ parashiyot: ["Beha'alotcha"], slot: 'sun', shabbat: '2027-06-26' });
  });
});

describe('Yom Tov: Pesach 5787', () => {
  const ACHREI_MOT = { parashiyot: ['Achrei Mot'], shabbat: '2027-04-24' };

  it('has nothing on the first day in Jerusalem, at the instant or for the day', () => {
    expect(chokPortionAt(at(JERUSALEM, '2027-04-22T12:00'), JERUSALEM, true)).toBeNull();
    expect(chokPortionOn(day(2027, 4, 22), JERUSALEM, true)).toBeNull();
  });

  it('opens Thursday night at the exit of a Yom Tov that ends on Thursday', () => {
    const block = blockAround(JERUSALEM, '2027-04-22T12:00');
    expect(block.days).toEqual(['2027-04-22']);
    expect(chokPortionAt(minutesFrom(block.end, -1), JERUSALEM, true)).toBeNull();
    expect(view(chokPortionAt(block.end, JERUSALEM, true))).toEqual({ ...ACHREI_MOT, slot: 'thuNight' });
    expect(view(chokPortionAt(at(JERUSALEM, '2027-04-22T21:00'), JERUSALEM, true))).toEqual({
      ...ACHREI_MOT,
      slot: 'thuNight',
    });
  });

  it("learns chol hamoed Friday in Israel, but not on abroad's second day of Yom Tov", () => {
    expect(view(chokPortionOn(day(2027, 4, 23), JERUSALEM, true))).toEqual({ ...ACHREI_MOT, slot: 'fri' });
    expect(chokPortionOn(day(2027, 4, 23), LOS_ANGELES, false)).toBeNull();
  });

  it('moves to the next day after the exit of a mid-week Yom Tov: the seventh day of Pesach', () => {
    expect(view(chokPortionAt(at(JERUSALEM, '2027-04-28T21:00'), JERUSALEM, true))).toEqual({
      parashiyot: ['Achrei Mot'],
      slot: 'thu',
      shabbat: '2027-05-01',
    });
  });
});

describe('a Vezot Haberakhah week: Sukkot 5787 in Jerusalem', () => {
  const VEZOT = { parashiyot: ['Vezot Haberakhah'], shabbat: '2026-10-03' };

  it('learns Thursday and Thursday night', () => {
    expect(view(chokPortionOn(day(2026, 10, 1), JERUSALEM, true))).toEqual({ ...VEZOT, slot: 'thu' });
    expect(view(chokPortionAt(at(JERUSALEM, '2026-10-01T21:00'), JERUSALEM, true))).toEqual({
      ...VEZOT,
      slot: 'thuNight',
    });
  });

  it('has no Friday portion although Hoshana Raba is not a holy day', () => {
    expect(HebcalService.isHolyDay(at(JERUSALEM, '2026-10-02T12:00'), JERUSALEM)).toBe(false);
    expect(chokPortionOn(day(2026, 10, 2), JERUSALEM, true)).toBeNull();
    expect(chokPortionAt(at(JERUSALEM, '2026-10-02T08:00'), JERUSALEM, true)).toBeNull();
  });
});

describe('chokPortionOn', () => {
  const VAYETZEI = { parashiyot: ['Vayetzei'], shabbat: '2026-11-21' };
  const portionOn = (date: Date) => view(chokPortionOn(date, JERUSALEM, true));

  it('maps Sunday to Friday by weekday and never gives Thursday night', () => {
    expect(portionOn(day(2026, 11, 15))).toEqual({ ...VAYETZEI, slot: 'sun' });
    expect(portionOn(day(2026, 11, 19))).toEqual({ ...VAYETZEI, slot: 'thu' });
    expect(portionOn(day(2026, 11, 20))).toEqual({ ...VAYETZEI, slot: 'fri' });
  });

  it('has nothing on Shabbat or on Yom Kippur', () => {
    expect(chokPortionOn(day(2026, 11, 21), JERUSALEM, true)).toBeNull();
    expect(chokPortionOn(day(2026, 9, 21), JERUSALEM, true)).toBeNull();
  });

  it('reads the device calendar day as the same date at a location west of the device', () => {
    expect(view(chokPortionOn(day(2027, 6, 17), LOS_ANGELES, false))).toEqual({
      parashiyot: ['Nasso'],
      slot: 'thu',
      shabbat: '2027-06-19',
    });
  });
});

describe('chokMakeUpsBefore', () => {
  it('lists the earlier days of the week from Sunday', () => {
    expect(chokMakeUpsBefore(day(2026, 11, 18), JERUSALEM, true)).toEqual([
      { dateKey: '2026-11-15', slot: 'sun', holy: false },
      { dateKey: '2026-11-16', slot: 'mon', holy: false },
      { dateKey: '2026-11-17', slot: 'tue', holy: false },
    ]);
  });

  it('has nothing to make up on Sunday', () => {
    expect(chokMakeUpsBefore(day(2026, 11, 15), JERUSALEM, true)).toEqual([]);
  });

  it('keeps a Yom Tov day in the list, flagged holy', () => {
    expect(chokMakeUpsBefore(day(2027, 4, 23), JERUSALEM, true)).toEqual([
      { dateKey: '2027-04-18', slot: 'sun', holy: false },
      { dateKey: '2027-04-19', slot: 'mon', holy: false },
      { dateKey: '2027-04-20', slot: 'tue', holy: false },
      { dateKey: '2027-04-21', slot: 'wed', holy: false },
      { dateKey: '2027-04-22', slot: 'thu', holy: true },
    ]);
    expect(chokMakeUpsBefore(day(2026, 9, 23), JERUSALEM, true)).toEqual([
      { dateKey: '2026-09-20', slot: 'sun', holy: false },
      { dateKey: '2026-09-21', slot: 'mon', holy: true },
      { dateKey: '2026-09-22', slot: 'tue', holy: false },
    ]);
  });

  it('judges holiness by the location: the eighth day of Pesach is Yom Tov abroad only', () => {
    expect(chokMakeUpsBefore(day(2027, 4, 30), LOS_ANGELES, false)).toEqual([
      { dateKey: '2027-04-25', slot: 'sun', holy: false },
      { dateKey: '2027-04-26', slot: 'mon', holy: false },
      { dateKey: '2027-04-27', slot: 'tue', holy: false },
      { dateKey: '2027-04-28', slot: 'wed', holy: true },
      { dateKey: '2027-04-29', slot: 'thu', holy: true },
    ]);
    expect(chokMakeUpsBefore(day(2027, 4, 30), JERUSALEM, true)).toEqual([
      { dateKey: '2027-04-25', slot: 'sun', holy: false },
      { dateKey: '2027-04-26', slot: 'mon', holy: false },
      { dateKey: '2027-04-27', slot: 'tue', holy: false },
      { dateKey: '2027-04-28', slot: 'wed', holy: true },
      { dateKey: '2027-04-29', slot: 'thu', holy: false },
    ]);
  });

  it('leaves out Friday in a Vezot Haberakhah week', () => {
    expect(chokMakeUpsBefore(day(2026, 10, 3), JERUSALEM, true)).toEqual([
      { dateKey: '2026-09-27', slot: 'sun', holy: false },
      { dateKey: '2026-09-28', slot: 'mon', holy: false },
      { dateKey: '2026-09-29', slot: 'tue', holy: false },
      { dateKey: '2026-09-30', slot: 'wed', holy: false },
      { dateKey: '2026-10-01', slot: 'thu', holy: false },
    ]);
  });
});

describe('the day a portion belongs to', () => {
  const VAYETZEI = { parashiyot: ['Vayetzei'], shabbat: new HDate(day(2026, 11, 21)) };
  const VEZOT = { parashiyot: ['Vezot Haberakhah'], shabbat: new HDate(day(2026, 10, 3)) };
  const keyOf = (date: Date | null) => date && dateKey(date);

  it('chokSlotDay maps a slot to its weekday of that week, Thursday night to Thursday', () => {
    expect(keyOf(chokSlotDay({ ...VAYETZEI, slot: 'sun' }))).toBe('2026-11-15');
    expect(keyOf(chokSlotDay({ ...VAYETZEI, slot: 'mon' }))).toBe('2026-11-16');
    expect(keyOf(chokSlotDay({ ...VAYETZEI, slot: 'thuNight' }))).toBe('2026-11-19');
    expect(keyOf(chokSlotDay({ ...VAYETZEI, slot: 'fri' }))).toBe('2026-11-20');
  });

  it('chokToday is the learning day in effect: before alot the previous one, Thursday night Thursday', () => {
    expect(keyOf(chokToday(at(JERUSALEM, '2026-11-16T02:00'), JERUSALEM, true))).toBe('2026-11-15');
    expect(keyOf(chokToday(at(JERUSALEM, '2026-11-16T12:00'), JERUSALEM, true))).toBe('2026-11-16');
    expect(keyOf(chokToday(at(JERUSALEM, '2026-11-19T20:00'), JERUSALEM, true))).toBe('2026-11-19');
    expect(keyOf(chokToday(at(JERUSALEM, '2026-11-21T20:00'), JERUSALEM, true))).toBe('2026-11-22');
    expect(keyOf(chokToday(at(LOS_ANGELES, '2027-06-14T02:00'), LOS_ANGELES, false))).toBe('2027-06-13');
  });

  it('chokToday falls back to the civil day when the day has no portion: the Friday of Vezot Haberakhah', () => {
    expect(keyOf(chokToday(at(JERUSALEM, '2026-10-02T08:00'), JERUSALEM, true))).toBe('2026-10-02');
  });

  it('chokDoneDay marks a day slot of this week up to today, never Thursday night', () => {
    const wednesday = day(2026, 11, 18);
    expect(keyOf(chokDoneDay({ ...VAYETZEI, slot: 'sun' }, wednesday))).toBe('2026-11-15');
    expect(keyOf(chokDoneDay({ ...VAYETZEI, slot: 'wed' }, wednesday))).toBe('2026-11-18');
    expect(chokDoneDay({ ...VAYETZEI, slot: 'thu' }, wednesday)).toBeNull();
    expect(chokDoneDay({ ...VAYETZEI, slot: 'thuNight' }, day(2026, 11, 20))).toBeNull();
    expect(keyOf(chokDoneDay({ ...VAYETZEI, slot: 'thu' }, day(2026, 11, 20)))).toBe('2026-11-19');
  });

  it('chokDoneDay refuses another week', () => {
    expect(chokDoneDay({ ...VAYETZEI, slot: 'mon' }, day(2026, 11, 23))).toBeNull();
    expect(
      chokDoneDay(
        { parashiyot: ['Vayishlach'], shabbat: new HDate(day(2026, 11, 28)), slot: 'sun' },
        day(2026, 11, 18),
      ),
    ).toBeNull();
  });

  it('chokDoneDay lets the Friday of Vezot Haberakhah mark Thursday', () => {
    expect(keyOf(chokDoneDay({ ...VEZOT, slot: 'thu' }, day(2026, 10, 2)))).toBe('2026-10-01');
  });
});

describe('chokOpenMakeUps', () => {
  const MARK = 1_000;
  const keys = (makeUps: { dateKey: string }[]) => makeUps.map((makeUp) => makeUp.dateKey);

  it('lists the earlier days of the week that are not marked done', () => {
    expect(chokOpenMakeUps(day(2026, 11, 18), JERUSALEM, true, {}, undefined)).toEqual([
      { dateKey: '2026-11-15', slot: 'sun', holy: false },
      { dateKey: '2026-11-16', slot: 'mon', holy: false },
      { dateKey: '2026-11-17', slot: 'tue', holy: false },
    ]);
    expect(
      keys(chokOpenMakeUps(day(2026, 11, 18), JERUSALEM, true, { '2026-11-16': { chok_leyisrael: MARK } }, undefined)),
    ).toEqual(['2026-11-15', '2026-11-17']);
  });

  it('ignores the marks of other mitzvot', () => {
    expect(
      keys(chokOpenMakeUps(day(2026, 11, 18), JERUSALEM, true, { '2026-11-16': { tefillin: MARK } }, undefined)),
    ).toEqual(['2026-11-15', '2026-11-16', '2026-11-17']);
  });

  it('starts on the day the mitzvah was switched on', () => {
    const mondayAfternoon = new Date(2026, 10, 16, 15).getTime();
    expect(keys(chokOpenMakeUps(day(2026, 11, 18), JERUSALEM, true, {}, mondayAfternoon))).toEqual([
      '2026-11-16',
      '2026-11-17',
    ]);
    const tuesdayMidnight = new Date(2026, 10, 17).getTime();
    expect(keys(chokOpenMakeUps(day(2026, 11, 18), JERUSALEM, true, {}, tuesdayMidnight))).toEqual(['2026-11-17']);
    expect(chokOpenMakeUps(day(2026, 11, 18), JERUSALEM, true, {}, new Date(2026, 10, 18, 9).getTime())).toEqual([]);
  });

  it('keeps a Yom Tov day until it is marked', () => {
    expect(chokOpenMakeUps(day(2027, 4, 23), JERUSALEM, true, {}, undefined)).toEqual([
      { dateKey: '2027-04-18', slot: 'sun', holy: false },
      { dateKey: '2027-04-19', slot: 'mon', holy: false },
      { dateKey: '2027-04-20', slot: 'tue', holy: false },
      { dateKey: '2027-04-21', slot: 'wed', holy: false },
      { dateKey: '2027-04-22', slot: 'thu', holy: true },
    ]);
    expect(
      keys(chokOpenMakeUps(day(2027, 4, 23), JERUSALEM, true, { '2027-04-22': { chok_leyisrael: MARK } }, undefined)),
    ).toEqual(['2027-04-18', '2027-04-19', '2027-04-20', '2027-04-21']);
  });

  it('has nothing on Sunday', () => {
    expect(chokOpenMakeUps(day(2026, 11, 15), JERUSALEM, true, {}, undefined)).toEqual([]);
  });
});

describe('chokDayHasText', () => {
  it('is false while the generated map is empty', () => {
    expect(chokDayHasText(new HDate(day(2026, 11, 16)), true)).toBe(false);
  });
});

describe('where the sun neither rises nor sets: Longyearbyen, June 2026', () => {
  const KORACH = { parashiyot: ['Korach'], shabbat: '2026-06-20' };
  const portionAt = (wallClock: string) => view(chokPortionAt(at(LONGYEARBYEN, wallClock), LONGYEARBYEN, false));

  it('falls back to civil midnight for nightfall and 04:00 for alot', () => {
    expect(ZmanimService.getZmanim(at(LONGYEARBYEN, '2026-06-18T12:00'), LONGYEARBYEN)).toBeNull();
    expect(portionAt('2026-06-18T12:00')).toEqual({ ...KORACH, slot: 'thu' });
    expect(portionAt('2026-06-18T23:00')).toEqual({ ...KORACH, slot: 'thu' });
    expect(portionAt('2026-06-19T02:00')).toEqual({ ...KORACH, slot: 'thuNight' });
    expect(portionAt('2026-06-19T05:00')).toEqual({ ...KORACH, slot: 'fri' });
  });

  it("follows the block's civil fallback and gives the next week after it", () => {
    expect(portionAt('2026-06-19T13:00')).toBeNull();
    expect(portionAt('2026-06-21T02:00')).toEqual({
      parashiyot: ['Chukat', 'Balak'],
      slot: 'sun',
      shabbat: '2026-06-27',
    });
  });
});
