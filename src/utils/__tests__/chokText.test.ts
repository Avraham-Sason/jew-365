import {
  HAFTARAH_VARIANT,
  chokParashaName,
  chokReaderPortion,
  chokSlotSections,
  chokText,
  chokWeekName,
} from '../chok';
import type { ChokPortion } from '../chok';
import { CITIES } from '@/data/cities';
import { dateKey } from '@/stores/useCompletionsStore';
import { at } from '@/testing/zmanim';
import { ChokAsset, ChokSection, ChokSectionKind } from '@/types/chok';
import { pickerEntries } from '@/utils/siddur';

const JERUSALEM = CITIES[0];
const LOS_ANGELES = CITIES.find((city) => city.nameEn === 'Los Angeles')!;
const KIND_NAMES: Record<ChokSectionKind, string> = {
  torah: 'Torah',
  neviim: 'Prophets',
  ketuvim: 'Writings',
  mishnah: 'Mishnah',
  gemara: 'Gemara',
  zohar: 'Zohar',
  halacha: 'Halacha',
  mussar: 'Mussar',
  haftarah: 'Haftarah',
};
const CREDIT = { title: 'חוק לישראל השלם, רק תורה', license: 'באישור בעל האתר', url: 'http://example.org' };

const day = (year: number, month: number, date: number) => new Date(year, month - 1, date);
const view = (portion: ChokPortion) => ({
  parashiyot: portion.parashiyot,
  slot: portion.slot,
  shabbat: dateKey(portion.shabbat.greg()),
});
const section = (kind: ChokSectionKind, heading: string, variant?: 'sephardi' | 'ashkenazi'): ChokSection => ({
  kind,
  heading,
  ...(variant ? { variant } : {}),
  segments: [{ he: [[{ t: heading }]] }],
});
const asset = (parasha: string, dedication: string | null = null): ChokAsset => ({
  parasha,
  credit: CREDIT,
  dedication,
  slots: {
    sun: [section('torah', 'תורה'), section('neviim', 'נביאים - מלכים א - פרק ז')],
    fri: [
      section('torah', 'תורה'),
      section('haftarah', 'הפטרה כמנהג הספרדים', 'sephardi'),
      section('haftarah', 'הפטרה כמנהג האשכנזים', 'ashkenazi'),
      section('mishnah', 'משנה שבת פרק כב'),
    ],
  },
});
const VAYAKHEL = asset('Vayakhel');
const PEKUDEI = asset('Pekudei');

describe('HAFTARAH_VARIANT', () => {
  it('gives Edot HaMizrach the Sephardi haftarah and every other nusach the Ashkenazi one', () => {
    expect(HAFTARAH_VARIANT).toEqual({
      ashkenaz: 'ashkenazi',
      sefard: 'ashkenazi',
      edot_hamizrach: 'sephardi',
      chabad: 'ashkenazi',
    });
  });
});

describe('parasha names', () => {
  it("takes the Hebrew name from hebcal's locale and keeps the English one", () => {
    expect(chokParashaName('Vayetzei', 'he')).toBe('ויצא');
    expect(chokParashaName('Vayetzei', 'en')).toBe('Vayetzei');
    expect(chokParashaName('Vezot Haberakhah', 'he')).toBe('וזאת הברכה');
  });

  it('joins a double week with a maqaf in Hebrew and a hyphen in English', () => {
    expect(chokWeekName(['Vayakhel', 'Pekudei'], 'he')).toBe('ויקהל־פקודי');
    expect(chokWeekName(['Vayakhel', 'Pekudei'], 'en')).toBe('Vayakhel-Pekudei');
    expect(chokWeekName(['Noach'], 'he')).toBe('נח');
  });
});

describe('chokSlotSections', () => {
  it('keeps the shared sections and the haftarah of the variant', () => {
    expect(chokSlotSections(VAYAKHEL, 'fri', 'sephardi').map((s) => s.heading)).toEqual([
      'תורה',
      'הפטרה כמנהג הספרדים',
      'משנה שבת פרק כב',
    ]);
    expect(chokSlotSections(VAYAKHEL, 'fri', 'ashkenazi').map((s) => s.heading)).toEqual([
      'תורה',
      'הפטרה כמנהג האשכנזים',
      'משנה שבת פרק כב',
    ]);
    expect(chokSlotSections(VAYAKHEL, 'mon', 'ashkenazi')).toEqual([]);
  });
});

