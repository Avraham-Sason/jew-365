const mockParams: { id: string; date?: string; slot?: string } = { id: 'chok_leyisrael' };
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useFocusEffect: () => {},
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    back: jest.fn(),
    canDismiss: () => false,
    canGoBack: () => false,
    dismissAll: jest.fn(),
    navigate: jest.fn(),
    replace: mockReplace,
  }),
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: () => Promise.resolve(),
  deactivateKeepAwake: () => Promise.resolve(),
}));
jest.mock('@/data/chokAssets.generated', () => {
  const { parshiot } = require('@hebcal/core');
  return {
    CHOK_ASSETS: Object.fromEntries(
      [...parshiot, 'Vezot Haberakhah'].map((parasha: string, index: number) => [parasha, index + 1]),
    ),
  };
});
jest.mock('@/services/SiddurService', () => ({
  loadChokParasha: (parasha: string) => Promise.resolve(mockAsset(parasha)),
  loadSiddurText: jest.fn(),
}));

import { fireEvent, screen } from '@testing-library/react-native';
import SiddurScreen from '../siddur/[id]';
import { CITIES } from '@/data/cities';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useUserStore } from '@/stores/useUserStore';
import { renderWithTheme } from '@/testing/render';
import { at } from '@/testing/zmanim';
import type { ChokAsset, ChokSlot } from '@/types/chok';

const JERUSALEM = CITIES[0];
const SLOTS: ChokSlot[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'thuNight', 'fri'];
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

function mockAsset(parasha: string): ChokAsset {
  return {
    parasha,
    credit: { title: 'מקור', license: 'רשות', url: 'http://example.org' },
    dedication: null,
    slots: Object.fromEntries(
      SLOTS.map((slot) => [
        slot,
        [
          {
            kind: 'torah',
            heading: 'תורה',
            segments: [
              { he: [[{ t: `פסוק ${slot}` }]] },
              { he: [[{ t: `פירוש ${slot}` }]], optional: { he: 'רש״י', en: 'Rashi' } },
            ],
          },
        ],
      ]),
    ),
  };
}

const marked = (key: string) => Boolean(useCompletionsStore.getState().completions[key]?.chok_leyisrael);
const closedFold = (name: string | RegExp) => screen.queryByRole('button', { name, expanded: false });

function reset(enabled: boolean) {
  mockParams.date = undefined;
  mockParams.slot = undefined;
  mockReplace.mockReset();
  useUserStore.getState().reset();
  useUserStore.setState({ location: JERUSALEM, inIsrael: true, nusach: 'ashkenaz', language: 'he' });
  useCompletionsStore.getState().reset();
  useMitzvotStore.getState().reset();
  if (!enabled) return;
  useMitzvotStore.setState({
    activeMitzvot: {
      ...useMitzvotStore.getState().activeMitzvot,
      chok_leyisrael: { enabled: true, enabledAt: at(JERUSALEM, '2026-11-16T08:00').getTime() },
    },
  });
}

async function openAt(wallClock: string) {
  jest.useFakeTimers({ now: at(JERUSALEM, wallClock), doNotFake: [...ONLY_DATE] });
  renderWithTheme(<SiddurScreen />);
  await screen.findByText(/^פסוק /);
}

describe('the Chok LeYisrael reader with the mitzvah switched on', () => {
  beforeEach(() => reset(true));
  afterEach(() => jest.useRealTimers());

  it('puts a closed fold before the portion for each missed day since the switch-on', async () => {
    useCompletionsStore.setState({ completions: { '2026-11-17': { chok_leyisrael: 1 } } });
    await openAt('2026-11-18T12:00');
    expect(screen.getByText('פסוק wed')).toBeOnTheScreen();
    expect(closedFold('השלמה: יום שני')).toBeOnTheScreen();
    expect(closedFold('השלמה: יום ראשון')).toBeNull();
    expect(closedFold('השלמה: יום שלישי')).toBeNull();
    expect(screen.queryByText('פסוק mon')).toBeNull();
    expect(screen.queryByText('סיימתי את יום שני')).toBeNull();
  });

  it('opens a make-up with its commentary closed, and its done marks that day and drops the fold', async () => {
    await openAt('2026-11-18T12:00');
    fireEvent.press(closedFold('השלמה: יום שני')!);
    expect(screen.getByText('פסוק mon')).toBeOnTheScreen();
    expect(screen.queryByText('פירוש mon')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'רש״י', expanded: false })).toHaveLength(2);
    fireEvent.press(screen.getByText('סיימתי את יום שני'));
    expect(marked('2026-11-16')).toBe(true);
    expect(screen.queryByText('פסוק mon')).toBeNull();
    expect(screen.queryByText('סיימתי את יום שני')).toBeNull();
    expect(closedFold('השלמה: יום שלישי')).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('marks today from its done button and lands on home', async () => {
    await openAt('2026-11-18T12:00');
    fireEvent.press(screen.getByText('סיימתי'));
    expect(marked('2026-11-18')).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
  });

  it('shows a day already marked as done', async () => {
    useCompletionsStore.setState({ completions: { '2026-11-18': { chok_leyisrael: 1 } } });
    await openAt('2026-11-18T12:00');
    expect(screen.getByText('סומן כבוצע')).toBeOnTheScreen();
    expect(screen.queryByText('סיימתי')).toBeNull();
  });

  it('marks an earlier day of the week opened by date, with no make-up folds', async () => {
    mockParams.date = '2026-11-16';
    await openAt('2026-11-18T12:00');
    expect(screen.getByText('פסוק mon')).toBeOnTheScreen();
    expect(closedFold(/^השלמה/)).toBeNull();
    fireEvent.press(screen.getByText('סיימתי'));
    expect(marked('2026-11-16')).toBe(true);
  });

  it('has no done action on Thursday night and still offers the make-ups', async () => {
    await openAt('2026-11-19T20:00');
    expect(screen.getByText('פסוק thuNight')).toBeOnTheScreen();
    expect(screen.queryByText('סיימתי')).toBeNull();
    expect(closedFold('השלמה: יום רביעי')).toBeOnTheScreen();
  });

  it('has no done action for a later day of the week', async () => {
    mockParams.date = '2026-11-20';
    await openAt('2026-11-18T12:00');
    expect(screen.getByText('פסוק fri')).toBeOnTheScreen();
    expect(screen.queryByText('סיימתי')).toBeNull();
  });

  it('names the folds and their done in English', async () => {
    useUserStore.setState({ language: 'en' });
    await openAt('2026-11-18T12:00');
    fireEvent.press(closedFold('Make-up: Monday')!);
    expect(screen.getByText('Done with Monday')).toBeOnTheScreen();
    expect(screen.getByText('Done')).toBeOnTheScreen();
  });
});

describe('the Chok LeYisrael reader with the mitzvah switched off', () => {
  beforeEach(() => reset(false));
  afterEach(() => jest.useRealTimers());

  it('shows the portion with no done action and no make-up folds', async () => {
    await openAt('2026-11-18T12:00');
    expect(screen.getByText('פסוק wed')).toBeOnTheScreen();
    expect(screen.queryByText('סיימתי')).toBeNull();
    expect(closedFold(/^השלמה/)).toBeNull();
  });
});
