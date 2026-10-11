jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  getStatusAsync: jest.fn(),
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
}));

import { STORE_VERSION } from '../persistOptions';
import { SIDDUR_SCROLL_SPEEDS, scrollSpeedLevel, useUserStore } from '../useUserStore';
import { INACTIVE, selectActive, useMitzvotStore } from '../useMitzvotStore';
import { useCompletionsStore, dateKey } from '../useCompletionsStore';
import { useCustomMitzvotStore } from '../useCustomMitzvotStore';

describe('stores', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    useCompletionsStore.setState({ completions: {}, skipped: {} });
  });

  it.each([
    ['user-store', useUserStore],
    ['mitzvot-store', useMitzvotStore],
    ['completions-store', useCompletionsStore],
    ['custom-mitzvot-store', useCustomMitzvotStore],
  ])('%s keeps a persisted state across a version bump (identity migrate)', (name, store) => {
    const options = store.persist.getOptions();
    expect(options.name).toBe(name);
    expect(options.version).toBe(STORE_VERSION);
    const saved = { marker: name };
    expect(options.migrate?.(saved, 0)).toBe(saved);
  });

  it('selectActive returns one frozen object for a missing id, so the detail screen cannot loop', () => {
    const state = useMitzvotStore.getState();
    expect(selectActive('custom_deleted')(state)).toBe(INACTIVE);
    expect(selectActive('custom_deleted')(state)).toBe(selectActive('custom_deleted')(state));
    expect(Object.isFrozen(INACTIVE)).toBe(true);
    expect(selectActive('tefillin')(state)).toBe(state.activeMitzvot.tefillin);
  });

  it('a fresh install reports the default city as missing, not ready', () => {
    useUserStore.getState().reset();
    expect(useUserStore.getState().locationStatus).toBe('missing');
    useUserStore.getState().setLocationState(useUserStore.getState().location, 'ready', 'manual');
    expect(useUserStore.getState().locationStatus).toBe('ready');
  });

  it('4.1 useUserStore setNusach persists', () => {
    useUserStore.getState().setNusach('sefard');
    expect(useUserStore.getState().nusach).toBe('sefard');
  });

  it('4.2 setEnabled tefillin → enabled', () => {
    useMitzvotStore.getState().setEnabled('tefillin', true);
    expect(useMitzvotStore.getState().activeMitzvot.tefillin.enabled).toBe(true);
  });

  it('4.3 resetToDefault drops customReminders', () => {
    useMitzvotStore.getState().setReminders('tefillin', [{ anchor: 'start', offsetMin: 0, label: 'x' }]);
    expect(useMitzvotStore.getState().activeMitzvot.tefillin.customReminders).toBeDefined();
    useMitzvotStore.getState().resetToDefault('tefillin');
    expect(useMitzvotStore.getState().activeMitzvot.tefillin.customReminders).toBeUndefined();
  });

  it('4.4 markDone → isDone true', () => {
    useCompletionsStore.getState().markDone('tefillin');
    expect(useCompletionsStore.getState().isDone('tefillin')).toBe(true);
  });

  it('4.5 unmark → isDone false', () => {
    useCompletionsStore.getState().markDone('tefillin');
    useCompletionsStore.getState().unmark('tefillin');
    expect(useCompletionsStore.getState().isDone('tefillin')).toBe(false);
  });

  it('4.6 markDone today != markDone tomorrow', () => {
    const today = new Date('2026-04-23T10:00:00Z');
    const tomorrow = new Date('2026-04-24T10:00:00Z');
    useCompletionsStore.getState().markDone('tefillin', today);
    expect(useCompletionsStore.getState().isDone('tefillin', today)).toBe(true);
    expect(useCompletionsStore.getState().isDone('tefillin', tomorrow)).toBe(false);
    expect(dateKey(today)).not.toBe(dateKey(tomorrow));
  });

  it('4.7 markSkipped tracks skip without counting as done', () => {
    const today = new Date('2026-04-23T10:00:00Z');
    useCompletionsStore.getState().markSkipped('tefillin', today);
    expect(useCompletionsStore.getState().isSkipped('tefillin', today)).toBe(true);
    expect(useCompletionsStore.getState().isDone('tefillin', today)).toBe(false);
    expect(useCompletionsStore.getState().countForDate(today)).toBe(0);
  });
});

