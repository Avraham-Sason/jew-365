import { HDate, months } from '@hebcal/core';
import { DateTime } from 'luxon';
import { ComputeContext, Mitzvah, MitzvahWindow, Nusach } from '@/types/mitzvah';
import { Location, Zmanim } from '@/types/zmanim';
import { CHOK_TEXT_ID, hasChokContent } from '@/data/chok';
import { HebcalService } from '@/services/HebcalService';
import { ZmanimService, candleLightingMinutes, isJerusalem } from '@/services/ZmanimService';
import { chokPortionOn } from '@/utils/chok';

const ALL_NUSCHAOT: Nusach[] = ['ashkenaz', 'sefard', 'edot_hamizrach', 'chabad'];
const SUNDAY = 0;

function win(start: Date, end: Date): MitzvahWindow {
  if (end.getTime() <= start.getTime()) return null;
  return { start, end };
}

function sofZmanShma(ctx: ComputeContext): Date {
  return ctx.settings.halachicOpinions.ksSofZman === 'MA' ? ctx.zmanim.sofZmanShmaMA : ctx.zmanim.sofZmanShmaGra;
}

// The LOCATION's calendar day that ctx.zmanim were computed for, at its midday. Calendar questions
// go through it, so neither the device's zone nor the clock time ctx.date carries can move the
// answer: device-local getters on ctx.date picked a different day whenever the zones disagreed,
// and an evening ctx.date already sits in the next Hebrew day.
function dayOf(zmanim: Zmanim, location: Location): DateTime {
  return DateTime.fromJSDate(zmanim.chatzot).setZone(location.tz);
}

// The fast of Tisha B'Av on a Sunday, whether 9 Av falls there or is pushed off Shabbat (10 Av).
// Either way it began on motzaei Shabbat, which had only the flame.
function isSundayTishaBav(day: DateTime): boolean {
  const hd = new HDate(new Date(day.year, day.month - 1, day.day));
  return hd.getMonth() === months.AV && (hd.getDate() === 9 || hd.getDate() === 10) && hd.getDay() === SUNDAY;
}

// The last day of a Shabbat / Yom Tov block: holy itself, and the next day is not.
function closesHolyBlock(day: DateTime, location: Location): boolean {
  return (
    HebcalService.isHolyDay(day.toJSDate(), location) &&
    !HebcalService.isHolyDay(day.plus({ days: 1 }).toJSDate(), location)
  );
}

// When the night opens: tzeit, or the block's exit on the day that closes one (`HebcalService`).
function nightfall(zmanim: Zmanim, location: Location): Date {
  return HebcalService.nightfall(zmanim, location);
}

export { candleLightingMinutes, isJerusalem };

// The Omer is counted at nightfall, and that night belongs to the NEXT Hebrew day. So the count
// due on the night that opens at tzeit of Gregorian day D is the count of Hebrew day D+1: night 1
// falls on the evening of 15 Nisan and night 49 on the evening of 4 Sivan. Anchoring to 16 Nisan
// shifted every night one day late — no window at all on the first night, and a window (with the
// bracha in the body) on the night of Shavuot, when there is nothing left to count.
function omerDayFor(date: Date, timeZone?: string): number | null {
  const zoned = timeZone ? DateTime.fromJSDate(date).setZone(timeZone) : DateTime.fromJSDate(date);
  const zone = zoned.zoneName ?? undefined;
  const calendarDate = new Date(zoned.year, zoned.month - 1, zoned.day);
  const hd = new HDate(calendarDate);
  const year = hd.getFullYear();
  const startGreg = new HDate(15, 'Nisan', year).greg();
  const endGreg = new HDate(4, 'Sivan', year).greg();
  const start = DateTime.fromObject(
    { year: startGreg.getFullYear(), month: startGreg.getMonth() + 1, day: startGreg.getDate() },
    { zone },
  ).startOf('day');
  const end = DateTime.fromObject(
    { year: endGreg.getFullYear(), month: endGreg.getMonth() + 1, day: endGreg.getDate() },
    { zone },
  ).startOf('day');
  const current = zoned.startOf('day');
  if (current < start || current > end) return null;
  const days = Math.floor(current.diff(start, 'days').days) + 1;
  return days >= 1 && days <= 49 ? days : null;
}

// The next day's alot hashachar: the Omer may be counted until then, and the Chok LeYisrael learning
// day ends then. Falls back to chatzot halayla if the next day's zmanim cannot be computed.
function nextAlot({ location, zmanim }: ComputeContext): Date {
  const nextDay = dayOf(zmanim, location).plus({ days: 1 }).toJSDate();
  return ZmanimService.getZmanim(nextDay, location)?.alotHaShachar ?? zmanim.chatzotLayla;
}

