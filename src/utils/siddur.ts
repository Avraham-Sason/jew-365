import { HDate, HebrewCalendar, flags as hebcalFlags, months } from '@hebcal/core';
import {
  Condition,
  DayFeatures,
  DayFlag,
  PassageLabel,
  Place,
  Run,
  SegmentBlock,
  SiddurSection,
  SiddurSegment,
  SiddurText,
} from '@/types/siddur';
import type { MaritalStatus, PrayerMode } from '@/stores/useUserStore';

const SHEHECHEYANU_DAYS: readonly (readonly [month: number, day: number])[] = [
  [months.TISHREI, 1],
  [months.TISHREI, 2],
  [months.TISHREI, 10],
  [months.TISHREI, 15],
  [months.TISHREI, 22],
  [months.NISAN, 15],
  [months.SIVAN, 6],
];
const DIASPORA_SHEHECHEYANU_DAYS: readonly (readonly [month: number, day: number])[] = [
  [months.TISHREI, 16],
  [months.TISHREI, 23],
  [months.NISAN, 16],
  [months.SIVAN, 7],
];
const NAMED_FASTS: readonly (readonly [desc: string, flag: DayFlag])[] = [
  ['Tzom Gedaliah', 'tzomGedaliah'],
  ["Asara B'Tevet", 'asaraBTevet'],
  ["Ta'anit Esther", 'taanitEsther'],
  ['Tzom Tammuz', 'tzomTammuz'],
];
const PUBLIC_FASTS = [...NAMED_FASTS.map(([desc]) => desc), "Tish'a B'Av"];
const WEEKDAYS: readonly DayFlag[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DISPUTED_HALLEL_DAYS = ["Yom HaAtzma'ut", 'Yom Yerushalayim'];
const SUKKOT_OFFERING_DAYS = [2, 3, 4, 5, 6, 7] as const;

function isOneOf(hd: HDate, days: readonly (readonly [number, number])[]): boolean {
  return days.some(([month, day]) => hd.getMonth() === month && hd.getDate() === day);
}

function omerDayOf(hd: HDate): number | null {
  const day = hd.abs() - new HDate(15, months.NISAN, hd.getFullYear()).abs();
  return day >= 1 && day <= 49 ? day : null;
}

function isGregorianLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function rainRequestStart(year: number, inIsrael: boolean): HDate {
  if (inIsrael) return new HDate(7, months.CHESHVAN, year);
  const civilYear = new HDate(1, months.TISHREI, year).greg().getFullYear();
  return new HDate(new Date(civilYear, 11, isGregorianLeapYear(civilYear + 1) ? 6 : 5));
}

function within(hd: HDate, from: HDate, to: HDate): boolean {
  return hd.abs() >= from.abs() && hd.abs() <= to.abs();
}

function observances(hd: HDate, inIsrael: boolean) {
  const events = HebrewCalendar.calendar({ start: hd, end: hd, il: inIsrael });
  const descs = events.map((event) => event.getDesc());
  const yomKippur = descs.includes('Yom Kippur');
  const yomTov = events.some((event) => {
    const mask = event.getFlags();
    return Boolean(mask & hebcalFlags.CHAG) && !(mask & hebcalFlags.CHOL_HAMOED) && event.getDesc() !== 'Yom Kippur';
  });
  const cholHamoed = events
    .filter((event) => event.getFlags() & hebcalFlags.CHOL_HAMOED)
    .map((event) => event.getDesc());
  return { descs, yomKippur, yomTov, cholHamoed, shabbat: hd.getDay() === 6 };
}

function isChanukah(hd: HDate): boolean {
  const first = new HDate(25, months.KISLEV, hd.getFullYear());
  return within(hd, first, first.add(7));
}

function observedTishaBav(year: number): HDate {
  const ninth = new HDate(9, months.AV, year);
  return ninth.getDay() === 6 ? ninth.next() : ninth;
}

const SEPHARDI_SELICHOT_FROM_ELUL = 2;

// Leil Selichot opens the Sunday that leaves at least four selichot days before Rosh Hashana,
// Erev Rosh Hashana included.
function leilSelichot(roshHashana: HDate): number {
  const sunday = roshHashana.abs() - roshHashana.getDay();
  return roshHashana.abs() - sunday < 4 ? sunday - 7 : sunday;
}

function weekdaysFrom(from: number, to: number): number {
  let count = 0;
  for (let abs = from; abs <= to; abs++) if (new HDate(abs).getDay() !== 6) count++;
  return count;
}

function selichotFlags(hd: HDate, holy: boolean): DayFlag[] {
  if (holy) return [];
  const month = hd.getMonth();
  const date = hd.getDate();
  if (month === months.ELUL) {
    const roshHashana = new HDate(1, months.TISHREI, hd.getFullYear() + 1);
    const sephardi: DayFlag[] = date >= SEPHARDI_SELICHOT_FROM_ELUL ? ['selichotSephardi'] : [];
    if (hd.abs() === roshHashana.abs() - 1) return [...sephardi, 'selichotAshkenazi', 'erevRoshHashana'];
    const start = leilSelichot(roshHashana);
    if (hd.abs() < start) return sephardi;
    return [...sephardi, 'selichotAshkenazi', `selichotDay${weekdaysFrom(start, hd.abs())}` as DayFlag];
  }
  if (month !== months.TISHREI || date < 3 || date > 9) return [];
  if (date === 9) return ['selichotSephardi', 'selichotAshkenazi'];
  const nth = weekdaysFrom(new HDate(3, months.TISHREI, hd.getFullYear()).abs(), hd.abs());
  return ['selichotSephardi', 'selichotAshkenazi', ...(nth > 1 ? [`selichotTeshuva${nth}` as DayFlag] : [])];
}

function purimName(place: Place): string {
  return place.jerusalem ? 'Shushan Purim' : 'Purim';
}

export function liturgicalDay(windowDate: Date, evening: boolean): HDate {
  const base = new HDate(new Date(windowDate.getFullYear(), windowDate.getMonth(), windowDate.getDate()));
  return evening ? base.next() : base;
}

export function dayFeatures(hd: HDate, place: Place): DayFeatures {
  const today = observances(hd, place.inIsrael);
  const year = hd.getFullYear();
  const month = hd.getMonth();
  const date = hd.getDate();
  const flags = new Set<DayFlag>();
  const add = (flag: DayFlag, when: boolean) => when && flags.add(flag);
  const flagged = (...names: DayFlag[]) => names.some((name) => flags.has(name));

  const weekday = WEEKDAYS[hd.getDay()];
  if (weekday) flags.add(weekday);
  add('shabbat', today.shabbat);
  add('yomTov', today.yomTov);
  add('yomKippur', today.yomKippur);
  add(
    'tishaBav',
    today.descs.some((desc) => desc.startsWith("Tish'a B'Av")),
  );
  add('shehecheyanu', isOneOf(hd, SHEHECHEYANU_DAYS) || (!place.inIsrael && isOneOf(hd, DIASPORA_SHEHECHEYANU_DAYS)));
  add(
    'roshChodesh',
    today.descs.some((desc) => desc.startsWith('Rosh Chodesh')),
  );
  add(
    'cholHamoedPesach',
    today.cholHamoed.some((desc) => desc.startsWith('Pesach')),
  );
  add(
    'cholHamoedSukkot',
    today.cholHamoed.some((desc) => desc.startsWith('Sukkot')),
  );
  add('inIsrael', place.inIsrael);
  add('omer', omerDayOf(hd) !== null);
  add('winter', within(hd, new HDate(22, months.TISHREI, year), new HDate(14, months.NISAN, year)));
  add('talUmatar', within(hd, rainRequestStart(year, place.inIsrael), new HDate(14, months.NISAN, year)));
  add('aseretYemeiTeshuva', month === months.TISHREI && date <= 10);
  add('erevYomKippur', month === months.TISHREI && date === 9);
  for (const flag of selichotFlags(hd, today.shabbat || today.yomTov || today.yomKippur)) flags.add(flag);
  add(
    'ledavidSeason',
    month === months.ELUL || (month === months.AV && date === 30) || (month === months.TISHREI && date <= 21),
  );
  add('chanukah', isChanukah(hd));
  add('chanukahFirstNight', month === months.KISLEV && date === 25);
  add('kiddushLevana', date >= 3 && date <= 15);
  add('avBeforeTishaBav', month === months.AV && hd.abs() <= observedTishaBav(year).abs());
  add('purim', today.descs.includes(purimName(place)));
  add('purimOrShushan', today.descs.includes('Purim') || today.descs.includes('Shushan Purim'));
  add('purimKatan', today.descs.includes('Purim Katan') || today.descs.includes('Shushan Purim Katan'));
  add(
    'publicFast',
    today.descs.some((desc) => PUBLIC_FASTS.some((fast) => desc.startsWith(fast))),
  );
  for (const [desc, flag] of NAMED_FASTS) add(flag, today.descs.includes(desc));
  add('dayAfterYomKippur', month === months.TISHREI && date === 11);
  add('hoshanaRabba', month === months.TISHREI && date === 21);
  add('erevPesach', month === months.NISAN && date === 14);
  add('musaf', flagged('roshChodesh', 'cholHamoedPesach', 'cholHamoedSukkot'));
  add('torahReading', flagged('monday', 'thursday', 'musaf', 'chanukah', 'purim', 'publicFast'));
  add(
    'ulechaparatPesha',
    HDate.isLeapYear(year) && (month >= months.CHESHVAN || (month === months.TISHREI && date === 30)),
  );

  const hallel = HebrewCalendar.hallel(hd, place.inIsrael);
  const disputedHallel = today.descs.some((desc) => DISPUTED_HALLEL_DAYS.includes(desc));
  add('hallelWhole', hallel === 2 && !disputedHallel);
  add('hallelHalf', hallel === 1);
  add('hallelDisputed', hallel > 0 && disputedHallel);

  const sukkotDay = month === months.TISHREI ? date - 14 : 0;
  add('lulavShehecheyanu', place.inIsrael && sukkotDay === 2 && hd.prev().getDay() === 6);
  for (const day of SUKKOT_OFFERING_DAYS) {
    add(`sukkotOffering${day}`, sukkotDay === day || (!place.inIsrael && sukkotDay === day + 1));
  }

  const tachanun = HebrewCalendar.tachanun(hd, place.inIsrael);
  add('tachanunShacharit', tachanun.shacharit);
  add('tachanunMincha', tachanun.mincha);
  add('tachanunDisputed', !tachanun.allCongs);

  const yesterday = observances(hd.prev(), place.inIsrael);
  add('motzaei', yesterday.shabbat || yesterday.yomTov || yesterday.yomKippur);
  // A meal begun before sunset keeps yesterday's inserts, so the day after names what yesterday was,
  // but only when today carries no insert of the same kind of its own.
  const noYaalehVeyavoToday = !flagged('roshChodesh', 'cholHamoedPesach', 'cholHamoedSukkot');
  add('roshChodeshYesterday', noYaalehVeyavoToday && yesterday.descs.some((desc) => desc.startsWith('Rosh Chodesh')));
  add(
    'cholHamoedPesachYesterday',
    noYaalehVeyavoToday && yesterday.cholHamoed.some((desc) => desc.startsWith('Pesach')),
  );
  add(
    'cholHamoedSukkotYesterday',
    noYaalehVeyavoToday && yesterday.cholHamoed.some((desc) => desc.startsWith('Sukkot')),
  );
  const noAlHanissimToday = !flagged('chanukah', 'purim');
  add('chanukahYesterday', noAlHanissimToday && isChanukah(hd.prev()));
  add('purimYesterday', noAlHanissimToday && yesterday.descs.includes(purimName(place)));
  if (yesterday.shabbat) {
    flags.add('motzaeiShabbat');
    const weekAhead = [0, 1, 2, 3, 4, 5].map((offset) => observances(hd.add(offset), place.inIsrael));
    add('viHiNoam', !flags.has('tishaBav') && !weekAhead.some((day) => day.yomTov || day.yomKippur));
  }

  return { flags, omerDay: omerDayOf(hd) };
}

export function matchesCondition(condition: Condition | undefined, features: DayFeatures): boolean {
  if (!condition) return true;
  if (condition.all?.some((flag) => !features.flags.has(flag))) return false;
  if (condition.any && !condition.any.some((flag) => features.flags.has(flag))) return false;
  if (condition.none?.some((flag) => features.flags.has(flag))) return false;
  if (condition.omerDay !== undefined && condition.omerDay !== features.omerDay) return false;
  return true;
}

function trimEdges(runs: Run[]): Run[] {
  const first = runs.findIndex((run) => run.t.trim());
  if (first < 0) return [];
  const last = runs.findLastIndex((run) => run.t.trim());
  return runs.slice(first, last + 1).map((run, index, kept) => {
    let t = index === 0 ? run.t.trimStart() : run.t;
    if (index === kept.length - 1) t = t.trimEnd();
    return t === run.t ? run : { ...run, t };
  });
}

function collapseJoins(runs: Run[]): Run[] {
  const kept: Run[] = [];
  for (const run of runs) {
    const previous = kept[kept.length - 1];
    const t = previous && /\s$/.test(previous.t) ? run.t.trimStart() : run.t;
    if (t) kept.push(t === run.t ? run : { ...run, t });
  }
  return kept;
}

type Labeled = { optional?: PassageLabel; minyan?: PassageLabel };

function dropLabelsNotDue<T extends Labeled>(item: T, features: DayFeatures): T {
  const due = { ...item };
  for (const field of ['optional', 'minyan'] as const) {
    if (due[field] && !matchesCondition(due[field].when, features)) delete due[field];
  }
  return due;
}

function resolveSegment(segment: SiddurSegment, features: DayFeatures): SiddurSegment | null {
  if (!matchesCondition(segment.when, features)) return null;
  const he = segment.he
    .map((runs) => trimEdges(collapseJoins(runs.filter((run) => matchesCondition(run.when, features)))))
    .filter((runs) => runs.length > 0);
  return he.length ? dropLabelsNotDue({ ...segment, he }, features) : null;
}

export function resolveSiddurText(text: SiddurText, features: DayFeatures): SiddurSection[] {
  return text.sections
    .map((section) =>
      dropLabelsNotDue(
        {
          ...section,
          segments: section.segments
            .map((segment) => resolveSegment(segment, features))
            .filter((segment): segment is SiddurSegment => segment !== null),
        },
        features,
      ),
    )
    .filter((section) => section.segments.length > 0);
}

export function forMaritalStatus(sections: SiddurSection[], status: MaritalStatus | null): SiddurSection[] {
  if (status !== 'single') return sections;
  return sections.flatMap((section) => {
    if (section.optional?.marriedOnly) return [];
    const segments = section.segments.filter((segment) => !segment.optional?.marriedOnly);
    if (!segments.length) return [];
    return [segments.length === section.segments.length ? section : { ...section, segments }];
  });
}

export type PickerEntry = { index: number; title: { he: string; en: string } };

// What the reader's section picker lists for a resolved text: its chapters, each at the section that
// opens it, or every section when the text has no chapters (the short texts).
export function pickerEntries(sections: SiddurSection[]): PickerEntry[] {
  const chapters = sections.flatMap((section, index) => (section.chapter ? [{ index, title: section.chapter }] : []));
  return chapters.length ? chapters : sections.map((section, index) => ({ index, title: section.title }));
}

// The picker entry the section at `index` belongs to: the last entry at or before it, or, before the
// first chapter, the section itself.
export function pickerEntryAt(entries: PickerEntry[], sections: SiddurSection[], index: number): PickerEntry | null {
  const section = sections[index];
  if (!section) return null;
  const owner = entries.filter((entry) => entry.index <= index).pop();
  return owner ?? { index, title: section.title };
}

export function siddurLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.75);
}

