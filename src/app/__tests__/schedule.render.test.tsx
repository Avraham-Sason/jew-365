const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));
jest.mock('@/services/NotificationScheduler', () => ({
  NotificationScheduler: {
    cancelForMitzvah: async () => {},
    settleCheckIn: async () => {},
    rebuild: async () => {},
  },
}));

import { fireEvent, screen } from '@testing-library/react-native';
import { DateTime } from 'luxon';
import ScheduleScreen from '../schedule';
import { Card } from '@/components/Card';
import { CITIES } from '@/data/cities';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useUserStore } from '@/stores/useUserStore';
import { renderWithTheme } from '@/testing/render';
import { at } from '@/testing/zmanim';
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

const cursorLabel = (day: number) =>
  DateTime.fromObject({ year: 2026, month: 10, day }).setLocale('he').toFormat('cccc d LLL');

describe('schedule', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: at(JERUSALEM, '2026-10-28T10:00'), doNotFake: [...ONLY_DATE] });
    mockPush.mockClear();
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

  it('puts the day timeline on one card and the cursor in the text colour', () => {
    renderWithTheme(<ScheduleScreen />);
    expect(screen.UNSAFE_getAllByType(Card)).toHaveLength(1);
    expect(screen.getByText(cursorLabel(28))).toHaveStyle({ color: THEMES.gold.text });
  });

  it('moves the cursor one day forward', () => {
    renderWithTheme(<ScheduleScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'הבא' }));
    expect(screen.getByText(cursorLabel(29))).toBeOnTheScreen();
  });
});
