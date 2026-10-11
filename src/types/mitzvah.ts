import type { SiddurTextId } from './siddur';
import { Location, Zmanim } from './zmanim';

export type Nusach = 'ashkenaz' | 'sefard' | 'edot_hamizrach' | 'chabad';

export type HalachicOpinion = 'GRA' | 'MA';

export type UserSettings = {
  nusach: Nusach;
  halachicOpinions: { ksSofZman: HalachicOpinion };
  inIsrael: boolean;
};

export type TimeType =
  'fixed-moment' | 'range-within-day' | 'sunset-trigger' | 'date-range' | 'monthly-window' | 'annual-seasonal';

export type MitzvahCategory =
  'daily-morning' | 'daily-afternoon' | 'daily-evening' | 'daily-allday' | 'weekly' | 'seasonal' | 'learning';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type SkipContext = 'shabbat' | 'yomtov' | 'cholHamoed' | 'fastDay';

export type ReminderAnchor = 'start' | 'end';

export type Reminder = {
  anchor: ReminderAnchor;
  offsetMin: number;
  label: string;
  bodyVariants?: string[];
  includeContentInBody?: boolean;
  skipIfDone?: boolean;
};

export type MitzvahWindow = {
  start: Date;
  end: Date;
} | null;

export type ComputeContext = {
  date: Date;
  location: Location;
  settings: UserSettings;
  zmanim: Zmanim;
};

export type ContentBlock =
  | { type: 'text'; he: string; en?: string }
  | { type: 'blessing'; he: string; en?: string }
  | { type: 'link'; he: string; en?: string; url: string }
  | { type: 'siddur'; he: string; en?: string; textId: SiddurTextId };

export type Mitzvah = {
  id: string;
  name: { he: string; en?: string };
  icon: string;
  timeType: TimeType;
  category: MitzvahCategory;
  computeWindow: (ctx: ComputeContext) => MitzvahWindow;
  defaultReminders: Reminder[];
  skipOn: SkipContext[];
  nuschaotSupported: Nusach[];
  description?: { he: string; en?: string };
  contentBlocks?: ContentBlock[];
  isCustom?: boolean;
};

export type CustomMitzvah = {
  id: string;
  name: string;
  startHHMM: string;
  endHHMM: string;
  reminders: Reminder[];
  skipOn: SkipContext[];
  activeDays?: Weekday[];
  contentBlocks?: ContentBlock[];
  createdAt: number;
};