// Auto-scroll keeps its pace in lines of Hebrew text, so a larger text size scrolls more pixels.
export function autoScrollPixelsPerSecond(linesPerMinute: number, fontSize: number): number {
  return (linesPerMinute * siddurLineHeight(fontSize)) / 60;
}

export function segmentBlocks(segments: SiddurSegment[], field: keyof Labeled, offset = 0): SegmentBlock[] {
  const blocks: SegmentBlock[] = [];
  segments.forEach((segment, index) => {
    const label = segment[field];
    const previous = blocks[blocks.length - 1];
    if (previous && previous.label?.he === label?.he) previous.segments.push(segment);
    else blocks.push({ start: offset + index, ...(label ? { label } : {}), segments: [segment] });
  });
  return blocks;
}

export type MinyanBlock = SegmentBlock & { folded: boolean };
export type OptionalBlock = SegmentBlock & { openByDefault: boolean; minyanBlocks: MinyanBlock[] };
export type SectionFolds = { minyanFolded: boolean; optionalOpen: boolean; blocks: OptionalBlock[] };

// What the reader folds in a section for a prayer mode: grouped by optional label first, then each block
// by minyan label, as the reader draws it. Praying alone folds the minyan-only section and every minyan
// block, and opens an optional passage that is said when praying alone; with a minyan nothing is folded.
export function aloneFolds(section: SiddurSection, mode: PrayerMode): SectionFolds {
  const alone = mode === 'alone';
  return {
    minyanFolded: alone && Boolean(section.minyanOnly),
    optionalOpen: alone && Boolean(section.optional?.alone),
    blocks: segmentBlocks(section.segments, 'optional').map((block) => ({
      ...block,
      openByDefault: alone && Boolean(block.label?.alone),
      minyanBlocks: segmentBlocks(block.segments, 'minyan', block.start).map((inner) => ({
        ...inner,
        folded: alone && Boolean(inner.label),
      })),
    })),
  };
}
