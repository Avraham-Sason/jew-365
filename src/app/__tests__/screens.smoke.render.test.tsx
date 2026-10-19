const mockParams: Record<string, string | undefined> = {};
const mockSegments: string[] = [];
const mockRedirect = jest.fn();
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  dismissAll: jest.fn(),
  setParams: jest.fn(),
  canGoBack: () => true,
  canDismiss: () => false,
};

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  type MockTabScreen = { props: { name: string; options?: Record<string, unknown> } };
  type MockTabsProps = { tabBar: (props: unknown) => unknown; children?: unknown; initialRouteName?: string };
  const Stack = Object.assign(
    ({ children }: { children?: unknown }) => React.createElement(View, { testID: 'stack' }, children),
    { Screen: () => null },
  );
  const Tabs = Object.assign(
    ({ tabBar, children, initialRouteName }: MockTabsProps) => {
      const screens = React.Children.toArray(children) as MockTabScreen[];
      const routes = screens.map((screen) => ({ key: `${screen.props.name}-key`, name: screen.props.name }));
      const descriptors = Object.fromEntries(
        screens.map((screen) => [`${screen.props.name}-key`, { options: screen.props.options ?? {} }]),
      );
      const navigation = { emit: () => ({ defaultPrevented: false }), navigate: () => {} };
      const index = Math.max(
        0,
        routes.findIndex((route) => route.name === initialRouteName),
      );
      return tabBar({
        state: { index, routes },
        descriptors,
        navigation,
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
      });
    },
    { Screen: () => null },
  );
  return {
    Stack,
    Tabs,
    Redirect: ({ href }: { href: string }) => {
      mockRedirect(href);
      return null;
    },
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    useSegments: () => mockSegments,
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: () => Promise.resolve(),
  deactivateKeepAwake: () => Promise.resolve(),
}));
jest.mock('@/services/SiddurService', () => {
  const { readSiddurText } = require('@/testing/siddur');
  return {
    loadSiddurText: (nusach: string, id: string) => Promise.resolve(readSiddurText(nusach, id)),
    loadChokParasha: () => Promise.reject(new Error('no chok text in a smoke render')),
  };
});
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
jest.mock('react-native-safe-area-context', () => ({
  ...(jest.requireActual('react-native-safe-area-context') as object),
  SafeAreaProvider: ({ children }: { children?: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('expo-dev-client', () => ({}));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: require('react-native').View }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: () => Promise.resolve(),
  hideAsync: () => Promise.resolve(),
}));
jest.mock('expo-updates', () => ({
  useUpdates: () => ({ isUpdatePending: false }),
  reloadAsync: () => Promise.resolve(),
  isEnabled: false,
}));
jest.mock('@sentry/react-native', () => ({ wrap: (component: unknown) => component }));
jest.mock('@expo-google-fonts/heebo', () => ({ useFonts: () => [true, null] }));
jest.mock('@expo-google-fonts/noto-serif-hebrew', () => ({}));
jest.mock('@/services/NotificationScheduler', () => ({
  ...(jest.requireActual('@/services/NotificationScheduler') as object),
  initNotificationHandlers: () => () => {},
}));
jest.mock('@/services/notificationResponseHandler', () => ({
  ...(jest.requireActual('@/services/notificationResponseHandler') as object),
  initNotificationResponseHandler: () => ({ remove: () => {} }),
  consumePendingNotificationRoute: () => {},
}));

import * as fs from 'fs';
import * as path from 'path';
import type { ComponentType } from 'react';
import { Text } from 'react-native';
import { act, screen } from '@testing-library/react-native';
import { DateTime } from 'luxon';
import RootLayout from '../_layout';
import RootIndex from '../index';
import CheckInScreen from '../checkin';
import CustomMitzvahScreen from '../custom-mitzvah';
import DayScreen from '../day/[date]';
import HilulotScreen from '../hilulot';
import MitzvahScreen from '../mitzvah/[id]';
import MitzvotScreen from '../mitzvot';
import ReportScreen from '../report';
import RoshChodeshScreen from '../rosh-chodesh';
import ScheduleScreen from '../schedule';
import SiddurReaderScreen from '../siddur/[id]';
import SiddurIndexScreen from '../siddur/index';
import TabsLayout from '../(tabs)/_layout';
import HistoryScreen from '../(tabs)/history';
import HomeScreen from '../(tabs)/home';
import TabsIndexScreen from '../(tabs)/index';
import MoreScreen from '../(tabs)/more';
import SettingsScreen from '../(tabs)/settings';
import SiddurTabScreen from '../(tabs)/siddur';
import OnboardingWelcomeScreen from '../onboarding/index';
import OnboardingLocationScreen from '../onboarding/location';
import OnboardingNusachScreen from '../onboarding/nusach';
import OnboardingProfileScreen from '../onboarding/profile';
import OnboardingReadyScreen from '../onboarding/ready';
import TaharahLayout from '../taharah/_layout';
import TaharahCalendarScreen from '../taharah/calendar';
import TaharahDashboardScreen from '../taharah/index';
import TaharahLogScreen from '../taharah/log';
import TaharahSettingsScreen from '../taharah/settings';
import { CITIES } from '@/data/cities';
import { setLocale } from '@/i18n';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { useCustomMitzvotStore } from '@/stores/useCustomMitzvotStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useTaharahStore } from '@/stores/useTaharahStore';
import { useUserStore } from '@/stores/useUserStore';
import { renderWithTheme } from '@/testing/render';
import { at } from '@/testing/zmanim';
import type { CustomMitzvah } from '@/types/mitzvah';
import { locationNoon } from '@/utils/locationDay';
import { civilHebrewDayAt } from '@/utils/taharah/onot';

jest.setTimeout(30000);

type Locale = 'he' | 'en';

type SmokeCase = {
  file: string;
  label: string;
  Screen: ComponentType;
  params?: Record<string, string>;
  segments?: string[];
  wallClock?: string;
  fresh?: boolean;
  setup?: () => void;
  check: (language: Locale) => Promise<unknown> | void;
};

const APP_DIR = path.join(__dirname, '..');
const JERUSALEM = CITIES[0];
const WEEKDAY = '2026-10-28T10:00';
const SUNDAY_AFTER_SHABBAT = '2026-11-15T10:00';
const LOCALES: Locale[] = ['he', 'en'];
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

const CUSTOM_ID = 'custom_1792000000000_abc123';
const CUSTOM_NAME = 'לימוד משנה';
const CUSTOM: CustomMitzvah = {
  id: CUSTOM_ID,
  name: CUSTOM_NAME,
  startHHMM: '06:00',
  endHHMM: '22:00',
  reminders: [{ anchor: 'start', offsetMin: 60, label: 'תזכורת בוקר' }],
  skipOn: ['shabbat', 'yomtov'],
  activeDays: [0, 1, 2, 3, 4, 5],
  contentBlocks: [
    { type: 'text', he: 'פרק א' },
    { type: 'siddur', he: 'ברכת המזון', textId: 'birkat_hamazon' },
  ],
  createdAt: 1792000000000,
};

const NIGHT_CUSTOM_ID = 'custom_1800000000000_tikkun';
const NIGHT_CUSTOM: CustomMitzvah = {
  id: NIGHT_CUSTOM_ID,
  name: 'תיקון חצות',
  startHHMM: '00:30',
  endHHMM: '01:30',
  reminders: [],
  skipOn: [],
  contentBlocks: [{ type: 'text', he: 'שיר המעלות' }],
  createdAt: 1800000000000,
};
const NIGHT_OF_THE_14TH = '2027-06-15T00:20';
const SIVAN = {
  9: { he: 'ט׳ סִיוָן תשפ״ז', en: '9th of Sivan, 5787' },
  10: { he: 'י׳ סִיוָן תשפ״ז', en: '10th of Sivan, 5787' },
  11: { he: 'י״א סִיוָן תשפ״ז', en: '11th of Sivan, 5787' },
} as const;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const text = (he: string | RegExp, en: string | RegExp) => async (language: Locale) =>
  screen.findAllByText(language === 'he' ? he : en);

const readerShows = (day: keyof typeof SIVAN, notDay: keyof typeof SIVAN) => async (language: Locale) => {
  await screen.findByText(new RegExp(escapeRegExp(SIVAN[day][language])));
  expect(screen.queryByText(new RegExp(escapeRegExp(SIVAN[notDay][language])))).toBeNull();
};

const both =
  (first: (language: Locale) => Promise<unknown>, second: (language: Locale) => Promise<unknown>) =>
  async (language: Locale) => {
    await first(language);
    await second(language);
  };

const redirectsTo = (href: string) => () => {
  expect(mockRedirect).toHaveBeenCalledTimes(1);
  expect(mockRedirect).toHaveBeenCalledWith(href);
};

function listScreenFiles(dir = APP_DIR, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory())
      return entry.name === '__tests__' ? [] : listScreenFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`);
    return entry.name.endsWith('.tsx') ? [prefix + entry.name.replace(/\.tsx$/, '')] : [];
  });
}

function seedStores(language: Locale, fresh: boolean, now: Date) {
  useUserStore.getState().reset();
  useMitzvotStore.getState().reset();
  useCompletionsStore.getState().reset();
  useCustomMitzvotStore.getState().reset();
  useTaharahStore.getState().reset();
  useUserStore.setState({ language, location: JERUSALEM, inIsrael: true, nusach: 'ashkenaz' });
  if (fresh) return;

  useUserStore.setState({
    isOnboarded: true,
    locationStatus: 'ready',
    locationSource: 'manual',
    notificationsEnabled: true,
    notificationPermission: 'granted',
    profileName: 'דוד',
    gender: 'female',
    maritalStatus: 'married',
    taharahEnabled: true,
  });
  useCustomMitzvotStore.getState().add(CUSTOM);
  useMitzvotStore.getState().setEnabled(CUSTOM_ID, true);
  useCompletionsStore.getState().markDone('tefillin', new Date(now.getTime() - 3 * 60 * 60 * 1000));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayAbs = civilHebrewDayAt(locationNoon(today, JERUSALEM), JERUSALEM).abs();
  useTaharahStore.setState({ lockEnabled: false });
  useTaharahStore.getState().addEvent({ type: 'onset', onah: { abs: todayAbs - 2, kind: 'day' } });
}

async function mountCase(smokeCase: SmokeCase, language: Locale) {
  const now = at(JERUSALEM, smokeCase.wallClock ?? WEEKDAY);
  jest.useFakeTimers({ now, doNotFake: [...ONLY_DATE] });
  seedStores(language, smokeCase.fresh ?? false, now);
  smokeCase.setup?.();
  setLocale(language);
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  Object.assign(mockParams, smokeCase.params);
  mockSegments.splice(0, mockSegments.length, ...(smokeCase.segments ?? ['(tabs)', 'home']));
  const { Screen } = smokeCase;
  renderWithTheme(<Screen />);
  await smokeCase.check(language);
  await act(async () => {});
}

const husband = () => {
  useUserStore.setState({ gender: 'male' });
  useTaharahStore.getState().setRole('husband');
};

const CASES: SmokeCase[] = [
  {
    file: 'index',
    label: 'redirects an onboarded user to home',
    Screen: RootIndex,
    check: redirectsTo('/(tabs)/home'),
  },
  {
    file: 'index',
    label: 'redirects a new user to onboarding',
    Screen: RootIndex,
    fresh: true,
    check: redirectsTo('/onboarding'),
  },
  {
    file: '_layout',
    label: 'mounts the navigator for an onboarded user',
    Screen: RootLayout as ComponentType,
    check: async () => {
      await screen.findByTestId('stack');
      expect(mockRouter.replace).not.toHaveBeenCalled();
      expect(mockRouter.push).not.toHaveBeenCalled();
    },
  },
  {
    file: '_layout',
    label: 'sends a new user to onboarding',
    Screen: RootLayout as ComponentType,
    fresh: true,
    check: async () => {
      await screen.findByTestId('stack');
      expect(mockRouter.replace).toHaveBeenCalledWith('/onboarding');
    },
  },
  {
    file: 'checkin',
    label: 'with nothing to mark',
    Screen: CheckInScreen,
    check: text('אין כרגע מה לסמן', 'Nothing to mark right now'),
  },
  {
    file: 'checkin',
    label: 'after Shabbat',
    Screen: CheckInScreen,
    wallClock: SUNDAY_AFTER_SHABBAT,
    check: text(/מה עשית בשבת/, /What did you do on Shabbat/),
  },
  { file: 'custom-mitzvah', label: 'new', Screen: CustomMitzvahScreen, check: text('מצווה חדשה', 'New mitzvah') },
  {
    file: 'custom-mitzvah',
    label: 'editing',
    Screen: CustomMitzvahScreen,
    params: { id: CUSTOM_ID },
    check: text('עריכת מצווה', 'Edit mitzvah'),
  },
  {
    file: 'day/[date]',
    label: 'today',
    Screen: DayScreen,
    params: { date: '2026-10-28' },
    check: text('המצוות של היום', 'Day view'),
  },
  {
    file: 'day/[date]',
    label: 'the evening before is still today between midnight and alot',
    Screen: DayScreen,
    params: { date: '2027-06-14' },
    wallClock: NIGHT_OF_THE_14TH,
    check: async (language) => {
      await text('המצוות של היום', 'Day view')(language);
      expect(screen.queryByText(/תצוגה עתידית|Future view/)).toBeNull();
    },
  },
  {
    file: 'day/[date]',
    label: 'the new date is still the future between midnight and alot',
    Screen: DayScreen,
    params: { date: '2027-06-15' },
    wallClock: NIGHT_OF_THE_14TH,
    check: async (language) => {
      await text(
        'תצוגה עתידית — אפשר לסמן רק ביום עצמו',
        'Future view — marking is available only on that day',
      )(language);
      expect(screen.queryByText('המצוות של היום')).toBeNull();
      expect(screen.queryByText('Day view')).toBeNull();
    },
  },
  {
    file: 'day/[date]',
    label: 'a past day',
    Screen: DayScreen,
    params: { date: '2026-10-21' },
    check: text('תצוגה היסטורית — לא ניתן לסמן', 'Historical view — marking is disabled'),
  },
  {
    file: 'day/[date]',
    label: 'an invalid date',
    Screen: DayScreen,
    params: { date: 'not-a-date' },
    check: text('המצוות של היום', 'Day view'),
  },
  { file: 'hilulot', label: 'default', Screen: HilulotScreen, check: text('הילולות צדיקים', 'Hilulot of tzaddikim') },
  {
    file: 'mitzvah/[id]',
    label: 'a static mitzvah',
    Screen: MitzvahScreen,
    params: { id: 'shacharit' },
    check: text('תפילת שחרית', 'Shacharit'),
  },
  {
    file: 'mitzvah/[id]',
    label: 'a custom mitzvah',
    Screen: MitzvahScreen,
    params: { id: CUSTOM_ID },
    check: text(CUSTOM_NAME, CUSTOM_NAME),
  },
  { file: 'mitzvot', label: 'default', Screen: MitzvotScreen, check: text('המצוות שלי', 'My mitzvot') },
  { file: 'report', label: 'latest week', Screen: ReportScreen, check: text('סיכום שבועי', 'Weekly report') },
  {
    file: 'report',
    label: 'a given week',
    Screen: ReportScreen,
    params: { week: '2026-10-24' },
    check: text('סיכום שבועי', 'Weekly report'),
  },
  { file: 'rosh-chodesh', label: 'default', Screen: RoshChodeshScreen, check: text('ראש חודש', 'Rosh Chodesh') },
  { file: 'schedule', label: 'default', Screen: ScheduleScreen, check: text('לוח זמנים', 'Schedule') },
  {
    file: 'schedule',
    label: 'opens on the evening before between midnight and alot',
    Screen: ScheduleScreen,
    wallClock: NIGHT_OF_THE_14TH,
    check: async (language) => {
      const evening = DateTime.fromObject({ year: 2027, month: 6, day: 14 })
        .setLocale(language)
        .toFormat(language === 'he' ? 'd LLLL yyyy' : 'LLL d, yyyy');
      await screen.findByText(new RegExp(`^${escapeRegExp(evening)}`));
    },
  },
  {
    file: 'siddur/[id]',
    label: 'a mitzvah text',
    Screen: SiddurReaderScreen,
    params: { id: 'shacharit' },
    check: both(
      text('תפילת שחרית', 'Shacharit'),
      text('מוֹדֶה אֲנִי', /I give thanks to You living and everlasting King/),
    ),
  },
  {
    file: 'siddur/[id]',
    label: 'maariv opened bare after midnight resolves for the evening that is still open',
    Screen: SiddurReaderScreen,
    params: { id: 'maariv' },
    wallClock: NIGHT_OF_THE_14TH,
    check: readerShows(10, 11),
  },
  {
    file: 'siddur/[id]',
    label: 'shacharit opened bare before alot resolves for the coming morning',
    Screen: SiddurReaderScreen,
    params: { id: 'shacharit' },
    wallClock: '2027-06-15T01:00',
    check: readerShows(10, 9),
  },
  {
    file: 'siddur/[id]',
    label: 'a custom text opened bare resolves for the day of its window',
    Screen: SiddurReaderScreen,
    params: { id: NIGHT_CUSTOM_ID },
    wallClock: '2027-06-15T00:45',
    setup: () => {
      useCustomMitzvotStore.getState().add(NIGHT_CUSTOM);
      useMitzvotStore.getState().setEnabled(NIGHT_CUSTOM_ID, true);
    },
    check: async (language) => {
      await text('תיקון חצות', 'תיקון חצות')(language);
      await readerShows(10, 9)(language);
    },
  },
  {
    file: 'siddur/[id]',
    label: 'a standalone text',
    Screen: SiddurReaderScreen,
    params: { id: 'birkat_hamazon' },
    check: both(text('ברכת המזון', 'Grace After Meals'), text('לפני ברכת המזון', 'Before Grace')),
  },
  {
    file: 'siddur/[id]',
    label: 'Tehillim, a text shared by every nusach',
    Screen: SiddurReaderScreen,
    params: { id: 'tehillim' },
    check: both(
      both(text('תהילים', 'Tehillim'), text('תפילה לפני אמירת תהלים', 'Prayer Before Tehillim')),
      async (language) => {
        for (const name of language === 'he' ? ['ספר ראשון', 'ליום ראשון'] : ['First Book', 'Sunday']) {
          expect(await screen.findByRole('header', { name })).toBeOnTheScreen();
        }
      },
    ),
  },
  {
    file: 'siddur/index',
    label: 'redirects to the siddur tab',
    Screen: SiddurIndexScreen,
    check: redirectsTo('/(tabs)/siddur'),
  },
  {
    file: '(tabs)/_layout',
    label: 'draws the five tabs with home selected',
    Screen: TabsLayout,
    check: async (language) => {
      const tabs = await screen.findAllByRole('tab');
      const names =
        language === 'he'
          ? ['עוד', 'סידור', 'בית', 'היסטוריה', 'הגדרות']
          : ['More', 'Siddur', 'Home', 'History', 'Settings'];
      expect(tabs).toHaveLength(5);
      names.forEach((name, index) => expect(tabs[index]).toHaveAccessibleName(name));
      expect(tabs[2]).toBeSelected();
    },
  },
  { file: '(tabs)/history', label: 'default', Screen: HistoryScreen, check: text('היסטוריה', 'History') },
  { file: '(tabs)/home', label: 'default', Screen: HomeScreen, check: text('עכשיו — לפי דחיפות', 'Now by urgency') },
  { file: '(tabs)/index', label: 'redirects to home', Screen: TabsIndexScreen, check: redirectsTo('/(tabs)/home') },
  { file: '(tabs)/more', label: 'default', Screen: MoreScreen, check: text('עוד', 'More') },
  { file: '(tabs)/settings', label: 'default', Screen: SettingsScreen, check: text('הגדרות', 'Settings') },
  { file: '(tabs)/siddur', label: 'default', Screen: SiddurTabScreen, check: text('סידור', 'Siddur') },
  {
    file: 'onboarding/index',
    label: 'welcome',
    Screen: OnboardingWelcomeScreen,
    fresh: true,
    check: text('יהודי 360', 'Jew 360'),
  },
  {
    file: 'onboarding/location',
    label: 'location',
    Screen: OnboardingLocationScreen,
    fresh: true,
    check: text('איפה אתה נמצא?', 'Where are you?'),
  },
  {
    file: 'onboarding/nusach',
    label: 'nusach',
    Screen: OnboardingNusachScreen,
    fresh: true,
    check: text('מה הנוסח שלך?', 'Which nusach are you?'),
  },
  {
    file: 'onboarding/profile',
    label: 'profile',
    Screen: OnboardingProfileScreen,
    fresh: true,
    check: text('קצת עליך', 'About you'),
  },
  {
    file: 'onboarding/ready',
    label: 'ready',
    Screen: OnboardingReadyScreen,
    fresh: true,
    check: text('הכל מוכן!', 'All set!'),
  },
  {
    file: 'taharah/_layout',
    label: 'mounts the stack with the lock off',
    Screen: TaharahLayout,
    check: async () => {
      await screen.findByTestId('stack');
    },
  },
  {
    file: 'taharah/calendar',
    label: 'default',
    Screen: TaharahCalendarScreen,
    check: text('לוח טהרה', 'Taharah calendar'),
  },
  {
    file: 'taharah/index',
    label: 'a woman with an onset',
    Screen: TaharahDashboardScreen,
    check: text('טהרה', 'Taharah'),
  },
  {
    file: 'taharah/index',
    label: 'a husband',
    Screen: TaharahDashboardScreen,
    setup: husband,
    check: text('טהרה', 'Taharah'),
  },
  { file: 'taharah/log', label: 'onset by default', Screen: TaharahLogScreen, check: text('רישום', 'Record') },
  ...(['hefsek', 'tevila', 'pause'] as const).map((type) => ({
    file: 'taharah/log',
    label: `type ${type}`,
    Screen: TaharahLogScreen,
    params: { type },
    check: text('רישום', 'Record'),
  })),
  {
    file: 'taharah/settings',
    label: 'default',
    Screen: TaharahSettingsScreen,
    check: text('הגדרות טהרה', 'Taharah settings'),
  },
];

const ROWS = CASES.flatMap((smokeCase) =>
  LOCALES.map((language) => ({ name: `${smokeCase.file} ${smokeCase.label} [${language}]`, smokeCase, language })),
);

describe('screen smoke renders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('has a smoke case for every screen file under src/app, and none for a file that is gone', () => {
    const found = listScreenFiles().sort();
    const covered = new Set(CASES.map((smokeCase) => smokeCase.file));
    expect(found.filter((file) => !covered.has(file))).toEqual([]);
    expect([...covered].filter((file) => !found.includes(file))).toEqual([]);
  });

  it.each(ROWS)('mounts $name', async ({ smokeCase, language }) => {
    await mountCase(smokeCase, language);
  });

  it('fails a case whose screen throws on mount', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const Thrower = () => {
      throw new Error('boom');
    };
    await expect(
      mountCase({ file: 'thrower', label: 'throws', Screen: Thrower, check: text('x', 'x') }, 'he'),
    ).rejects.toThrow('boom');
    consoleError.mockRestore();
  });

  it('fails a case whose expected text is not on the screen', async () => {
    const Plain = () => <Text>present</Text>;
    await expect(
      mountCase({ file: 'plain', label: 'wrong text', Screen: Plain, check: text('חסר', 'missing') }, 'he'),
    ).rejects.toThrow();
  });
});
