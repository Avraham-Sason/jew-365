import { SiddurCredit, SiddurSegment } from './siddur';

export type ChokSlot = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'thuNight' | 'fri';

export type ChokSectionKind =
  'torah' | 'neviim' | 'ketuvim' | 'mishnah' | 'gemara' | 'zohar' | 'halacha' | 'mussar' | 'haftarah';

export type HaftarahVariant = 'sephardi' | 'ashkenazi';

export type ChokDoubleChoice = 'first' | 'second' | 'both';

export type ChokSection = {
  kind: ChokSectionKind;
  heading: string;
  variant?: HaftarahVariant;
  segments: SiddurSegment[];
};

export type ChokAsset = {
  parasha: string;
  credit: SiddurCredit;
  dedication: string | null;
  slots: Partial<Record<ChokSlot, ChokSection[]>>;
};