export const CHOK_LEYISRAEL: Mitzvah = {
  id: CHOK_TEXT_ID,
  name: { he: 'חק לישראל', en: 'Chok LeYisrael' },
  icon: 'chok',
  timeType: 'range-within-day',
  category: 'learning',
  skipOn: ['shabbat', 'yomtov'],
  nuschaotSupported: ALL_NUSCHAOT,
  defaultReminders: [
    {
      anchor: 'clock',
      offsetMin: 9 * 60,
      label: 'זמן לימוד חק לישראל',
      bodyVariants: ['זמן לימוד חק לישראל', 'חק לישראל של היום מחכה לך', 'כמה דקות של תורה עם חק לישראל'],
    },
  ],
  computeWindow: (ctx) => {
    const day = dayOf(ctx.zmanim, ctx.location);
    const date = new Date(day.year, day.month - 1, day.day);
    if (!hasChokContent() || !chokPortionOn(date, ctx.location, ctx.settings.inIsrael)) return null;
    const block = HebcalService.holyBlockOn(day.plus({ days: 1 }).toJSDate(), ctx.location);
    return win(ctx.zmanim.alotHaShachar, block?.start ?? nextAlot(ctx));
  },
};

export const MITZVOT: Mitzvah[] = [
  {
    id: 'tefillin',
    name: { he: 'הנחת תפילין', en: 'Tefillin' },
    icon: 'tefillin',
    timeType: 'range-within-day',
    category: 'daily-morning',
    skipOn: ['shabbat', 'yomtov', 'cholHamoed'],
    nuschaotSupported: ALL_NUSCHAOT,
    defaultReminders: [
      {
        anchor: 'start',
        offsetMin: 0,
        label: 'הגיע זמן הנחת תפילין',
        bodyVariants: ['הגיע זמן הנחת תפילין', 'התפילין מחכות', 'בוקר טוב, זמן תפילין'],
      },
      { anchor: 'start', offsetMin: 180, label: 'תזכורת — עדיין לא הנחת תפילין', skipIfDone: true },
      { anchor: 'end', offsetMin: -45, label: "נותרו 45 דק' להנחת תפילין", skipIfDone: true },
    ],
    computeWindow: ({ zmanim }) => win(zmanim.misheyakir, zmanim.shkia),
  },
  {
    id: 'krias_shma_shacharit',
    name: { he: 'קריאת שמע שחרית', en: 'Krias Shema (morning)' },
    icon: 'shema',
    timeType: 'range-within-day',
    category: 'daily-morning',
    skipOn: [],
    nuschaotSupported: ALL_NUSCHAOT,
    defaultReminders: [
      {
        anchor: 'start',
        offsetMin: 0,
        label: 'זמן קריאת שמע של שחרית',
        bodyVariants: ['זמן קריאת שמע של שחרית', 'שמע ישראל, לפני סוף הזמן', 'קריאת שמע, הזמן רץ'],
      },
      { anchor: 'end', offsetMin: -30, label: 'נותרו 30 דק\' לק"ש', skipIfDone: true },
    ],
    computeWindow: (ctx) => win(ctx.zmanim.netzHaChama, sofZmanShma(ctx)),
  },
  {
    id: 'shacharit',
    name: { he: 'תפילת שחרית', en: 'Shacharit' },
    icon: 'shacharit',
    timeType: 'range-within-day',
    category: 'daily-morning',
    skipOn: [],
    nuschaotSupported: ALL_NUSCHAOT,
    defaultReminders: [
      {
        anchor: 'start',
        offsetMin: 0,
        label: 'זמן תפילת שחרית',
        bodyVariants: ['זמן תפילת שחרית', 'שחרית פותחת את היום', 'הבוקר מחכה לתפילה'],
      },
      { anchor: 'end', offsetMin: -45, label: "נותרו 45 דק' לשחרית", skipIfDone: true },
    ],
    computeWindow: ({ zmanim }) => win(zmanim.netzHaChama, zmanim.sofZmanTfilaGra),
  },
  {
    id: 'mincha',
    name: { he: 'תפילת מנחה', en: 'Mincha' },
    icon: 'mincha',
    timeType: 'range-within-day',
    category: 'daily-afternoon',
    skipOn: [],
    nuschaotSupported: ALL_NUSCHAOT,
    defaultReminders: [
      {
        anchor: 'start',
        offsetMin: 0,
        label: 'זמן תפילת מנחה',
        bodyVariants: ['זמן תפילת מנחה', 'רגע למנחה באמצע היום', 'מנחה לפני השקיעה'],
      },
      { anchor: 'end', offsetMin: -60, label: 'נותרה שעה למנחה', skipIfDone: true },
    ],
    computeWindow: ({ zmanim }) => win(zmanim.minchaGedola, zmanim.shkia),
  },
  {
    id: 'maariv',
    name: { he: 'תפילת ערבית', en: 'Maariv' },
    icon: 'maariv',
    timeType: 'range-within-day',
    category: 'daily-evening',
    skipOn: [],
    nuschaotSupported: ALL_NUSCHAOT,
    defaultReminders: [
      {
        anchor: 'start',
        offsetMin: 0,
        label: 'זמן תפילת ערבית',
        bodyVariants: ['זמן תפילת ערבית', 'ערבית לסיום היום', 'הלילה נכנס, זמן ערבית'],
      },
      { anchor: 'start', offsetMin: 120, label: 'תזכורת — ערבית', skipIfDone: true },
    ],
    computeWindow: ({ zmanim, location }) => win(nightfall(zmanim, location), zmanim.chatzotLayla),
  },
  {
    id: 'birchot_hashachar',
    name: { he: 'ברכות השחר', en: 'Birchot HaShachar' },
    icon: 'brachot',
    timeType: 'range-within-day',
    category: 'daily-morning',
    skipOn: [],
    nuschaotSupported: ALL_NUSCHAOT,
    defaultReminders: [
      {
        anchor: 'start',
        offsetMin: 0,
        label: 'זמן ברכות השחר',
        bodyVariants: ['זמן ברכות השחר', 'פתח את הבוקר בברכות השחר', 'ברכות השחר מחכות לך'],
      },
    ],
    computeWindow: (ctx) => win(ctx.zmanim.alotHaShachar, sofZmanShma(ctx)),
  },
  {
    id: 'candle_lighting',
    name: { he: 'הדלקת נרות שבת', en: 'Candle Lighting' },
    icon: 'candles',
    timeType: 'fixed-moment',
    category: 'weekly',
    skipOn: [],
    nuschaotSupported: ALL_NUSCHAOT,
    defaultReminders: [{ anchor: 'start', offsetMin: 0, label: 'זמן הדלקת נרות' }],
    computeWindow: ({ location, zmanim }) => {
      // Lit once, on the erev of a Shabbat / Yom Tov block. Inside a block — the second night of
      // Yom Tov, or Shabbat that follows Yom Tov — candles are lit from an existing flame while the
      // app is quiet, so a reminder there would land in the middle of the chag.
      const day = dayOf(zmanim, location);
      if (HebcalService.isHolyDay(day.toJSDate(), location)) return null;
      if (!HebcalService.isHolyDay(day.plus({ days: 1 }).toJSDate(), location)) return null;
      const t = new Date(zmanim.shkia.getTime() - candleLightingMinutes(location) * 60_000);
      return win(t, zmanim.shkia);
    },
  },
  {
    id: 'havdalah',
    name: { he: 'הבדלה', en: 'Havdalah' },
    icon: 'havdalah',
    timeType: 'fixed-moment',
    category: 'weekly',
    skipOn: [],
    nuschaotSupported: ALL_NUSCHAOT,
    defaultReminders: [
      {
        anchor: 'start',
        offsetMin: 0,
        label: 'זמן הבדלה',
        bodyVariants: ['זמן הבדלה', 'מבדילים בין קודש לחול', 'הגיע זמן ברכות ההבדלה'],
      },
    ],
    computeWindow: ({ location, zmanim }) => {
      // Havdalah closes a Shabbat / Yom Tov block, so it is due only on the block's last day:
      // Shabbat that flows into Yom Tov is separated in kiddush instead, and a Yom Tov that ends on
      // a weekday still needs it. When the Tisha B'Av fast falls on Sunday, motzaei Shabbat has only
      // the flame and the cup waits for the end of the fast on Sunday night, at tzeit itself.
      const day = dayOf(zmanim, location);
      if (!closesHolyBlock(day, location) && !isSundayTishaBav(day)) return null;
      const start = nightfall(zmanim, location);
      return win(start, new Date(start.getTime() + 90 * 60_000));
    },
  },
  {
    id: 'sefirat_haomer',
    name: { he: 'ספירת העומר', en: 'Sefirat HaOmer' },
    icon: 'omer',
    timeType: 'date-range',
    category: 'seasonal',
    skipOn: [],
    nuschaotSupported: ALL_NUSCHAOT,
    contentBlocks: [
      {
        type: 'blessing',
        he: 'ברוך אתה ה׳ אלוקינו מלך העולם אשר קדשנו במצוותיו וצוונו על ספירת העומר',
      },
    ],
    defaultReminders: [
      {
        anchor: 'start',
        offsetMin: 0,
        label: 'זמן ספירת העומר',
        includeContentInBody: true,
        bodyVariants: ['זמן ספירת העומר', 'הלילה סופרים את העומר', 'ספירת העומר לפני השינה'],
      },
      { anchor: 'start', offsetMin: 60, label: 'תזכורת — ספירת העומר', skipIfDone: true },
    ],
    computeWindow: (ctx) => {
      if (omerDayFor(ctx.zmanim.chatzot, ctx.location.tz) === null) return null;
      return win(nightfall(ctx.zmanim, ctx.location), nextAlot(ctx));
    },
  },
  CHOK_LEYISRAEL,
];

export function findMitzvah(id: string): Mitzvah | undefined {
  return MITZVOT.find((m) => m.id === id);
}

export { omerDayFor };
