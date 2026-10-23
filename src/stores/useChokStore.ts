import { create } from 'zustand';
import { persist, createJSONStorage } from './zustandMiddleware';
import { createZustandStorage } from '@/services/StorageService';
import { chokInstallPresent } from '@/services/chokFiles';
import { STORE_VERSION, migrate, onRehydrateStorage } from './persistOptions';
import { ChokDownload, ChokInstall } from '@/types/chok';

type ChokState = {
  installed: ChokInstall | null;
  latestVersion: number | null;
  checkedAt: number | null;
  download: ChokDownload;
  setInstalled: (install: ChokInstall) => void;
  clearInstalled: () => void;
  setChecked: (version: number, at: number) => void;
  setDownload: (download: ChokDownload) => void;
  reset: () => void;
};

export const IDLE_DOWNLOAD: ChokDownload = Object.freeze({ status: 'idle' });

export const selectChokUpdateAvailable = (s: Pick<ChokState, 'installed' | 'latestVersion'>): boolean =>
  s.installed !== null && s.latestVersion !== null && s.latestVersion > s.installed.version;

// An Android restore carries this store in the main MMKV file but not the files under files/chok, so
// an install whose files are gone is dropped on hydrate.
export function mergeSavedChokState(persisted: unknown, current: ChokState): ChokState {
  const saved = persisted as Partial<ChokState> | undefined;
  return {
    ...current,
    ...saved,
    installed: saved?.installed && chokInstallPresent(saved.installed) ? saved.installed : null,
    download: IDLE_DOWNLOAD,
  };
}

export const useChokStore = create<ChokState>()(
  persist(
    (set) => ({
      installed: null,
      latestVersion: null,
      checkedAt: null,
      download: IDLE_DOWNLOAD,
      setInstalled: (installed) => set({ installed }),
      clearInstalled: () => set({ installed: null }),
      setChecked: (latestVersion, checkedAt) => set({ latestVersion, checkedAt }),
      setDownload: (download) => set({ download }),
      reset: () => set({ installed: null, latestVersion: null, checkedAt: null, download: IDLE_DOWNLOAD }),
    }),
    {
      name: 'chok-store',
      storage: createJSONStorage(() => createZustandStorage()),
      version: STORE_VERSION,
      migrate,
      onRehydrateStorage: onRehydrateStorage('chok-store'),
      partialize: ({ installed, latestVersion, checkedAt }) => ({ installed, latestVersion, checkedAt }),
      merge: mergeSavedChokState,
    },
  ),
);
