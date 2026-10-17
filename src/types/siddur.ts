import { Nusach } from './mitzvah';

export type SukkotOfferingFlag = `sukkotOffering${2 | 3 | 4 | 5 | 6 | 7}`;

// The Ashkenazi selichot days that carry a selichot of their own: the Nth weekday from Leil Selichot,
// and the Nth weekday of the Ten Days, Tzom Gedaliah (`tzomGedaliah`) being the first.
export type SelichotDayFlag = `selichotDay${1 | 2 | 3 | 4 | 5 | 6 | 7}`;
export type SelichotTeshuvaFlag = `selichotTeshuva${2 | 3 | 4 | 5}`;

export type DayFlag =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'shabbat'
  | 'yomTov'
  | 'yomKippur'
  | 'tishaBav'
  | 'shehecheyanu'
  | 'roshChodesh'
  | 'cholHamoedPesach'
  | 'cholHamoedSukkot'
  | 'inIsrael'
  | 'omer'
  | 'winter'
  | 'talUmatar'
  | 'aseretYemeiTeshuva'
  | 'ledavidSeason'
  | 'chanukah'
  | 'purim'
  | 'publicFast'
  | 'tachanunShacharit'
  | 'tachanunMincha'
  | 'tachanunDisputed'
  | 'motzaei'
  | 'motzaeiShabbat'
  | 'viHiNoam'
  | 'erevYomKippur'
  | 'erevPesach'
  | 'purimOrShushan'
  | 'purimKatan'
  | 'torahReading'
  | 'hallelWhole'
  | 'hallelHalf'
  | 'hallelDisputed'
  | 'musaf'
  | 'ulechaparatPesha'
  | 'lulavShehecheyanu'
  | 'hoshanaRabba'
  | 'dayAfterYomKippur'
  | 'tzomGedaliah'
  | 'asaraBTevet'
  | 'taanitEsther'
  | 'tzomTammuz'
  | 'roshChodeshYesterday'
  | 'cholHamoedPesachYesterday'
  | 'cholHamoedSukkotYesterday'
  | 'chanukahYesterday'
  | 'purimYesterday'
  | 'chanukahFirstNight'
  | 'kiddushLevana'
  | 'avBeforeTishaBav'
  | 'erevRoshHashana'
  | 'selichotAshkenazi'
  | 'selichotSephardi'
  | SelichotDayFlag
  | SelichotTeshuvaFlag
  | SukkotOfferingFlag;

export type Place = {
  inIsrael: boolean;
  jerusalem: boolean;
};

export type DayFeatures = {
  flags: ReadonlySet<DayFlag>;
  omerDay: number | null;
};

export type Condition = {
  all?: DayFlag[];
  any?: DayFlag[];
  none?: DayFlag[];
  omerDay?: number;
};

export type Run = { t: string; s?: 'b' | 'n' | 't'; when?: Condition };

export type PassageLabel = { he: string; en: string; when?: Condition; alone?: boolean; marriedOnly?: boolean };

export type SiddurSegment = {
  he: Run[][];
  en?: string;
  when?: Condition;
  optional?: PassageLabel;
  minyan?: PassageLabel;
};

// A heading the reader draws above a section's card: level 1 opens a book of a text, level 2 a part of it.
export type SectionHeading = { he: string; en: string; level: 1 | 2 };

export type SiddurSection = {
  title: { he: string; en: string };
  headings?: SectionHeading[];
  // Opens a chapter of the text: the section picker lists chapters, not every section, when a text
  // has any, and the sections up to the next chapter belong to it.
  chapter?: { he: string; en: string };
  optional?: PassageLabel;
  minyanOnly?: boolean;
  segments: SiddurSegment[];
};

export type SegmentBlock = {
  start: number;
  label?: PassageLabel;
  segments: SiddurSegment[];
};

export type SiddurCredit = {
  title: string;
  license: string;
  url: string;
};

export type SiddurText = {
  nusach?: Nusach;
  id: string;
  sections: SiddurSection[];
  credits: SiddurCredit[];
  dedication?: string;
};

export type MitzvahTextId =
  | 'tefillin'
  | 'birchot_hashachar'
  | 'krias_shma_shacharit'
  | 'candle_lighting'
  | 'havdalah'
  | 'sefirat_haomer'
  | 'shacharit'
  | 'mincha'
  | 'maariv';

export type StandaloneTextId =
  | 'birkat_hamazon'
  | 'al_hamichya'
  | 'borei_nefashot'
  | 'tefilat_haderech'
  | 'asher_yatzar'
  | 'birchot_hanehenin'
  | 'kriat_shema_al_hamita'
  | 'birchot_hareiya'
  | 'kiddush_levana'
  | 'mezuzah'
  | 'sheva_berachot'
  | 'chanukah_candles'
  | 'tikkun_haklali'
  | 'tehillim'
  | 'nishmat'
  | 'selichot';

export type SiddurTextId = MitzvahTextId | StandaloneTextId;

export type SiddurGroup = 'meals' | 'general' | 'occasions';