describe('chokText', () => {
  const options = {
    slot: 'sun' as const,
    choice: 'both' as const,
    variant: 'ashkenazi' as const,
    kindNames: KIND_NAMES,
  };

  it('titles a single parasha by the printed heading and the English kind name', () => {
    const text = chokText([VAYAKHEL], options);
    expect(text.id).toBe('chok_leyisrael');
    expect(text).not.toHaveProperty('nusach');
    expect(text).not.toHaveProperty('dedication');
    expect(text.credits).toEqual([CREDIT]);
    expect(text.sections).toEqual([
      { title: { he: 'תורה', en: 'Torah' }, segments: VAYAKHEL.slots.sun![0].segments },
      { title: { he: 'נביאים - מלכים א - פרק ז', en: 'Prophets' }, segments: VAYAKHEL.slots.sun![1].segments },
    ]);
    expect(pickerEntries(text.sections).map((entry) => entry.title.he)).toEqual(['תורה', 'נביאים - מלכים א - פרק ז']);
  });

  it('reads one parasha of a double week by the choice', () => {
    expect(chokText([VAYAKHEL, PEKUDEI], { ...options, choice: 'first' }).sections.map((s) => s.title.he)).toEqual([
      'תורה',
      'נביאים - מלכים א - פרק ז',
    ]);
    const second = chokText([VAYAKHEL, PEKUDEI], { ...options, choice: 'second' });
    expect(second.sections[0].segments).toBe(PEKUDEI.slots.sun![0].segments);
    expect(second.sections.every((s) => s.chapter === undefined)).toBe(true);
  });

  it('reads both parashiyot one after the other, each a chapter, with unique titles', () => {
    const text = chokText([VAYAKHEL, PEKUDEI], options);
    expect(text.sections.map((s) => s.title)).toEqual([
      { he: 'ויקהל · תורה', en: 'Vayakhel · Torah' },
      { he: 'ויקהל · נביאים - מלכים א - פרק ז', en: 'Vayakhel · Prophets' },
      { he: 'פקודי · תורה', en: 'Pekudei · Torah' },
      { he: 'פקודי · נביאים - מלכים א - פרק ז', en: 'Pekudei · Prophets' },
    ]);
    expect(pickerEntries(text.sections)).toEqual([
      { index: 0, title: { he: 'ויקהל', en: 'Vayakhel' } },
      { index: 2, title: { he: 'פקודי', en: 'Pekudei' } },
    ]);
    expect(new Set(text.sections.map((s) => s.title.he)).size).toBe(text.sections.length);
    expect(text.credits).toEqual([CREDIT]);
  });

  it('takes the haftarah of the variant and the dedication from the asset', () => {
    const text = chokText([asset('Vayakhel', 'לעילוי נשמה')], { ...options, slot: 'fri', variant: 'sephardi' });
    expect(text.sections.map((s) => s.title)).toEqual([
      { he: 'תורה', en: 'Torah' },
      { he: 'הפטרה כמנהג הספרדים', en: 'Haftarah' },
      { he: 'משנה שבת פרק כב', en: 'Mishnah' },
    ]);
    expect(text.dedication).toBe('לעילוי נשמה');
  });

  it('has no sections for a slot the parasha does not carry', () => {
    expect(chokText([VAYAKHEL], { ...options, slot: 'tue' }).sections).toEqual([]);
  });

  it('puts one closed fold per make-up day before the portion, its sections headed inside it', () => {
    const label = { he: 'השלמה: יום ראשון', en: 'Make-up: Sunday' };
    const text = chokText([VAYAKHEL], {
      ...options,
      slot: 'fri',
      variant: 'sephardi',
      makeUps: [{ dateKey: '2028-03-19', slot: 'sun', label }],
    });
    expect(text.sections.map((s) => s.title.he)).toEqual([
      'השלמה: יום ראשון',
      'תורה',
      'הפטרה כמנהג הספרדים',
      'משנה שבת פרק כב',
    ]);
    expect(text.sections[0]).toEqual({
      title: label,
      optional: label,
      segments: [
        { he: [[{ t: 'תורה', s: 'b' }]], en: 'Torah' },
        ...VAYAKHEL.slots.sun![0].segments,
        { he: [[{ t: 'נביאים - מלכים א - פרק ז', s: 'b' }]], en: 'Prophets' },
        ...VAYAKHEL.slots.sun![1].segments,
      ],
    });
  });

  it('builds a make-up day with the choice and the variant of the week, and no chapter of its own', () => {
    const label = { he: 'השלמה: יום שישי', en: 'Make-up: Friday' };
    const text = chokText([VAYAKHEL, PEKUDEI], {
      ...options,
      slot: 'sun',
      makeUps: [{ dateKey: '2028-03-24', slot: 'fri', label }],
    });
    const fold = text.sections[0];
    expect(fold.chapter).toBeUndefined();
    expect(fold.segments.filter((segment) => segment.he[0][0].s === 'b').map((segment) => segment.he[0][0].t)).toEqual([
      'ויקהל · תורה',
      'ויקהל · הפטרה כמנהג האשכנזים',
      'ויקהל · משנה שבת פרק כב',
      'פקודי · תורה',
      'פקודי · הפטרה כמנהג האשכנזים',
      'פקודי · משנה שבת פרק כב',
    ]);
    expect(pickerEntries(text.sections)).toEqual([
      { index: 1, title: { he: 'ויקהל', en: 'Vayakhel' } },
      { index: 3, title: { he: 'פקודי', en: 'Pekudei' } },
    ]);
  });
});

