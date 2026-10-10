import { screen, userEvent } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { UpdateBanner } from '../UpdateBanner';
import { QuietBlockContext } from '../ShabbatScreen';
import { renderWithTheme } from '@/testing/render';
import { useUserStore } from '@/stores/useUserStore';
import { downloadNewUpdate, reloadIntoUpdate } from '@/services/appUpdates';
import type { HolyBlock } from '@/types/zmanim';

jest.mock('expo-updates', () => ({ useUpdates: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/services/appUpdates', () => ({
  downloadNewUpdate: jest.fn(() => Promise.resolve(null)),
  reloadIntoUpdate: jest.fn(() => Promise.resolve()),
}));

const { useUpdates } = jest.requireMock('expo-updates') as { useUpdates: jest.Mock };
const BLOCK: HolyBlock = {
  start: new Date(2026, 10, 13, 16),
  end: new Date(2026, 10, 14, 18),
  days: ['2026-11-14'],
  kind: 'shabbat',
};

describe('UpdateBanner', () => {
  let listeners: ((state: string) => void)[] = [];

  beforeEach(() => {
    useUserStore.getState().reset();
    jest.clearAllMocks();
    useUpdates.mockReturnValue({ isUpdatePending: false });
    listeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: string) => void);
      return { remove: jest.fn() } as never;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows nothing while no update is downloaded, but still checks for one', () => {
    renderWithTheme(<UpdateBanner />);
    expect(screen.queryByText('גרסה חדשה של האפליקציה מוכנה. לחץ כדי לטעון אותה.')).toBeNull();
    expect(downloadNewUpdate).toHaveBeenCalledTimes(1);
  });

  it('floats the reload banner once an update is pending, and a tap reloads into it', async () => {
    useUpdates.mockReturnValue({ isUpdatePending: true });
    renderWithTheme(<UpdateBanner />);
    const button = screen.getByRole('button', { name: 'גרסה חדשה של האפליקציה מוכנה. לחץ כדי לטעון אותה.' });
    await userEvent.setup().press(button);
    expect(reloadIntoUpdate).toHaveBeenCalledTimes(1);
  });

  it('checks for an update again on every return to the foreground', () => {
    renderWithTheme(<UpdateBanner />);
    listeners.forEach((listener) => listener('active'));
    expect(downloadNewUpdate).toHaveBeenCalledTimes(2);
    listeners.forEach((listener) => listener('background'));
    expect(downloadNewUpdate).toHaveBeenCalledTimes(2);
  });

  it('stays hidden inside a holy block', () => {
    useUpdates.mockReturnValue({ isUpdatePending: true });
    renderWithTheme(
      <QuietBlockContext.Provider value={BLOCK}>
        <UpdateBanner />
      </QuietBlockContext.Provider>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
