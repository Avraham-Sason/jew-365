const mockPush = jest.fn();
const mockHasContent = jest.fn(() => true);

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/data/chok', () => ({
  CHOK_TEXT_ID: 'chok_leyisrael',
  chokAsset: () => undefined,
  hasChokContent: () => mockHasContent(),
}));

import { fireEvent, screen } from '@testing-library/react-native';
import MoreScreen from '../(tabs)/more';
import { CITIES } from '@/data/cities';
import { renderWithTheme } from '@/testing/render';
import { at } from '@/testing/zmanim';
import { useUserStore } from '@/stores/useUserStore';

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

function renderAt(wallClock: string) {
  jest.useFakeTimers({ now: at(JERUSALEM, wallClock), doNotFake: [...ONLY_DATE] });
  return renderWithTheme(<MoreScreen />);
}

describe('More tab', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    useUserStore.setState({ location: JERUSALEM, inIsrael: true });
    mockPush.mockReset();
    mockHasContent.mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("captions the Chok LeYisrael row with today's parasha and day, and opens the reader", () => {
    renderAt('2026-11-16T12:00');
    expect(screen.getByText('חק לישראל')).toBeOnTheScreen();
    expect(screen.getByText('פרשת ויצא · יום שני')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('חק לישראל'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/siddur/[id]', params: { id: 'chok_leyisrael' } });
  });

  it('names both parashiyot of a double week and Thursday night', () => {
    renderAt('2028-03-23T21:00');
    expect(screen.getByText('פרשת ויקהל־פקודי · ליל שישי')).toBeOnTheScreen();
  });

  it('says there is nothing to learn on the Friday of Vezot Haberakhah', () => {
    renderAt('2026-10-02T08:00');
    expect(screen.getByText('אין לימוד היום')).toBeOnTheScreen();
  });

  it('captions in English', () => {
    useUserStore.setState({ language: 'en' });
    renderAt('2026-11-16T12:00');
    expect(screen.getByText('Parashat Vayetzei · Monday')).toBeOnTheScreen();
  });

  it('hides the row while no Chok LeYisrael content is bundled', () => {
    mockHasContent.mockReturnValue(false);
    renderAt('2026-11-16T12:00');
    expect(screen.queryByText('חק לישראל')).toBeNull();
    expect(screen.getByText('לוח זמנים')).toBeOnTheScreen();
  });
});
