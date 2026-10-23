const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('@/services/ChokContentService', () => ({
  ...jest.requireActual('@/services/ChokContentService'),
  checkChokUpdate: jest.fn(async () => {}),
  prepareChokDownload: jest.fn(),
  installChok: jest.fn(async () => true),
}));

import { Linking } from 'react-native';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import MoreScreen from '../(tabs)/more';
import { Card } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { CITIES } from '@/data/cities';
import {
  CHOK_SIZE_ESTIMATE_MB,
  checkChokUpdate,
  installChok,
  prepareChokDownload,
} from '@/services/ChokContentService';
import { useChokStore } from '@/stores/useChokStore';
import { installChokFixture } from '@/testing/chok';
import { renderWithTheme } from '@/testing/render';
import { at } from '@/testing/zmanim';
import { useUserStore } from '@/stores/useUserStore';
import type { ChokManifest } from '@/types/chok';

const JERUSALEM = CITIES[0];
const mockCheck = jest.mocked(checkChokUpdate);
const mockPrepare = jest.mocked(prepareChokDownload);
const mockInstall = jest.mocked(installChok);
const MANIFEST = { version: 3, bytes: 18_600_000 } as ChokManifest;
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

afterEach(() => {
  useChokStore.getState().reset();
});

describe('More tab', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    useUserStore.setState({ location: JERUSALEM, inIsrael: true });
    mockPush.mockReset();
    mockCheck.mockClear();
    mockPrepare.mockReset();
    mockInstall.mockClear();
    installChokFixture();
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

  it('starts the download from the Chok LeYisrael row while the add-on is not installed', async () => {
    useChokStore.getState().reset();
    mockPrepare.mockResolvedValue(MANIFEST);
    renderAt('2026-11-16T12:00');
    expect(screen.getByText('חק לישראל')).toBeOnTheScreen();
    expect(screen.getByText(`תוסף להורדה · כ־${CHOK_SIZE_ESTIMATE_MB} MB`)).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByText('חק לישראל'));
    });
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText('הורדת חק לישראל')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getAllByText('הורדה').at(-1)!);
    });
    expect(mockInstall).toHaveBeenCalledWith(MANIFEST);
  });

  it('shows no dialog when the manifest could not be fetched', async () => {
    useChokStore.getState().reset();
    mockPrepare.mockResolvedValue(null);
    renderAt('2026-11-16T12:00');
    await act(async () => {
      fireEvent.press(screen.getByText('חק לישראל'));
    });
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('הורדת חק לישראל')).toBeNull();
    expect(mockInstall).not.toHaveBeenCalled();
  });

  it('opens the mitzvah screen from the row while the download runs', () => {
    useChokStore.getState().reset();
    useChokStore.getState().setDownload({ status: 'downloading', done: 3, total: 54, bytes: 1, totalBytes: 2 });
    renderAt('2026-11-16T12:00');
    fireEvent.press(screen.getByText('חק לישראל'));
    expect(mockPush).toHaveBeenCalledWith('/mitzvah/chok_leyisrael');
    expect(mockPrepare).not.toHaveBeenCalled();
  });

  it('says in the row that the download failed and offers another try', async () => {
    useChokStore.getState().reset();
    useChokStore.getState().setDownload({ status: 'failed', reason: 'offline' });
    mockPrepare.mockResolvedValue(null);
    renderAt('2026-11-16T12:00');
    expect(screen.getByText('ההורדה נכשלה · הקישו לניסיון נוסף')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByText('חק לישראל'));
    });
    expect(mockPrepare).toHaveBeenCalledTimes(1);
  });

  it('shows the download progress in the row', () => {
    useChokStore.getState().reset();
    useChokStore.getState().setDownload({ status: 'downloading', done: 3, total: 54, bytes: 1, totalBytes: 2 });
    renderAt('2026-11-16T12:00');
    expect(screen.getByText('בהורדה: 3/54')).toBeOnTheScreen();
  });

  it('checks for a newer add-on version when the tab is focused', () => {
    renderAt('2026-11-16T12:00');
    expect(mockCheck).toHaveBeenCalled();
  });

  it('lists Tehillim before the halacha hotline, with or without Chok LeYisrael, and opens it in the reader', () => {
    for (const chok of [true, false]) {
      if (chok) installChokFixture();
      else useChokStore.getState().reset();
      const { unmount } = renderAt('2026-11-16T12:00');
      const rows = screen.getAllByRole('button');
      expect(rows).toHaveLength(4);
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

  it('lists every destination on one divided card', () => {
    renderAt('2026-11-16T08:00');
    const cards = screen.UNSAFE_getAllByType(Card);
    expect(cards).toHaveLength(1);
    expect(cards[0].props.divided).toBe(true);
    expect(within(cards[0]).UNSAFE_getAllByType(ListRow)).toHaveLength(4);
  });
});

describe('Halacha hotline', () => {
  let openURL: jest.SpyInstance;

  beforeEach(() => {
    useUserStore.getState().reset();
    useUserStore.setState({ location: JERUSALEM, inIsrael: true });
    useChokStore.getState().reset();
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
