import type { PlatformOSType } from 'react-native';
import type { AppLanguage } from '@/i18n';
import type { Mitzvah, Reminder, UserSettings } from '@/types/mitzvah';
import type { TaharahEvent, TaharahSettings } from '@/types/taharah';
import type { Location } from '@/types/zmanim';
import type { CheckIns, Completions } from '@/stores/useCompletionsStore';
import type { TaharahLeads } from '@/stores/useTaharahStore';
import type { ANDROID_CHANNELS, PendingNotificationMeta } from '@/services/notifications/ids';

export type ChannelKey = keyof typeof ANDROID_CHANNELS;

// What a planner decided to schedule, with nothing of expo-notifications in it: the OS adapter maps
// it to a date trigger on `channel`'s Android channel.
export type ScheduleCandidate = {
  id: string;
  trigger: Date;
  channel: ChannelKey;
  categoryIdentifier?: string;
  title: string;
  body: string;
  data: PendingNotificationMeta;
};

// Every fact a plan depends on, read once by `readPlanInput()`. Planners compute from this and the
// calendar services alone, so the same input always yields the same plan.
export type PlanInput = {
  now: Date;
  // The device-local instant the horizon starts from (today, for a rebuild).
  fromDate: Date;
  platform: PlatformOSType;
  hasPermission: boolean;
  language: AppLanguage;
  location: Location;
  settings: UserSettings;
  mitzvot: Mitzvah[];
  // A mitzvah's own reminders when the user edited them; absent means its defaults.
  reminderOverrides: Record<string, Reminder[]>;
  completions: Completions;
  skipped: Completions;
  checkIns: CheckIns;
  enabledSince: Record<string, number>;
  hilulotEnabled: boolean;
  roshChodeshEnabled: boolean;
  weeklyReportEnabled: boolean;
  taharahEnabled: boolean;
  taharah: {
    events: TaharahEvent[];
    settings: TaharahSettings;
    discreet: boolean;
    leads: TaharahLeads;
  };
};
