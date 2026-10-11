import { Platform } from 'react-native';
import type { Mitzvah, Reminder, UserSettings } from '@/types/mitzvah';
import type { Location } from '@/types/zmanim';
import { getAllMitzvot } from '@/data/customMitzvotAdapter';
import { enabledSinceOf, useMitzvotStore } from '@/stores/useMitzvotStore';
import { useUserStore } from '@/stores/useUserStore';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { useTaharahStore } from '@/stores/useTaharahStore';
import type { PlanInput } from '@/services/notifications/types';

// What a plan is made for: the horizon's start, the mitzvot to plan, and the place and settings they
// are computed at. A rebuild takes all four from the stores; a caller may hand in its own.
export type PlanScope = { fromDate: Date; mitzvot: Mitzvah[]; location: Location; settings: UserSettings };

export function hasNotificationPermission(): boolean {
  const s = useUserStore.getState();
  if (s.notificationsEnabled === false) return false;
  return s.notificationPermission !== 'denied';
}

export function enabledMitzvot(): Mitzvah[] {
  const active = useMitzvotStore.getState().activeMitzvot;
  return getAllMitzvot(useUserStore.getState().nusach).filter((m) => active[m.id]?.enabled);
}

export function currentSettings(): UserSettings {
  const { nusach, halachicOpinions, inIsrael } = useUserStore.getState();
  return { nusach, halachicOpinions, inIsrael };
}

export function currentScope(fromDate: Date = new Date()): PlanScope {
  return {
    fromDate,
    mitzvot: enabledMitzvot(),
    location: useUserStore.getState().location,
    settings: currentSettings(),
  };
}

function reminderOverridesFor(mitzvot: Mitzvah[]): Record<string, Reminder[]> {
  const { activeMitzvot } = useMitzvotStore.getState();
  const overrides: Record<string, Reminder[]> = {};
  for (const { id } of mitzvot) {
    const custom = activeMitzvot[id]?.customReminders;
    if (custom) overrides[id] = custom;
  }
  return overrides;
}

// The one place a plan reads the stores: planners and `buildPlan()` see only what is returned here.
export function readPlanInput(now: Date, scope: PlanScope = currentScope(now)): PlanInput {
  const user = useUserStore.getState();
  const { completions, skipped, checkIns } = useCompletionsStore.getState();
  const taharah = useTaharahStore.getState();
  return {
    now,
    fromDate: scope.fromDate,
    platform: Platform.OS,
    hasPermission: hasNotificationPermission(),
    language: user.language,
    location: scope.location,
    settings: scope.settings,
    mitzvot: scope.mitzvot,
    reminderOverrides: reminderOverridesFor(scope.mitzvot),
    completions,
    skipped,
    checkIns,
    enabledSince: enabledSinceOf(useMitzvotStore.getState().activeMitzvot),
    hilulotEnabled: user.hilulotEnabled,
    roshChodeshEnabled: user.roshChodeshEnabled,
    weeklyReportEnabled: user.weeklyReportEnabled,
    taharahEnabled: user.taharahEnabled,
    taharah: {
      events: taharah.events,
      settings: taharah.settings,
      discreet: taharah.discreetNotifications,
      leads: {
        hefsekLeadMin: taharah.hefsekLeadMin,
        bedikaEveningLeadMin: taharah.bedikaEveningLeadMin,
        tevilaPrepLeadMin: taharah.tevilaPrepLeadMin,
      },
    },
  };
}
