const mockParams: Record<string, string | undefined> = {};
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
  const Stack = Object.assign(
    ({ children }: { children?: unknown }) => React.createElement(View, { testID: 'stack' }, children),
    { Screen: () => null },
  );
  return {
    Stack,
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
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
    loadChokParasha: () => Promise.reject(new Error('no chok text in a reader render')),
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

import { StyleSheet } from 'react-native';
import { fireEvent, screen, within } from '@testing-library/react-native';
import SiddurReaderScreen from '../siddur/[id]';
import { MitzvahIcon } from '@/components/MitzvahIcon';
import { CITIES } from '@/data/cities';
import { useUserStore } from '@/stores/useUserStore';
import { readSiddurText } from '@/testing/siddur';
import { renderWithTheme } from '@/testing/render';
import { at } from '@/testing/zmanim';
import { THEMES } from '@/theme/colors';

jest.setTimeout(30000);

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
const FIRST_LINE = 'מוֹדֶה אֲנִי';

async function openShacharit() {
  jest.useFakeTimers({ now: at(JERUSALEM, '2026-10-28T07:00'), doNotFake: [...ONLY_DATE] });
  useUserStore.getState().reset();
  useUserStore.setState({ language: 'he', location: JERUSALEM, inIsrael: true, nusach: 'ashkenaz' });
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  Object.assign(mockParams, { id: 'shacharit', date: '2026-10-28' });
  renderWithTheme(<SiddurReaderScreen />);
  await screen.findAllByText(FIRST_LINE);
}

describe('the siddur reader toolbar and section cards', () => {
  afterEach(() => jest.useRealTimers());

  it('draws the toolbar on light surfaces', async () => {
    await openShacharit();
    const picker = screen.getByRole('button', { name: /^בחר חלק: / });
    expect(picker).toHaveStyle({ backgroundColor: THEMES.gold.surface, borderRadius: 20 });
    expect(within(picker).UNSAFE_getByType(MitzvahIcon).props.name).toBe('chevronDown');
    expect(screen.getByRole('switch', { name: 'גלילה אוטומטית' })).toHaveStyle({
      backgroundColor: THEMES.gold.surface2,
      width: 34,
    });
    expect(screen.getByRole('button', { name: 'הגדל טקסט' })).toHaveStyle({ backgroundColor: THEMES.gold.surface2 });
    expect(screen.getByText('A+')).toHaveStyle({ color: THEMES.gold.text });
  });

  it('orders the controls: prayer mode, A+, A−, speed, play', async () => {
    await openShacharit();
    const all = screen.getAllByRole(/^(radio|button|switch)$/);
    const indexes = [
      screen.getByRole('radio', { name: 'במניין' }),
      screen.getByRole('radio', { name: 'ביחיד' }),
      screen.getByRole('button', { name: 'הגדל טקסט' }),
      screen.getByRole('button', { name: 'הקטן טקסט' }),
      screen.getByRole('button', { name: 'האט גלילה' }),
      screen.getByRole('button', { name: 'האץ גלילה' }),
      screen.getByRole('switch', { name: 'גלילה אוטומטית' }),
    ].map((control) => all.indexOf(control));
    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect(new Set(indexes).size).toBe(indexes.length);
  });

  it('titles each section in goldText at the title size', async () => {
    await openShacharit();
    const first = readSiddurText('ashkenaz', 'shacharit').sections[0].title.he;
    const styles = screen.getAllByText(first).map((node) => StyleSheet.flatten(node.props.style));
    expect(styles.some((style) => style.color === THEMES.gold.goldText && style.fontSize === 22)).toBe(true);
  });

  it('turns auto-scroll on from the play switch and fills it with the accent', async () => {
    await openShacharit();
    fireEvent.press(screen.getByRole('switch', { name: 'גלילה אוטומטית' }));
    expect(useUserStore.getState().siddurAutoScroll).toBe(true);
    expect(screen.getByRole('switch', { name: 'גלילה אוטומטית' })).toHaveStyle({ backgroundColor: THEMES.gold.gold });
  });
});