describe('useUserStore auto-scroll', () => {
  beforeEach(() => useUserStore.getState().reset());

  it('starts off at the middle speed and resets to it', () => {
    expect(useUserStore.getState().siddurAutoScroll).toBe(false);
    expect(useUserStore.getState().siddurScrollSpeed).toBe(5);
    useUserStore.getState().setSiddurAutoScroll(true);
    useUserStore.getState().setSiddurScrollSpeed(8);
    expect(useUserStore.getState().siddurAutoScroll).toBe(true);
    expect(useUserStore.getState().siddurScrollSpeed).toBe(8);
    useUserStore.getState().reset();
    expect(useUserStore.getState().siddurAutoScroll).toBe(false);
    expect(useUserStore.getState().siddurScrollSpeed).toBe(5);
  });

  it('keeps a stored speed inside the offered levels', () => {
    useUserStore.getState().setSiddurScrollSpeed(0);
    expect(useUserStore.getState().siddurScrollSpeed).toBe(1);
    useUserStore.getState().setSiddurScrollSpeed(SIDDUR_SCROLL_SPEEDS.length + 3);
    expect(useUserStore.getState().siddurScrollSpeed).toBe(SIDDUR_SCROLL_SPEEDS.length);
    useUserStore.getState().setSiddurScrollSpeed(3.4);
    expect(useUserStore.getState().siddurScrollSpeed).toBe(3);
    useUserStore.getState().setSiddurScrollSpeed(Number.NaN);
    expect(useUserStore.getState().siddurScrollSpeed).toBe(5);
  });

  it('reads any saved speed as an offered level', () => {
    expect(scrollSpeedLevel(Number.POSITIVE_INFINITY)).toBe(5);
    expect(scrollSpeedLevel(-4)).toBe(1);
    expect(scrollSpeedLevel(10)).toBe(10);
    expect(scrollSpeedLevel(15)).toBe(15);
    expect(scrollSpeedLevel(16)).toBe(15);
  });

  it('keeps hilula notices off until switched on, and reset turns them off', () => {
    expect(useUserStore.getState().hilulotEnabled).toBe(false);
    useUserStore.getState().setHilulotEnabled(true);
    expect(useUserStore.getState().hilulotEnabled).toBe(true);
    useUserStore.getState().reset();
    expect(useUserStore.getState().hilulotEnabled).toBe(false);
  });

  it('keeps Rosh Chodesh notices off until switched on, and reset turns them off', () => {
    expect(useUserStore.getState().roshChodeshEnabled).toBe(false);
    useUserStore.getState().setRoshChodeshEnabled(true);
    expect(useUserStore.getState().roshChodeshEnabled).toBe(true);
    expect(useUserStore.getState().hilulotEnabled).toBe(false);
    useUserStore.getState().reset();
    expect(useUserStore.getState().roshChodeshEnabled).toBe(false);
  });

  it('keeps the weekly report on until switched off, and reset turns it back on', () => {
    expect(useUserStore.getState().weeklyReportEnabled).toBe(true);
    useUserStore.getState().setWeeklyReportEnabled(false);
    expect(useUserStore.getState().weeklyReportEnabled).toBe(false);
    expect(useUserStore.getState().roshChodeshEnabled).toBe(false);
    useUserStore.getState().reset();
    expect(useUserStore.getState().weeklyReportEnabled).toBe(true);
  });

  it('merge turns the weekly report on for an install saved before it existed, and keeps a saved off', () => {
    const { merge } = useUserStore.persist.getOptions();
    const current = useUserStore.getState();
    expect(merge!({ nusach: 'sefard' }, current).weeklyReportEnabled).toBe(true);
    expect(merge!({ weeklyReportEnabled: false }, current).weeklyReportEnabled).toBe(false);
  });

  it('offers speeds that rise from level to level', () => {
    SIDDUR_SCROLL_SPEEDS.forEach((pace, index) => {
      if (index > 0) expect(pace).toBeGreaterThan(SIDDUR_SCROLL_SPEEDS[index - 1]);
    });
  });

  it('offers fifteen levels from 5 to 150 lines per minute', () => {
    expect(SIDDUR_SCROLL_SPEEDS).toHaveLength(15);
    expect(SIDDUR_SCROLL_SPEEDS[0]).toBe(5);
    expect(SIDDUR_SCROLL_SPEEDS[14]).toBe(150);
  });

  it('clamps the speed at the fifteenth level', () => {
    useUserStore.getState().setSiddurScrollSpeed(15);
    expect(useUserStore.getState().siddurScrollSpeed).toBe(15);
    useUserStore.getState().setSiddurScrollSpeed(16);
    expect(useUserStore.getState().siddurScrollSpeed).toBe(15);
  });
});

