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

export type ChokManifestFile = { path: string; sha256: string; bytes: number };

export type ChokManifest = {
  format: number;
  version: number;
  credit: { he: string; en: string };
  license: { name: string; url: string; urlHe: string };
  bytes: number;
  files: Record<string, ChokManifestFile>;
};

export type ChokInstall = { version: number; bytes: number; installedAt: number; files: Record<string, string> };

export type ChokFailureReason = 'offline' | 'unavailable' | 'integrity' | 'space' | 'storage';

export type ChokDownload =
  | { status: 'idle' }
  | { status: 'downloading'; done: number; total: number; bytes: number; totalBytes: number }
  | { status: 'failed'; reason: ChokFailureReason };
