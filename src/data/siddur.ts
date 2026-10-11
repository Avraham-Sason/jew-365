import { HDate } from '@hebcal/core';
import { ContentBlock, Mitzvah, Nusach } from '@/types/mitzvah';
import { Location } from '@/types/zmanim';
import { HebcalService } from '@/services/HebcalService';
import {
  Condition,
  DayFeatures,
  MitzvahTextId,
  Place,
  SiddurGroup,
  SiddurText,
  SiddurTextId,
  StandaloneTextId,
} from '@/types/siddur';
import { isJerusalem } from './mitzvot';
import { dayFeatures, liturgicalDay, matchesCondition } from '@/utils/siddur';
import { SIDDUR_ASSETS } from './siddurAssets.generated';

type SiddurEntry = { evening: boolean; available?: Condition };

export const SIDDUR_TEXTS: Record<MitzvahTextId, SiddurEntry> = {
  tefillin: { evening: false },
  birchot_hashachar: { evening: false },
  krias_shma_shacharit: { evening: false },
  candle_lighting: { evening: true },
  havdalah: { evening: true, available: { none: ['yomTov'] } },
  sefirat_haomer: { evening: true },
  shacharit: { evening: false, available: { none: ['shabbat', 'yomTov', 'yomKippur'] } },
  mincha: { evening: false, available: { none: ['shabbat', 'yomTov', 'yomKippur'] } },
  maariv: { evening: true, available: { none: ['shabbat', 'yomTov', 'yomKippur'] } },
};

// `evening` texts are said at night and resolve for the night in effect or coming next;
// `availableLabel` tells the catalog when a text whose `available` fails today can be said.
export type StandaloneEntry = {
  name: { he: string; en: string };
  group: SiddurGroup;
  evening?: boolean;
  available?: Condition;
  availableLabel?: { he: string; en: string };
};

export const STANDALONE_TEXTS: Record<StandaloneTextId, StandaloneEntry> = {
  birkat_hamazon: { name: { he: 'ברכת המזון', en: 'Grace After Meals' }, group: 'meals' },
  al_hamichya: { name: { he: 'ברכה מעין שלוש', en: "Me'ein Shalosh" }, group: 'meals' },
  borei_nefashot: { name: { he: 'בורא נפשות', en: 'Borei Nefashot' }, group: 'meals' },
  asher_yatzar: { name: { he: 'אשר יצר', en: 'Asher Yatzar' }, group: 'general' },
  birchot_hanehenin: { name: { he: 'ברכות הנהנין', en: 'Blessings on Food and Fragrance' }, group: 'general' },
  birchot_hareiya: { name: { he: 'ברכות הראייה', en: 'Blessings on Sights and Sounds' }, group: 'general' },
  mezuzah: { name: { he: 'קביעת מזוזה', en: 'Affixing a Mezuzah' }, group: 'general' },
  tefilat_haderech: { name: { he: 'תפילת הדרך', en: "The Traveler's Prayer" }, group: 'general' },
  kriat_shema_al_hamita: { name: { he: 'קריאת שמע על המיטה', en: 'Bedtime Shema' }, group: 'general', evening: true },
  kiddush_levana: {
    name: { he: 'קידוש לבנה', en: 'Kiddush Levana' },
    group: 'general',
    evening: true,
    available: { all: ['kiddushLevana'], none: ['shabbat', 'yomTov', 'yomKippur'] },
    availableLabel: { he: 'מג׳ עד ט״ו בחודש', en: 'From the 3rd to the 15th of the month' },
  },
  tikkun_haklali: { name: { he: 'תיקון הכללי', en: 'Tikkun HaKlali' }, group: 'general' },
  sheva_berachot: { name: { he: 'שבע ברכות', en: 'Sheva Berachot' }, group: 'occasions' },
  chanukah_candles: {
    name: { he: 'הדלקת נרות חנוכה', en: 'Chanukah Candle Lighting' },
    group: 'occasions',
    evening: true,
    available: { all: ['chanukah'] },
    availableLabel: { he: 'בחנוכה', en: 'On Chanukah' },
  },
};

export const SIDDUR_GROUPS: readonly SiddurGroup[] = ['meals', 'general', 'occasions'];

export const SIDDUR_TEXT_IDS: readonly SiddurTextId[] = [
  ...(Object.keys(SIDDUR_TEXTS) as MitzvahTextId[]),
  ...(Object.keys(STANDALONE_TEXTS) as StandaloneTextId[]),
];

export function isSiddurTextId(id: string): id is SiddurTextId {
  return (SIDDUR_TEXT_IDS as readonly string[]).includes(id);
}

const ASSETS: Record<Nusach, Partial<Record<SiddurTextId, number>>> = SIDDUR_ASSETS;

export function mitzvahTextId(mitzvahId: string): MitzvahTextId | null {
  return mitzvahId in SIDDUR_TEXTS ? (mitzvahId as MitzvahTextId) : null;
}

export function standaloneTextId(id: string): StandaloneTextId | null {
  return id in STANDALONE_TEXTS ? (id as StandaloneTextId) : null;
}

export function siddurAsset(nusach: Nusach, id: SiddurTextId): number | undefined {
  return ASSETS[nusach]?.[id];
}

export function standaloneTextsIn(group: SiddurGroup): StandaloneTextId[] {
  return (Object.keys(STANDALONE_TEXTS) as StandaloneTextId[]).filter((id) => STANDALONE_TEXTS[id].group === group);
}

export function hasStandaloneText(id: StandaloneTextId, nusach: Nusach, features: DayFeatures): boolean {
  return siddurAsset(nusach, id) !== undefined && matchesCondition(STANDALONE_TEXTS[id].available, features);
}

// The Hebrew day a standalone text opened with no date resolves for at this instant.
export function standaloneTextDay(id: StandaloneTextId, instant: Date, location: Location): HDate {
  return STANDALONE_TEXTS[id].evening
    ? HebcalService.hebrewNightAt(instant, location)
    : HebcalService.hebrewDayAt(instant, location);
}

export function customSiddurText(mitzvah: Mitzvah, nusach: Nusach): SiddurText | null {
  const blocks = (mitzvah.contentBlocks ?? []).filter(
    (block): block is Extract<ContentBlock, { type: 'text' | 'blessing' }> =>
      block.type === 'text' || block.type === 'blessing',
  );
  if (!blocks.length) return null;
  return {
    nusach,
    id: mitzvah.id,
    sections: [
      {
        title: { he: mitzvah.name.he, en: mitzvah.name.en ?? mitzvah.name.he },
        segments: blocks.map((block) => ({
          he: [[{ t: block.he, ...(block.type === 'blessing' ? { s: 'b' as const } : {}) }]],
          ...(block.en ? { en: block.en } : {}),
        })),
      },
    ],
    credits: [],
  };
}

export function siddurPlace(location: Location, inIsrael: boolean): Place {
  return { inIsrael, jerusalem: isJerusalem(location) };
}

export function hasSiddurText(mitzvah: Mitzvah, nusach: Nusach, windowDate: Date, place: Place): boolean {
  if (mitzvah.isCustom) return customSiddurText(mitzvah, nusach) !== null;
  const id = mitzvahTextId(mitzvah.id);
  if (!id || siddurAsset(nusach, id) === undefined) return false;
  const { evening, available } = SIDDUR_TEXTS[id];
  return matchesCondition(available, dayFeatures(liturgicalDay(windowDate, evening), place));
}