describe('useUserStore prayer mode', () => {
  beforeEach(() => useUserStore.getState().reset());

  it('starts with a minyan, switches to alone and resets to a minyan', () => {
    expect(useUserStore.getState().prayerMode).toBe('minyan');
    useUserStore.getState().setPrayerMode('alone');
    expect(useUserStore.getState().prayerMode).toBe('alone');
    useUserStore.getState().reset();
    expect(useUserStore.getState().prayerMode).toBe('minyan');
  });

  it('keeps the default for a payload saved before the field existed', () => {
    const { merge } = useUserStore.persist.getOptions();
    const current = useUserStore.getState();
    expect(merge!({ nusach: 'sefard' }, current).prayerMode).toBe('minyan');
    expect(merge!({ prayerMode: 'alone' }, current).prayerMode).toBe('alone');
  });
});

describe('useMitzvotStore merge', () => {
  it('prunes a retired mitzvah from a persisted map and keeps every other entry, custom ones included', () => {
    const { merge } = useMitzvotStore.persist.getOptions();
    const current = useMitzvotStore.getState();
    const saved = {
      activeMitzvot: {
        tzitzit: { enabled: true },
        tefillin: { enabled: false },
        custom_1_a: { enabled: true },
      },
    };

    const merged = merge!(saved, current).activeMitzvot;

    expect(merged).not.toHaveProperty('tzitzit');
    expect(merged.tefillin).toEqual({ enabled: false });
    expect(merged.custom_1_a).toEqual({ enabled: true });
    expect(merged.shacharit).toEqual({ enabled: true });
  });

  it('starts a fresh install without tzitzit', () => {
    useMitzvotStore.getState().reset();
    expect(useMitzvotStore.getState().activeMitzvot).not.toHaveProperty('tzitzit');
    expect(useMitzvotStore.getState().getEnabledIds().sort()).toEqual([
      'krias_shma_shacharit',
      'maariv',
      'mincha',
      'shacharit',
      'tefillin',
    ]);
  });
});

describe('useUserStore theme', () => {
  beforeEach(() => useUserStore.getState().reset());

  const coldStart = (state: object, colorScheme: 'light' | 'dark' | null = null) => {
    let started: ReturnType<typeof useUserStore.getState> | undefined;
    jest.isolateModules(() => {
      const { Appearance } = require('react-native');
      const appearance = jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(colorScheme);
      try {
        const { storage: freshStorage } = require('@/services/StorageService');
        freshStorage.set('user-store', JSON.stringify({ version: STORE_VERSION, state }));
        started = require('../useUserStore').useUserStore.getState();
      } finally {
        appearance.mockRestore();
      }
    });
    return started!;
  };

  it('defaults to gold and resets to it', () => {
    expect(useUserStore.getState().theme).toBe('gold');
    useUserStore.getState().setTheme('plum');
    expect(useUserStore.getState().theme).toBe('plum');
    useUserStore.getState().reset();
    expect(useUserStore.getState().theme).toBe('gold');
  });

  it('a cold start keeps a saved palette name', () => {
    expect(coldStart({ theme: 'plum' }).theme).toBe('plum');
  });

  it('a cold start maps the legacy light theme to gold', () => {
    expect(coldStart({ theme: 'light' }, 'dark').theme).toBe('gold');
  });

  it('a cold start keeps the legacy dark theme', () => {
    expect(coldStart({ theme: 'dark' }, 'light').theme).toBe('dark');
  });

  it('a cold start maps the legacy system theme by the OS appearance', () => {
    expect(coldStart({ theme: 'system' }, 'dark').theme).toBe('dark');
    expect(coldStart({ theme: 'system' }, 'light').theme).toBe('gold');
  });

  it('a cold start maps an unknown theme to gold', () => {
    expect(coldStart({ theme: 'neon' }).theme).toBe('gold');
    expect(coldStart({ theme: 'toString' }).theme).toBe('gold');
    expect(coldStart({ theme: 7 }).theme).toBe('gold');
  });

  it('merge maps a retired palette to gold and keeps a live one', () => {
    const { merge } = useUserStore.persist.getOptions();
    const current = useUserStore.getState();
    expect(merge!({ theme: 'sepia' }, current).theme).toBe('gold');
    // Pink, purple and blue were retired on 2026-10-09 and restored on 2026-10-10: a saved pick survives.
    expect(merge!({ theme: 'pink' }, current).theme).toBe('pink');
    expect(merge!({ theme: 'plum' }, current).theme).toBe('plum');
  });

  it('a payload without a theme keeps the default', () => {
    const started = coldStart({ nusach: 'sefard' });
    expect(started.theme).toBe('gold');
    expect(started.nusach).toBe('sefard');
  });
});
