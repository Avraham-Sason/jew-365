import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { customToMitzvah } from '@/data/customMitzvotAdapter';
import { MITZVOT } from '@/data/mitzvot';
import { useChokStore } from '@/stores/useChokStore';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { useCustomMitzvotStore } from '@/stores/useCustomMitzvotStore';
import { ActiveMitzvahState, enabledSinceOf, useMitzvotStore } from '@/stores/useMitzvotStore';
import { useUserStore } from '@/stores/useUserStore';
import { CustomMitzvah, Mitzvah, Nusach, UserSettings } from '@/types/mitzvah';
import { Location } from '@/types/zmanim';
import type { CheckInInput } from '@/utils/checkIn';
import { mitzvahName } from '@/utils/mitzvahName';

export type DayModelState = {
  location: Location;
  nusach: Nusach;
  inIsrael: boolean;
  language: 'he' | 'en';
  halachicOpinions: UserSettings['halachicOpinions'];
  activeMitzvot: Record<string, ActiveMitzvahState>;
  customItems: Record<string, CustomMitzvah>;
  chokInstalled: boolean;
};

export type DayModel = {
  allMitzvot: Mitzvah[];
  enabled: Mitzvah[];
  location: Location;
  nusach: Nusach;
  inIsrael: boolean;
  language: 'he' | 'en';
  chokInstalled: boolean;
  settings: UserSettings;
  nameFor: (mitzvah: Pick<Mitzvah, 'name'>) => string;
  checkInInput: () => CheckInInput;
};

export function dayModelFrom(state: DayModelState): DayModel {
  const { location, nusach, inIsrael, language, halachicOpinions, activeMitzvot, customItems, chokInstalled } = state;
  const customs = Object.values(customItems)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(customToMitzvah);
  const allMitzvot = [...MITZVOT, ...customs].filter((mitzvah) => mitzvah.nuschaotSupported.includes(nusach));
  const enabled = allMitzvot.filter((mitzvah) => activeMitzvot[mitzvah.id]?.enabled);
  const settings: UserSettings = { nusach, halachicOpinions, inIsrael };
  return {
    allMitzvot,
    enabled,
    location,
    nusach,
    inIsrael,
    language,
    chokInstalled,
    settings,
    nameFor: (mitzvah) => mitzvahName(mitzvah, language),
    checkInInput: () => {
      const { completions, skipped, checkIns } = useCompletionsStore.getState();
      return {
        mitzvot: enabled,
        completions,
        skipped,
        checkIns,
        enabledSince: enabledSinceOf(activeMitzvot),
        location,
        settings,
      };
    },
  };
}

// Completions are not subscribed here: a screen that renders them keeps its own selector, and
// `checkInInput()` reads them from the store at the moment it is called.
export function useDayModel(): DayModel {
  const user = useUserStore(
    useShallow((s) => ({
      location: s.location,
      nusach: s.nusach,
      inIsrael: s.inIsrael,
      language: s.language,
      halachicOpinions: s.halachicOpinions,
    })),
  );
  const activeMitzvot = useMitzvotStore((s) => s.activeMitzvot);
  const customItems = useCustomMitzvotStore((s) => s.items);
  const chokInstalled = useChokStore((s) => s.installed !== null);
  return useMemo(
    () => dayModelFrom({ ...user, activeMitzvot, customItems, chokInstalled }),
    [user, activeMitzvot, customItems, chokInstalled],
  );
}
