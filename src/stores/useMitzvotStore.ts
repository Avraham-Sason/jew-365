import { create } from 'zustand';
import { persist, createJSONStorage } from './zustandMiddleware';
import { createZustandStorage } from '@/services/StorageService';
import { STORE_VERSION, migrate, onRehydrateStorage } from './persistOptions';
import { MITZVOT } from '@/data/mitzvot';
import { Reminder } from '@/types/mitzvah';

export type ActiveMitzvahState = {
  enabled: boolean;
  customReminders?: Reminder[];
  // When it was last switched on. Missing means since before this was recorded, so a history that
  // predates it is judged as before; a later switch-on never turns earlier days into misses.
  enabledAt?: number;
};

function switchedTo(current: ActiveMitzvahState | undefined, enabled: boolean): ActiveMitzvahState {
  const turnedOn = enabled && !current?.enabled;
  return { ...(current ?? {}), enabled, ...(turnedOn ? { enabledAt: Date.now() } : {}) };
}

// A missing entry reads as switched off. One frozen object, because a zustand selector that returns a
// fresh `{ enabled: false }` on every snapshot makes useSyncExternalStore re-render without end.
export const INACTIVE: ActiveMitzvahState = Object.freeze({ enabled: false });

export const selectActive =
  (id: string) =>
  (state: { activeMitzvot: Record<string, ActiveMitzvahState> }): ActiveMitzvahState =>
    state.activeMitzvot[id] ?? INACTIVE;

// The switch-on time of every mitzvah that has one, for the history and the check-in.
export function enabledSinceOf(active: Record<string, ActiveMitzvahState>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(active).flatMap(([id, state]) => (state.enabledAt ? [[id, state.enabledAt]] : [])),
  );
}

type MitzvotState = {
  activeMitzvot: Record<string, ActiveMitzvahState>;
  setEnabled: (id: string, enabled: boolean) => void;
  toggleEnabled: (id: string) => void;
  setReminders: (id: string, reminders: Reminder[]) => void;
  resetToDefault: (id: string) => void;
  getEnabledIds: () => string[];
  removeMitzvah: (id: string) => void;
  reset: () => void;
};

const DEFAULT_ACTIVE: Record<string, ActiveMitzvahState> = Object.fromEntries(
  MITZVOT.filter((m) => ['tefillin', 'krias_shma_shacharit', 'shacharit', 'mincha', 'maariv'].includes(m.id)).map(
    (m) => [m.id, { enabled: true }],
  ),
);

const RETIRED_MITZVOT = ['tzitzit'];

const withoutRetired = (active: Record<string, ActiveMitzvahState>) =>
  Object.fromEntries(Object.entries(active).filter(([id]) => !RETIRED_MITZVOT.includes(id)));

for (const m of MITZVOT) {
  if (!(m.id in DEFAULT_ACTIVE)) DEFAULT_ACTIVE[m.id] = { enabled: false };
}

export const useMitzvotStore = create<MitzvotState>()(
  persist(
    (set, get) => ({
      activeMitzvot: DEFAULT_ACTIVE,
      setEnabled: (id, enabled) =>
        set((s) => ({
          activeMitzvot: {
            ...s.activeMitzvot,
            [id]: switchedTo(s.activeMitzvot[id], enabled),
          },
        })),
      toggleEnabled: (id) =>
        set((s) => {
          const cur = s.activeMitzvot[id];
          return {
            activeMitzvot: { ...s.activeMitzvot, [id]: switchedTo(cur, !cur?.enabled) },
          };
        }),
      setReminders: (id, reminders) =>
        set((s) => ({
          activeMitzvot: {
            ...s.activeMitzvot,
            [id]: { ...(s.activeMitzvot[id] ?? { enabled: false }), customReminders: reminders },
          },
        })),
      resetToDefault: (id) =>
        set((s) => {
          const next = { ...s.activeMitzvot };
          next[id] = { enabled: next[id]?.enabled ?? false, enabledAt: next[id]?.enabledAt };
          return { activeMitzvot: next };
        }),
      getEnabledIds: () =>
        Object.entries(get().activeMitzvot)
          .filter(([, v]) => v.enabled)
          .map(([id]) => id),
      removeMitzvah: (id) =>
        set((s) => {
          const next = { ...s.activeMitzvot };
          delete next[id];
          return { activeMitzvot: next };
        }),
      reset: () => set({ activeMitzvot: { ...DEFAULT_ACTIVE } }),
    }),
    {
      name: 'mitzvot-store',
      storage: createJSONStorage(() => createZustandStorage()),
      version: STORE_VERSION,
      migrate,
      onRehydrateStorage: onRehydrateStorage('mitzvot-store'),
      // A mitzvah shipped in a later release has no key in a persisted map, so `active[id]?.enabled`
      // is undefined forever and the mitzvah is invisible. Union the defaults back in on hydrate.
      merge: (persisted: unknown, current: MitzvotState): MitzvotState => {
        const saved = persisted as Partial<MitzvotState> | undefined;
        return {
          ...current,
          ...saved,
          activeMitzvot: { ...DEFAULT_ACTIVE, ...withoutRetired(saved?.activeMitzvot ?? {}) },
        };
      },
    },
  ),
);
