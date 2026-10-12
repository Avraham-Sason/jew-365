import { findMitzvah } from '@/data/mitzvot';
import { STANDALONE_TEXTS, isSiddurTextId, standaloneTextId } from '@/data/siddur';
import { TIME_PATTERN, minutesToTime, timeToMinutes } from '@/utils/clock';
import { mitzvahName } from '@/utils/mitzvahName';
import { ContentBlock, MitzvahCategory, Reminder, Weekday } from '@/types/mitzvah';

export type DraftBlock = ContentBlock | { type: 'siddur'; he: string; en?: string; textId: null };

export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];
export const ALL_DAY_MIN = 480;
export const NIGHT_END_MIN = 4 * 60;

const DAY_MIN = 24 * 60;
const NOON_MIN = 12 * 60;
const AFTERNOON_END_MIN = 17 * 60;

export function windowMinutes(startHHMM: string, endHHMM: string): number {
  const span = timeToMinutes(endHHMM) - timeToMinutes(startHHMM);
  return span > 0 ? span : span + DAY_MIN;
}

export function categoryForWindow(startHHMM: string, endHHMM: string): MitzvahCategory {
  const duration = windowMinutes(startHHMM, endHHMM);
  if (duration >= ALL_DAY_MIN) return 'daily-allday';
  const midpoint = (timeToMinutes(startHHMM) + duration / 2) % DAY_MIN;
  if (midpoint < NIGHT_END_MIN) return 'daily-evening';
  if (midpoint < NOON_MIN) return 'daily-morning';
  return midpoint < AFTERNOON_END_MIN ? 'daily-afternoon' : 'daily-evening';
}

export function isActiveOn(activeDays: Weekday[] | undefined, weekday: Weekday): boolean {
  return activeDays === undefined || activeDays.includes(weekday);
}

export function reminderClock(
  startHHMM: string,
  endHHMM: string,
  reminder: Pick<Reminder, 'anchor' | 'offsetMin'>,
): string | null {
  if (!TIME_PATTERN.test(startHHMM) || !TIME_PATTERN.test(endHHMM)) return null;
  const start = timeToMinutes(startHHMM);
  const duration = windowMinutes(startHHMM, endHHMM);
  const trigger = (reminder.anchor === 'start' ? start : start + duration) + reminder.offsetMin;
  if (!(trigger >= start && trigger - start <= duration)) return null;
  return minutesToTime(trigger % DAY_MIN);
}

export function siddurTextName(id: string, language: 'he' | 'en'): string | null {
  const standalone = standaloneTextId(id);
  if (standalone) return STANDALONE_TEXTS[standalone].name[language];
  const mitzvah = findMitzvah(id);
  return mitzvah ? mitzvahName(mitzvah, language) : null;
}

export function cleanContentBlock(block: DraftBlock): ContentBlock | null {
  const he = block.he.trim();
  if (!he) return null;
  if (block.type === 'link') {
    const url = block.url.trim();
    return url ? { type: 'link', he, en: block.en, url } : null;
  }
  if (block.type === 'siddur') {
    return block.textId && isSiddurTextId(block.textId)
      ? { type: 'siddur', he, en: block.en, textId: block.textId }
      : null;
  }
  return { ...block, he };
}

export function cleanContentBlocks(blocks: DraftBlock[]): ContentBlock[] | undefined {
  const cleaned = blocks.map(cleanContentBlock).filter((block): block is ContentBlock => block !== null);
  return cleaned.length ? cleaned : undefined;
}
