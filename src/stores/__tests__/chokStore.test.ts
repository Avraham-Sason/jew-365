jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

import type { ChokInstall } from '@/types/chok';

type ChokStoreModule = typeof import('../useChokStore');

const INSTALL: ChokInstall = { version: 1, bytes: 100, installedAt: 7, files: { Noach: 'noach.0000000a.json' } };

function hydrate(present: boolean): ChokStoreModule {
  let loaded!: ChokStoreModule;
  jest.isolateModules(() => {
    jest.doMock('@/services/chokFiles', () => ({ chokInstallPresent: () => present }));
    const { storage } = require('@/services/StorageService');
    storage.set(
      'chok-store',
      JSON.stringify({ state: { installed: INSTALL, latestVersion: 2, checkedAt: 5 }, version: 1 }),
    );
    loaded = require('../useChokStore');
  });
  return loaded;
}

describe('useChokStore', () => {
  it('drops an install whose files are gone on hydrate, and keeps the version it last saw', () => {
    const { useChokStore } = hydrate(false);
    const state = useChokStore.getState();
    expect(state.installed).toBeNull();
    expect(state.latestVersion).toBe(2);
    expect(state.checkedAt).toBe(5);
    expect(state.download).toEqual({ status: 'idle' });
  });

  it('keeps an install whose files are all there', () => {
    expect(hydrate(true).useChokStore.getState().installed).toEqual(INSTALL);
  });

  it('restores the defaults on reset', () => {
    const { useChokStore } = hydrate(true);
    useChokStore.getState().setDownload({ status: 'failed', reason: 'offline' });
    useChokStore.getState().reset();
    expect(useChokStore.getState()).toMatchObject({
      installed: null,
      latestVersion: null,
      checkedAt: null,
      download: { status: 'idle' },
    });
  });

  it('reports an update only for an install older than the latest version seen', () => {
    const { selectChokUpdateAvailable } = hydrate(true);
    expect(selectChokUpdateAvailable({ installed: null, latestVersion: 2 })).toBe(false);
    expect(selectChokUpdateAvailable({ installed: INSTALL, latestVersion: 1 })).toBe(false);
    expect(selectChokUpdateAvailable({ installed: INSTALL, latestVersion: 2 })).toBe(true);
  });

  it('persists the install and the check, never the download', () => {
    const { useChokStore } = hydrate(true);
    useChokStore.getState().setDownload({ status: 'downloading', done: 1, total: 54, bytes: 1, totalBytes: 2 });
    const partialize = useChokStore.persist.getOptions().partialize!;
    const saved = partialize(useChokStore.getState());
    expect(saved).not.toHaveProperty('download');
    expect(Object.keys(saved as object).sort()).toEqual(['checkedAt', 'installed', 'latestVersion']);
  });
});
