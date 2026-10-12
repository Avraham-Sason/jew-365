import { create } from 'zustand';
import { persist, createJSONStorage } from './zustandMiddleware';
import { createTaharahZustandStorage, taharahStorage } from '@/services/TaharahStorage';
import { STORE_VERSION, migrate, onRehydrateStorage } from './persistOptions';
import { TAHARAH_PRESETS, presetForNusach, rulesFor } from '@/data/taharahPresets';
import type { Nusach } from '@/types/mitzvah';
import type { Gender } from './useUserStore';
import type { TaharahEvent, TaharahPresetId, TaharahRole, TaharahRules, TaharahSettings } from '@/types/taharah';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type TaharahEventInput = DistributiveOmit<TaharahEvent, 'id' | 'recordedAt'>;

export type TaharahLeads = {
  hefsekLeadMin: number;
  bedikaEveningLeadMin: number;
  tevilaPrepLeadMin: number;
};

type TaharahData = TaharahLeads & {
  events: TaharahEvent[];
  settings: TaharahSettings;
  discreetNotifications: boolean;
  lockEnabled: boolean;
};

type TaharahState = TaharahData & {
  addEvent: (event: TaharahEventInput) => string;
  removeEvent: (id: string) => void;
  setPreset: (preset: TaharahPresetId) => void;
  setRule: <K extends keyof TaharahRules>(key: K, value: TaharahRules[K]) => void;
  setRole: (role: TaharahRole) => void;
  setRoleForGender: (gender: Gender) => void;
  startTracking: (gender: Gender, nusach: Nusach) => void;
  adoptPresetFor: (nusach: Nusach) => void;
  setDiscreetNotifications: (v: boolean) => void;
  setLockEnabled: (v: boolean) => void;
  setLeads: (leads: Partial<TaharahLeads>) => void;
  clearEvents: () => void;
  reset: () => void;
};

const initialData = (): TaharahData => ({
  events: [],
  settings: { preset: 'ashkenaz', rules: rulesFor('ashkenaz'), role: 'woman' },
  discreetNotifications: true,
  lockEnabled: true,
  hefsekLeadMin: 90,
  bedikaEveningLeadMin: 60,
  tevilaPrepLeadMin: 180,
});

const roleFor = (gender: Gender): TaharahRole => (gender === 'female' ? 'woman' : 'husband');

const sameRules = (a: TaharahRules, b: TaharahRules) =>
  (Object.keys(b) as (keyof TaharahRules)[]).every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));

const isUntouched = (s: TaharahData) =>
  s.events.length === 0 && sameRules(s.settings.rules, rulesFor(s.settings.preset));

const settingsForNusach = (s: TaharahData, nusach: Nusach): TaharahSettings => {
  if (!isUntouched(s)) return s.settings;
  const preset = presetForNusach(nusach);
  return { ...s.settings, preset, rules: rulesFor(preset) };
};

const idSuffix = () => Math.random().toString(36).slice(2, 6).padEnd(4, '0');

export const useTaharahStore = create<TaharahState>()(
  persist(
    (set, get) => ({
      ...initialData(),
      addEvent: (event) => {
        const recordedAt = Date.now();
        const taken = new Set(get().events.map((e) => e.id));
        let id = `taharah_${recordedAt}_${idSuffix()}`;
        while (taken.has(id)) id = `taharah_${recordedAt}_${idSuffix()}`;
        set((s) => ({ events: [...s.events, { ...event, id, recordedAt }] }));
        return id;
      },
      removeEvent: (id) => set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
      setPreset: (preset) => set((s) => ({ settings: { ...s.settings, preset, rules: rulesFor(preset) } })),
      setRule: (key, value) =>
        set((s) => ({ settings: { ...s.settings, rules: { ...s.settings.rules, [key]: value } } })),
      setRole: (role) => set((s) => ({ settings: { ...s.settings, role } })),
      setRoleForGender: (gender) => set((s) => ({ settings: { ...s.settings, role: roleFor(gender) } })),
      startTracking: (gender, nusach) =>
        set((s) => ({ settings: { ...settingsForNusach(s, nusach), role: roleFor(gender) } })),
      adoptPresetFor: (nusach) => set((s) => ({ settings: settingsForNusach(s, nusach) })),
      setDiscreetNotifications: (v) => set({ discreetNotifications: v }),
      setLockEnabled: (v) => set({ lockEnabled: v }),
      setLeads: (leads) => set(leads),
      clearEvents: () => set({ events: [] }),
      reset: () => set(initialData()),
    }),
    {
      name: 'taharah-store',
      storage: createJSONStorage(() => createTaharahZustandStorage()),
      version: STORE_VERSION,
      migrate,
      onRehydrateStorage: onRehydrateStorage('taharah-store', taharahStorage),
      // `settings` is nested, so zustand's shallow merge would replace it whole and a rule added in a
      // later release would never reach a user who saved the old shape.
      // A preset id this build does not know (a rollback past the release that added it) keeps the
      // saved rules under the current preset label: a throw here would drop the whole store.
      merge: (persisted: unknown, current: TaharahState): TaharahState => {
        const saved = persisted as Partial<TaharahData> | undefined;
        const savedPreset = saved?.settings?.preset;
        const preset = savedPreset && savedPreset in TAHARAH_PRESETS ? savedPreset : current.settings.preset;
        return {
          ...current,
          ...saved,
          settings: {
            ...current.settings,
            ...saved?.settings,
            preset,
            rules: { ...rulesFor(preset), ...saved?.settings?.rules },
          },
        };
      },
    },
  ),
);
