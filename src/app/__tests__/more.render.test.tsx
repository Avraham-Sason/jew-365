const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/data/chok', () => ({
  CHOK_TEXT_ID: 'chok_leyisrael',
  chokAsset: () => undefined,
  hasChokContent: jest.fn(() => true),
}));

import { Linking } from 'react-native';
import { fireEvent, screen, within } from '@testing-library/react-native';
import MoreScreen from '../(tabs)/more';
import { hasChokContent } from '@/data/chok';
import { CITIES } from '@/data/cities';
import { renderWithTheme } from '@/testing/render';
import { at } from '@/testing/zmanim';
import { useUserStore } from '@/stores/useUserStore';

const JERUSALEM = CITIES[0];
const mockHasContent = jest.mocked(hasChokContent);
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

  it('lists Tehillim before the halacha hotline, with or without Chok LeYisrael, and opens it in the reader', () => {
    for (const chok of [true, false]) {
      mockHasContent.mockReturnValue(chok);
      const { unmount } = renderAt('2026-11-16T12:00');
      const rows = screen.getAllByRole('button');
      expect(rows).toHaveLength(chok ? 4 : 3);
      expect(within(rows[rows.length - 2]).getByText('תהילים')).toBeOnTheScreen();
      expect(within(rows[rows.length - 2]).getByText('מחולק לפי ימי השבוע')).toBeOnTheScreen();
      expect(within(rows[rows.length - 1]).getByText('קו ההלכה')).toBeOnTheScreen();
      fireEvent.press(screen.getByText('תהילים'));
      expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/siddur/[id]', params: { id: 'tehillim' } });
      unmount();
    }
  });

  it('names Tehillim in English', () => {
    useUserStore.setState({ language: 'en' });
    renderAt('2026-11-16T12:00');
    expect(screen.getByText('Tehillim')).toBeOnTheScreen();
    expect(screen.getByText('Divided by the days of the week')).toBeOnTheScreen();
  });
});

describe('Halacha hotline', () => {
  let openURL: jest.SpyInstance;

  beforeEach(() => {
    useUserStore.getState().reset();
    useUserStore.setState({ location: JERUSALEM, inIsrael: true });
    mockHasContent.mockReturnValue(false);
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => {
    openURL.mockRestore();
    jest.useRealTimers();
  });

  it('offers the Ashkenazi lines, by phone only, to every nusach but Edot HaMizrach', () => {
    for (const nusach of ['ashkenaz', 'sefard', 'chabad'] as const) {
      useUserStore.setState({ nusach });
      const { unmount } = renderAt('2026-11-16T12:00');
      expect(screen.getByText('שאלה לרב, לפי פסקי אשכנז')).toBeOnTheScreen();
      fireEvent.press(screen.getByText('קו ההלכה'));
      expect(screen.getByText('בית ההוראה של הרב נסים קרליץ זצ״ל')).toBeOnTheScreen();
      expect(screen.getByText('חיוג: 072-215-2222')).toBeOnTheScreen();
      expect(screen.getByText('חיוג: 073-724-6000')).toBeOnTheScreen();
      expect(screen.getByText('חיוג: 03-6161616')).toBeOnTheScreen();
      expect(screen.getByText('חיוג: 02-5363333')).toBeOnTheScreen();
      expect(screen.queryByText(/וואטסאפ/)).toBeNull();
      unmount();
    }
  });

  it('dials the chosen Ashkenazi line', () => {
    renderAt('2026-11-16T12:00');
    fireEvent.press(screen.getByText('קו ההלכה'));
    fireEvent.press(screen.getByText('חיוג: 073-724-6000'));
    expect(openURL).toHaveBeenCalledWith('tel:0737246000');
  });

  it('offers Edot HaMizrach the Sephardi line by phone or WhatsApp', () => {
    useUserStore.setState({ nusach: 'edot_hamizrach' });
    renderAt('2026-11-16T12:00');
    expect(screen.getByText('שאלה לרב, לפי פסקי מרן')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('קו ההלכה'));
    expect(screen.queryByText('חיוג: 072-215-2222')).toBeNull();

    fireEvent.press(screen.getByText('חיוג: 073-786-0860'));
    expect(openURL).toHaveBeenLastCalledWith('tel:0737860860');

    fireEvent.press(screen.getByText('וואטסאפ: 073-786-0860'));
    expect(openURL).toHaveBeenLastCalledWith('https://wa.me/972737860860');
  });

  it('names the hotline in English', () => {
    useUserStore.setState({ language: 'en', nusach: 'edot_hamizrach' });
    renderAt('2026-11-16T12:00');
    fireEvent.press(screen.getByText('Halacha hotline'));
    expect(screen.getByText('WhatsApp 073-786-0860')).toBeOnTheScreen();
  });
});
