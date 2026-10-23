jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  dismissAllNotificationsAsync: jest.fn(),
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

const mockDeleteChokFiles = jest.fn();
jest.mock('@/services/chokFiles', () => ({
  ...jest.requireActual('@/services/chokFiles'),
  deleteChokFiles: () => mockDeleteChokFiles(),
}));

import { AppResetService } from '../AppResetService';
import { taharahStorage } from '../TaharahStorage';
import { useUserStore } from '@/stores/useUserStore';
import { useTaharahStore } from '@/stores/useTaharahStore';
import { useChokStore } from '@/stores/useChokStore';
import { installChokFixture } from '@/testing/chok';

const SecureStore = require('expo-secure-store');

describe('AppResetService.reset', () => {
  beforeEach(() => {
    // The stock MMKV mock warns that it cannot recrypt.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('wipes the taharah log, settings and persisted bytes, and replaces the key', async () => {
    useUserStore.getState().setNusach('chabad');
    useUserStore.getState().setTheme('plum');
    useUserStore.getState().setGender('female');
    useUserStore.getState().setMaritalStatus('married');
    useUserStore.getState().setTaharahEnabled(true);
    useTaharahStore.getState().addEvent({ type: 'onset', onah: { abs: 740000, kind: 'night' } });
    useTaharahStore.getState().setPreset('chabad');
    expect(taharahStorage.getString('taharah-store')).toContain('onset');
    const keyBefore = SecureStore.__store.get('taharah-mmkv-key');

    await AppResetService.reset();

    expect(useUserStore.getState().nusach).toBe('ashkenaz');
    expect(useUserStore.getState().theme).toBe('gold');
    expect(useUserStore.getState().gender).toBeNull();
    expect(useUserStore.getState().maritalStatus).toBeNull();
    expect(useUserStore.getState().taharahEnabled).toBe(false);
    expect(useTaharahStore.getState().events).toEqual([]);
    expect(useTaharahStore.getState().settings.preset).toBe('ashkenaz');
    expect(taharahStorage.getString('taharah-store')).toBeUndefined();
    expect(SecureStore.__store.get('taharah-mmkv-key')).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(SecureStore.__store.get('taharah-mmkv-key')).not.toBe(keyBefore);
  });

  it('forgets the Chok LeYisrael add-on and deletes its files', async () => {
    installChokFixture();
    mockDeleteChokFiles.mockClear();

    await AppResetService.reset();

    expect(useChokStore.getState().installed).toBeNull();
    expect(mockDeleteChokFiles).toHaveBeenCalledTimes(1);
  });
});
