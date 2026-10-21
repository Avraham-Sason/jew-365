const mockPush = jest.fn();
const mockCancel = jest.fn(async (..._args: unknown[]) => {});

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));
jest.mock('@/services/NotificationScheduler', () => ({
  NotificationScheduler: {
    cancelForMitzvah: (...args: unknown[]) => mockCancel(...args),
    settleCheckIn: async () => {},
    rebuild: async () => {},
  },
  syncNotificationPermissionStatus: async () => {},
  dismissCompletedPresentedNotifications: async () => {},
  refreshSchedulingOnForeground: async () => {},
}));

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { DateTime } from 'luxon';
import HomeScreen from '../(tabs)/home';
import { AppLogo } from '@/components/AppLogo';
import { CITIES } from '@/data/cities';
import { useCompletionsStore, dateKey } from '@/stores/useCompletionsStore';
import { useCustomMitzvotStore } from '@/stores/useCustomMitzvotStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useUserStore } from '@/stores/useUserStore';
import { renderWithTheme } from '@/testing/render';
import { at } from '@/testing/zmanim';
import { THEMES } from '@/theme/colors';
import type { CustomMitzvah } from '@/types/mitzvah';
import { clockOf } from '@/utils/clock';

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

const NIGHT_OF_THE_14TH = '2027-06-15T00:20';
const AFTER_MAARIV = '2027-06-15T01:30';
const AFTER_ALOT = '2027-06-15T04:30';

const MIDNIGHT_ID = 'custom_1800000000000_tikkun';
const MIDNIGHT_NAME = 'תיקון חצות';
const LATE_ID = 'custom_1800000000001_late';
const LATE_NAME = 'לימוד לילה';

const customWindow = (id: string, name: string, startHHMM: string, endHHMM: string): CustomMitzvah => ({
  id,
  name,
  startHHMM,
  endHHMM,
  reminders: [],
  skipOn: [],
  createdAt: 1800000000000,
});

function enableOnly(...ids: string[]) {
  useMitzvotStore.setState({ activeMitzvot: Object.fromEntries(ids.map((id) => [id, { enabled: true }])) });
}

function renderAt(wallClock: string) {
  jest.useFakeTimers({ now: at(JERUSALEM, wallClock), doNotFake: [...ONLY_DATE] });
  return renderWithTheme(<HomeScreen />);
}

const completeButton = (name: string) => screen.getByRole('button', { name: `סמן ${name} כהושלם` });
const completions = () => useCompletionsStore.getState().completions;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const dayLabel = (day: number) =>
  DateTime.fromObject({ year: 2027, month: 6, day }).setLocale('he').toFormat('cccc · d LLLL');