describe('chokReaderPortion', () => {
  const portion = (request: Parameters<typeof chokReaderPortion>[0], location = JERUSALEM, inIsrael = true) =>
    view(chokReaderPortion(request, location, inIsrael));

  it('opens the portion of this moment', () => {
    expect(portion({ now: at(JERUSALEM, '2026-11-19T12:00') })).toEqual({
      parashiyot: ['Vayetzei'],
      slot: 'thu',
      shabbat: '2026-11-21',
    });
    expect(portion({ now: at(LOS_ANGELES, '2027-06-17T12:00') }, LOS_ANGELES, false)).toEqual({
      parashiyot: ['Nasso'],
      slot: 'thu',
      shabbat: '2027-06-19',
    });
  });

  it('opens Thursday night on the Friday of Vezot Haberakhah, which has no portion', () => {
    expect(portion({ now: at(JERUSALEM, '2026-10-02T08:00') })).toEqual({
      parashiyot: ['Vezot Haberakhah'],
      slot: 'thuNight',
      shabbat: '2026-10-03',
    });
    expect(portion({ now: new Date(), date: day(2026, 10, 2) })).toEqual({
      parashiyot: ['Vezot Haberakhah'],
      slot: 'thuNight',
      shabbat: '2026-10-03',
    });
  });

  it('opens the day a date names, Friday for a Shabbat, and a requested slot of the same week', () => {
    const now = at(JERUSALEM, '2026-11-19T12:00');
    expect(portion({ now, date: day(2026, 11, 16) })).toEqual({
      parashiyot: ['Vayetzei'],
      slot: 'mon',
      shabbat: '2026-11-21',
    });
    expect(portion({ now, date: day(2026, 11, 21) })).toEqual({
      parashiyot: ['Vayetzei'],
      slot: 'fri',
      shabbat: '2026-11-21',
    });
    expect(portion({ now, date: day(2026, 11, 16), slot: 'thuNight' })).toEqual({
      parashiyot: ['Vayetzei'],
      slot: 'thuNight',
      shabbat: '2026-11-21',
    });
    expect(portion({ now: at(JERUSALEM, '2026-11-16T12:00'), slot: 'sun' })).toEqual({
      parashiyot: ['Vayetzei'],
      slot: 'sun',
      shabbat: '2026-11-21',
    });
  });

  it('ignores a requested slot the week does not have', () => {
    expect(portion({ now: new Date(), date: day(2026, 9, 28), slot: 'fri' })).toEqual({
      parashiyot: ['Vezot Haberakhah'],
      slot: 'mon',
      shabbat: '2026-10-03',
    });
  });

  it('names both parashiyot of a double week', () => {
    expect(portion({ now: new Date(), date: day(2028, 3, 19) })).toEqual({
      parashiyot: ['Vayakhel', 'Pekudei'],
      slot: 'sun',
      shabbat: '2028-03-25',
    });
  });
});
