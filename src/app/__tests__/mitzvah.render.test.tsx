const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  getPresentedNotificationsAsync: jest.fn(async () => []),
  dismissNotificationAsync: jest.fn(async () => {}),
  dismissAllNotificationsAsync: jest.fn(async () => {}),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => ({})),
  setNotificationCategoryAsync: jest.fn(async () => ({})),
  registerTaskAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  AndroidImportance: { HIGH: 'high', DEFAULT: 'default', LOW: 'low' },
  AndroidNotificationVisibility: { PUBLIC: 'public', PRIVATE: 'private' },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
  unregisterTaskAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  getStatusAsync: jest.fn(),
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
}));

import { fireEvent, screen } from '@testing-library/react-native';
import MitzvahDetailScreen from '../mitzvah/[id]';
import { CITIES } from '@/data/cities';
import { renderWithTheme } from '@/testing/render';
import { at } from '@/testing/zmanim';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useUserStore } from '@/stores/useUserStore';
import { THEMES } from '@/theme/colors';

const JERUSALEM = CITIES[0];
const ONLY_DATE = [
  'nextTick',
  'queueMicrotask',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

function renderMitzvah(params: Record<string, string>) {
  mockParams = params;
  return renderWithTheme(<MitzvahDetailScreen />);
}

describe('Mitzvah screen', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: at(JERUSALEM, '2026-10-28T07:00'), doNotFake: [...ONLY_DATE] });
    useUserStore.getState().reset();
    useUserStore.setState({
      language: 'he',
      location: JERUSALEM,
      inIsrael: true,
      nusach: 'ashkenaz',
      isOnboarded: true,
    });
    useMitzvotStore.getState().reset();
    mockPush.mockReset();
    mockBack.mockReset();
    mockReplace.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('gives an unknown id a header with a way back', () => {
    renderMitzvah({ id: 'nope' });
    expect(screen.getByText('המצווה לא נמצאה')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'חזור' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('opens the text from a primary button', () => {
    renderMitzvah({ id: 'shacharit' });
    const open = screen.getByRole('button', { name: 'פתח נוסח' });
    expect(open).toHaveStyle({ backgroundColor: THEMES.gold.gold });
    fireEvent.press(open);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/siddur/[id]',
      params: { id: 'shacharit', date: '2026-10-28' },
    });
  });

  it('prints the next reminder in the accent text colour', () => {
    renderMitzvah({ id: 'shacharit' });
    expect(screen.getByText(/^ההתראה הבאה תישלח ב-/)).toHaveStyle({ color: THEMES.gold.goldText });
  });

  it('resets the reminders from a secondary button', () => {
    renderMitzvah({ id: 'shacharit' });
    expect(screen.getByRole('button', { name: 'חזרה לברירת מחדל' })).toHaveStyle({
      backgroundColor: THEMES.gold.surface2,
    });
  });
});