describe('home between midnight and alot', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockCancel.mockClear();
    useUserStore.getState().reset();
    useUserStore.setState({
      language: 'he',
      location: JERUSALEM,
      inIsrael: true,
      nusach: 'ashkenaz',
      isOnboarded: true,
      locationStatus: 'ready',
      locationSource: 'manual',
      notificationsEnabled: true,
      notificationPermission: 'granted',
      gender: 'male',
      maritalStatus: 'single',
    });
    useCompletionsStore.getState().reset();
    useCustomMitzvotStore.getState().reset();
    enableOnly('maariv');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps last night's maariv current and files its done under the evening's day", async () => {
    renderAt(NIGHT_OF_THE_14TH);
    expect(screen.getByText('עכשיו — לפי דחיפות')).toBeOnTheScreen();
    fireEvent.press(completeButton('תפילת ערבית'));
    expect(Object.keys(completions())).toEqual(['2027-06-14']);
    expect(completions()['2027-06-14'].maariv).toBeGreaterThan(0);
    await waitFor(() => expect(mockCancel).toHaveBeenCalledTimes(1));
    const [id, date] = mockCancel.mock.calls[0] as [string, Date];
    expect(id).toBe('maariv');
    expect(dateKey(date)).toBe('2027-06-14');
  });

  it("files an undo under the window's day", () => {
    useCompletionsStore.setState({ completions: { '2027-06-14': { maariv: Date.now() } } });
    renderAt(NIGHT_OF_THE_14TH);
    expect(screen.getByText('בוצעו (1)')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'בטל' }));
    expect(completions()['2027-06-14']).toBeUndefined();
    expect(screen.queryByText('בוצעו (1)')).toBeNull();
  });

  it("files a skip under the window's day", async () => {
    renderAt(NIGHT_OF_THE_14TH);
    fireEvent(screen.getByRole('button', { name: /^תפילת ערבית/ }), 'longPress');
    fireEvent.press(screen.getByText('דלג היום'));
    await act(async () => {});
    const skipped = useCompletionsStore.getState().skipped;
    expect(Object.keys(skipped)).toEqual(['2027-06-14']);
    expect(Object.keys(completions())).toEqual([]);
  });

  it("opens the text on the window's day", () => {
    renderAt(NIGHT_OF_THE_14TH);
    fireEvent.press(screen.getByRole('button', { name: 'פתח נוסח' }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/siddur/[id]',
      params: { id: 'maariv', date: '2027-06-14' },
    });
  });

  it('leaves the evening missed until alot, then moves on to the next evening', () => {
    const night = renderAt(AFTER_MAARIV);
    expect(screen.getByText('לא בוצע (1)')).toBeOnTheScreen();
    expect(screen.queryByText('הבא בתור')).toBeNull();
    night.unmount();
    jest.useRealTimers();

    renderAt(AFTER_ALOT);
    expect(screen.queryByText(/^לא בוצע/)).toBeNull();
    expect(screen.getByText('הבא בתור')).toBeOnTheScreen();
  });

  it('names the evening date in the subtitle until alot and the new date after it', () => {
    const night = renderAt(NIGHT_OF_THE_14TH);
    expect(screen.getByText(new RegExp(`^${escapeRegExp(dayLabel(14))}`))).toBeOnTheScreen();
    expect(screen.queryByText(new RegExp(escapeRegExp(dayLabel(15))))).toBeNull();
    night.unmount();
    jest.useRealTimers();

    renderAt(AFTER_ALOT);
    expect(screen.getByText(new RegExp(`^${escapeRegExp(dayLabel(15))}`))).toBeOnTheScreen();
  });

  it('counts a mark of last night as the evening day, not the new one', () => {
    useCompletionsStore.setState({ completions: { '2027-06-14': { maariv: 1 } } });
    const night = renderAt(AFTER_MAARIV);
    expect(screen.getByText('1/1')).toBeOnTheScreen();
    night.unmount();
    jest.useRealTimers();

    renderAt(AFTER_ALOT);
    expect(screen.getByText('0/1')).toBeOnTheScreen();
    expect(screen.queryByText(/^בוצעו/)).toBeNull();
  });

  it('puts the wordmark on its own brand row and keeps the done counter in the header', () => {
    useCompletionsStore.setState({ completions: { '2027-06-14': { maariv: 1 } } });
    renderAt(AFTER_MAARIV);
    const brand = screen.getByTestId('home-brand');
    expect(brand).toHaveStyle({ flexDirection: 'row', justifyContent: 'flex-end' });
    expect(screen.UNSAFE_getAllByType(AppLogo)).toHaveLength(1);
    expect(within(brand).UNSAFE_getByType(AppLogo).props).toMatchObject({ variant: 'wordmark', size: 34 });
    expect(within(brand).queryByLabelText('בוצעו 1 מתוך 1')).toBeNull();
    expect(screen.getByLabelText('בוצעו 1 מתוך 1')).toHaveStyle({ backgroundColor: THEMES.gold.goldLight });
    expect(screen.getByText('1/1')).toHaveStyle({ color: THEMES.gold.goldText });
  });

  describe('a custom mitzvah whose window starts after midnight', () => {
    beforeEach(() => {
      useCustomMitzvotStore.getState().add(customWindow(MIDNIGHT_ID, MIDNIGHT_NAME, '00:30', '01:30'));
      enableOnly(MIDNIGHT_ID);
    });

    it('is next up the evening before, with the start of the coming window', () => {
      renderAt('2027-06-14T23:00');
      expect(screen.getByText('הבא בתור')).toBeOnTheScreen();
      const start = clockOf(at(JERUSALEM, '2027-06-15T00:30'));
      expect(screen.getByText(`${MIDNIGHT_NAME} · ${start}`)).toBeOnTheScreen();
    });

    it('is filed under its own day when done inside the window', () => {
      renderAt('2027-06-15T00:45');
      fireEvent.press(completeButton(MIDNIGHT_NAME));
      expect(Object.keys(completions())).toEqual(['2027-06-15']);
      expect(completions()['2027-06-15'][MIDNIGHT_ID]).toBeGreaterThan(0);
    });

    it('is missed after its window, until alot', () => {
      renderAt('2027-06-15T02:00');
      expect(screen.getByText('לא בוצע (1)')).toBeOnTheScreen();
    });

    it("is next up for the following night's window once alot has passed", () => {
      renderAt(AFTER_ALOT);
      const start = clockOf(at(JERUSALEM, '2027-06-16T00:30'));
      expect(screen.getByText(`${MIDNIGHT_NAME} · ${start}`)).toBeOnTheScreen();
    });
  });

  describe('a custom mitzvah whose window runs past midnight', () => {
    beforeEach(() => {
      useCustomMitzvotStore.getState().add(customWindow(LATE_ID, LATE_NAME, '22:00', '01:00'));
      enableOnly(LATE_ID);
    });

    it("is filed under the evening's day when done after midnight", () => {
      renderAt('2027-06-15T00:30');
      fireEvent.press(completeButton(LATE_NAME));
      expect(Object.keys(completions())).toEqual(['2027-06-14']);
      expect(completions()['2027-06-14'][LATE_ID]).toBeGreaterThan(0);
    });
  });
});
