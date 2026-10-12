jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

const mockGetForeground = jest.fn();
const mockRequestForeground = jest.fn();
const mockGetCurrentPosition = jest.fn();

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: (...args: unknown[]) => mockGetForeground(...args),
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequestForeground(...args),
  getCurrentPositionAsync: (...args: unknown[]) => mockGetCurrentPosition(...args),
  Accuracy: { Balanced: 3 },
}));

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

import { StorageService } from '../StorageService';
import { LocationService } from '../LocationService';
import { CompletionService } from '../CompletionService';
import { CITIES } from '@/data/cities';
import { NotificationScheduler } from '../NotificationScheduler';
import { useCompletionsStore } from '@/stores/useCompletionsStore';

describe('Services', () => {
  beforeEach(() => {
    StorageService.clear();
    useCompletionsStore.setState({ completions: {}, skipped: {} });
    mockGetForeground.mockReset();
    mockRequestForeground.mockReset();
    mockGetCurrentPosition.mockReset();
  });

  it('5.1 StorageService roundtrip JSON', () => {
    StorageService.set('k', { a: 1 });
    expect(StorageService.get<{ a: number }>('k')).toEqual({ a: 1 });
  });

  // The store action queues the cancel itself; the service used to await a second one, so these
  // pin the count, not only the arguments.
  it('5.2 CompletionService.markDone cancels the reminders exactly once', async () => {
    const spy = jest.spyOn(NotificationScheduler, 'cancelForMitzvah').mockResolvedValue();
    await CompletionService.markDone('tefillin');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('tefillin', expect.any(Date));
    spy.mockRestore();
  });

  it('5.2b CompletionService.markSkipped cancels the reminders exactly once', async () => {
    const spy = jest.spyOn(NotificationScheduler, 'cancelForMitzvah').mockResolvedValue();
    await CompletionService.markSkipped('tefillin');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('tefillin', expect.any(Date));
    expect(CompletionService.isSkipped('tefillin')).toBe(true);
    spy.mockRestore();
  });

  it('5.3 LocationService GPS success → returns gps source', async () => {
    mockGetForeground.mockResolvedValue({ granted: true, canAskAgain: true });
    mockGetCurrentPosition.mockResolvedValue({ coords: { latitude: 31.7, longitude: 35.2 } });
    const r = await LocationService.getCurrentLocation();
    expect(r.status).toBe('ready');
    expect(r.source).toBe('gps');
    expect(r.location!.lat).toBeCloseTo(31.7);
    expect(r.location!.inIsrael).toBe(true);
    expect(r.location!.cityId).toBe('jerusalem');
  });

  it('5.3b GPS near a city keeps its own coordinates and carries that city id, elevation and name', async () => {
    mockGetForeground.mockResolvedValue({ granted: true, canAskAgain: true });
    mockGetCurrentPosition.mockResolvedValue({ coords: { latitude: 32.1, longitude: 34.8 } });
    const r = await LocationService.getCurrentLocation();
    expect(r.location).toMatchObject({
      cityId: 'tel-aviv',
      name: 'תל אביב',
      nameEn: 'Tel Aviv',
      lat: 32.1,
      lng: 34.8,
      tz: 'Asia/Jerusalem',
      inIsrael: true,
      elevation: 5,
    });
  });

  it("5.3c GPS near a city takes that city's candle-lighting minutes when it has them", async () => {
    mockGetForeground.mockResolvedValue({ granted: true, canAskAgain: true });
    mockGetCurrentPosition.mockResolvedValue({ coords: { latitude: 32.1, longitude: 34.8 } });
    const telAviv = CITIES[1];
    try {
      telAviv.candleLightingMinutes = 30;
      const r = await LocationService.getCurrentLocation();
      expect(r.location!.cityId).toBe('tel-aviv');
      expect(r.location!.candleLightingMinutes).toBe(30);
    } finally {
      delete telAviv.candleLightingMinutes;
    }
    expect((await LocationService.getCurrentLocation()).location!.candleLightingMinutes).toBeUndefined();
  });

  // Was "denied → fallback CITIES[0]". Returning a real city on failure is what let a denied or
  // timed-out refresh silently overwrite the city the user had chosen.
  it('5.4 LocationService denied → no location, status only', async () => {
    mockGetForeground.mockResolvedValue({ granted: false, canAskAgain: false });
    const r = await LocationService.getCurrentLocation();
    expect(r.status).toBe('denied');
    expect(r.source).toBe('manual');
    expect(r.location).toBeNull();
  });

  it("5.4b GPS far from every preset does not inherit that preset's timezone or inIsrael", async () => {
    mockGetForeground.mockResolvedValue({ granted: true, canAskAgain: true });
    mockGetCurrentPosition.mockResolvedValue({ coords: { latitude: -26.2041, longitude: 28.0473 } }); // Johannesburg
    const r = await LocationService.getCurrentLocation();
    expect(r.location!.inIsrael).toBe(false);
    // Falls back to the DEVICE zone rather than the far-away preset's. Asserting a literal here
    // would just encode the test machine's own timezone.
    expect(r.location!.tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(r.location!.elevation).toBeUndefined();
    expect(r.location!.cityId).toBeUndefined();
    expect(r.location!.candleLightingMinutes).toBeUndefined();
    expect(r.location!.name).not.toBe(CITIES[0].name);
  });

  it('5.5 LocationService timeout → fallback', async () => {
    mockGetForeground.mockResolvedValue({ granted: true, canAskAgain: true });
    mockGetCurrentPosition.mockImplementation(() => new Promise(() => {}));
    const r = await LocationService.getCurrentLocation(50);
    expect(r.status).toBe('timeout');
    expect(r.source).toBe('manual');
  });
});
