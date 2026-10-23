jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  getPresentedNotificationsAsync: jest.fn(async () => []),
  dismissNotificationAsync: jest.fn(),
  dismissAllNotificationsAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => ({})),
  setNotificationCategoryAsync: jest.fn(async () => ({})),
  registerTaskAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  AndroidImportance: { HIGH: 'high', DEFAULT: 'default' },
  AndroidNotificationVisibility: { PUBLIC: 'public', PRIVATE: 'private' },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('@/services/chokFiles', () => ({
  ...jest.requireActual('@/services/chokFiles'),
  deleteChokFiles: jest.fn(),
}));
jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  getStatusAsync: jest.fn(),
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
}));

import * as TaskManager from 'expo-task-manager';
import { AppResetService } from '../AppResetService';
import { clearLastError, getLastError, reportError } from '../errors';
import {
  DAILY_REBUILD_TASK,
  LAST_REBUILD_KEY,
  NotificationScheduler,
  initNotificationHandlers,
} from '../NotificationScheduler';
import { StorageService } from '../StorageService';
import { useUserStore } from '@/stores/useUserStore';

const dailyRebuildTask = (TaskManager.defineTask as jest.Mock).mock.calls.find(
  ([name]) => name === DAILY_REBUILD_TASK,
)![1] as () => Promise<number>;

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('scheduler and reset report to the error channel', () => {
  beforeEach(() => {
    clearLastError();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('initNotificationHandlers', () => {
    let teardown: () => void;
    afterEach(() => teardown());

    it('reports the rebuild that follows the permission sync', async () => {
      jest.spyOn(NotificationScheduler, 'rebuild').mockRejectedValue(new Error('sync rebuild'));
      useUserStore.setState({ notificationPermission: 'denied' });
      teardown = initNotificationHandlers();
      await flush();
      expect(getLastError()).toMatchObject({ scope: 'schedule', message: 'sync rebuild' });
    });

    it('reports a rebuild that a store change started', async () => {
      useUserStore.setState({ notificationsEnabled: false, notificationPermission: 'granted' });
      teardown = initNotificationHandlers();
      await flush();
      expect(getLastError()).toBeNull();
      jest.spyOn(NotificationScheduler, 'rebuild').mockRejectedValue(new Error('store rebuild'));
      useUserStore.setState({ notificationsEnabled: true });
      await flush();
      expect(getLastError()).toMatchObject({ scope: 'schedule', message: 'store rebuild' });
    });

    it('reports a cancelAll that switching notifications off started', async () => {
      useUserStore.setState({ notificationsEnabled: true, notificationPermission: 'granted' });
      teardown = initNotificationHandlers();
      await flush();
      jest.spyOn(NotificationScheduler, 'cancelAll').mockRejectedValue(new Error('cancel failed'));
      useUserStore.setState({ notificationsEnabled: false });
      await flush();
      expect(getLastError()).toMatchObject({ scope: 'schedule', message: 'cancel failed' });
    });

    it('reports a failed foreground refresh', async () => {
      useUserStore.setState({ isOnboarded: true, notificationPermission: 'granted' });
      StorageService.delete(LAST_REBUILD_KEY);
      jest.spyOn(NotificationScheduler, 'rebuildForNewDay').mockRejectedValue(new Error('foreground refresh'));
      jest.useFakeTimers({
        now: new Date(2026, 10, 11, 6, 0),
        doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout'],
      });
      try {
        teardown = initNotificationHandlers();
        await flush();
      } finally {
        jest.useRealTimers();
        useUserStore.setState({ isOnboarded: false });
      }
      expect(getLastError()).toMatchObject({ scope: 'schedule', message: 'foreground refresh' });
    });
  });

  it('the daily task reports a failed rebuild and still returns Failed', async () => {
    StorageService.delete(LAST_REBUILD_KEY);
    jest.spyOn(NotificationScheduler, 'rebuildForNewDay').mockRejectedValue(new Error('nightly'));
    jest.useFakeTimers({
      now: new Date(2026, 10, 11, 6, 0),
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout'],
    });
    let result: number;
    try {
      result = await dailyRebuildTask();
    } finally {
      jest.useRealTimers();
    }
    expect(result).toBe(2);
    expect(getLastError()).toMatchObject({ scope: 'schedule', message: 'nightly' });
  });

  describe('a rebuild that completes', () => {
    it('clears a schedule error', async () => {
      reportError('schedule', new Error('old failure'));
      await NotificationScheduler.rebuild();
      expect(getLastError()).toBeNull();
    });

    it('clears a schedule error through the day-rollover rebuild too', async () => {
      reportError('schedule', new Error('old failure'));
      await NotificationScheduler.rebuildForNewDay();
      expect(getLastError()).toBeNull();
    });

    it('leaves an error of another scope alone', async () => {
      reportError('reset', new Error('reset failure'));
      await NotificationScheduler.rebuild();
      expect(getLastError()).toMatchObject({ scope: 'reset', message: 'reset failure' });
    });

    it('does not clear anything when the rebuild itself throws', async () => {
      reportError('schedule', new Error('old failure'));
      jest.spyOn(NotificationScheduler, 'cancelAll').mockRejectedValue(new Error('cancel failed'));
      await expect(NotificationScheduler.rebuild()).rejects.toThrow('cancel failed');
      expect(getLastError()).toMatchObject({ scope: 'schedule', message: 'old failure' });
    });
  });

  describe('AppResetService.reset', () => {
    it('reports a cancelAll that fails and still resets the stores', async () => {
      jest.spyOn(NotificationScheduler, 'cancelAll').mockRejectedValue(new Error('cannot cancel'));
      useUserStore.setState({ nusach: 'chabad' });
      await AppResetService.reset();
      expect(getLastError()).toMatchObject({ scope: 'reset', message: 'cannot cancel' });
      expect(useUserStore.getState().nusach).toBe('ashkenaz');
    });

    it('drops an error from before the reset', async () => {
      reportError('schedule', new Error('old state'));
      await AppResetService.reset();
      expect(getLastError()).toBeNull();
    });
  });
});
