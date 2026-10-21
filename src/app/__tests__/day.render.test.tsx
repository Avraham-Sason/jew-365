const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
const mockParams: { date?: string } = {};

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/services/NotificationScheduler', () => ({
  NotificationScheduler: {
    cancelForMitzvah: async () => {},
    settleCheckIn: async () => {},
    rebuild: async () => {},
  },
  syncNotificationPermissionStatus: async () => {},
  dismissCompletedPresentedNotifications: async () => {},
  refreshSchedulingOnForeground: async () => {},
}));

import { fireEvent, screen } from '@testing-library/react-native';
import { DateTime } from 'luxon';
import DayRoute from '../day/[date]';
import { MitzvahCard } from '@/components/MitzvahCard';
import { CITIES } from '@/data/cities';
import { RETENTION_DAYS, useCompletionsStore } from '@/stores/useCompletionsStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useUserStore } from '@/stores/useUserStore';
import { renderWithTheme } from '@/testing/render';
import { at } from '@/testing/zmanim';

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

const october = (day: number) => DateTime.fromObject({ year: 2026, month: 10, day }).setLocale('he');
const title = (day: number) => october(day).toFormat('cccc d LLLL yyyy');
const label = (day: number) => october(day).toFormat('cccc d LLLL');

describe('day view', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: at(JERUSALEM, '2026-10-28T10:00'), doNotFake: [...ONLY_DATE] });
    mockPush.mockClear();
    mockBack.mockClear();
    mockReplace.mockClear();
    mockCanGoBack = true;
    for (const key of Object.keys(mockParams)) delete mockParams[key as keyof typeof mockParams];
    useUserStore.getState().reset();
    useUserStore.setState({
      language: 'he',
      location: JERUSALEM,
      inIsrael: true,
      nusach: 'ashkenaz',
      isOnboarded: true,
      locationStatus: 'ready',
    });
    useCompletionsStore.getState().reset();
    useMitzvotStore.setState({ activeMitzvot: { tefillin: { enabled: true }, shacharit: { enabled: true } } });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts the done mitzvot of the day in its header', () => {
    useCompletionsStore.setState({ completions: { '2026-10-28': { tefillin: Date.now() } } });
    mockParams.date = '2026-10-28';
    renderWithTheme(<DayRoute />);
    expect(screen.getByText('1/2')).toBeOnTheScreen();
    expect(screen.getByLabelText('בוצעו 1 מתוך 2')).toBeOnTheScreen();
  });

  it('steps to the previous and the next day in place', () => {
    mockParams.date = '2026-10-28';
    renderWithTheme(<DayRoute />);

    fireEvent.press(screen.getByRole('button', { name: `היום הקודם, ${label(27)}` }));
    expect(screen.getByText(title(27))).toBeOnTheScreen();
    expect(screen.getByText('תצוגה היסטורית — לא ניתן לסמן')).toBeOnTheScreen();
    expect(screen.queryByText('המצוות של היום')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: `היום הבא, ${label(28)}` }));
    expect(screen.getByText(title(28))).toBeOnTheScreen();
    expect(screen.getByText('המצוות של היום')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: `היום הבא, ${label(29)}` }));
    expect(screen.getByText(title(29))).toBeOnTheScreen();
    expect(screen.getByText('תצוגה עתידית — אפשר לסמן רק ביום עצמו')).toBeOnTheScreen();

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('stops the previous arrow at the retention limit', () => {
    const oldest = DateTime.fromISO('2026-10-28').minus({ days: RETENTION_DAYS });
    mockParams.date = oldest.toISODate() ?? '';
    const first = renderWithTheme(<DayRoute />);
    expect(screen.getByRole('button', { name: /^היום הקודם/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^היום הבא/ })).not.toBeDisabled();
    first.unmount();

    mockParams.date = oldest.plus({ days: 1 }).toISODate() ?? '';
    renderWithTheme(<DayRoute />);
    expect(screen.getByRole('button', { name: /^היום הקודם/ })).not.toBeDisabled();
  });

  it('shows no arrows and no counter for an invalid date', () => {
    mockParams.date = 'not-a-date';
    renderWithTheme(<DayRoute />);
    expect(screen.getByText('תאריך לא תקין.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^היום הקודם/ })).toBeNull();
    expect(screen.queryByLabelText(/^בוצעו/)).toBeNull();
  });

  it('leaves for home when there is nothing to go back to', () => {
    mockParams.date = '2026-10-28';
    mockCanGoBack = false;
    const first = renderWithTheme(<DayRoute />);
    fireEvent.press(screen.getByRole('button', { name: 'חזור' }));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
    expect(mockBack).not.toHaveBeenCalled();
    first.unmount();

    mockReplace.mockClear();
    mockCanGoBack = true;
    renderWithTheme(<DayRoute />);
    fireEvent.press(screen.getByRole('button', { name: 'חזור' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('draws each card with its mitzvah icon', () => {
    mockParams.date = '2026-10-28';
    renderWithTheme(<DayRoute />);
    const icons = screen.UNSAFE_getAllByType(MitzvahCard).map((card) => card.props.icon);
    expect(icons.sort()).toEqual(['shacharit', 'tefillin']);
  });
});
