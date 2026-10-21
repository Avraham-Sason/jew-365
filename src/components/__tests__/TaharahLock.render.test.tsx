jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));
jest.mock('@/services/biometricLock', () => ({
  ...(jest.requireActual('@/services/biometricLock') as object),
  authenticate: jest.fn(async () => false),
  biometricsAvailable: jest.fn(async () => true),
  isSessionUnlocked: jest.fn(() => false),
  markUnlocked: jest.fn(),
}));

import { Text } from 'react-native';
import { act, screen, userEvent } from '@testing-library/react-native';
import { TaharahLock } from '../TaharahLock';
import { authenticate } from '@/services/biometricLock';
import { renderWithTheme } from '@/testing/render';
import { useTaharahStore } from '@/stores/useTaharahStore';
import { useUserStore } from '@/stores/useUserStore';
import { THEMES } from '@/theme/colors';

describe('TaharahLock', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    useUserStore.setState({ language: 'he' });
    useTaharahStore.getState().reset();
  });

  it('covers the screens with the unlock button while locked', async () => {
    useTaharahStore.setState({ lockEnabled: true });
    renderWithTheme(
      <TaharahLock>
        <Text>secret</Text>
      </TaharahLock>,
    );

    expect(await screen.findByRole('button', { name: 'זיהוי לפתיחה' })).toHaveStyle({
      backgroundColor: THEMES.gold.gold,
    });
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('asks again from the unlock button', async () => {
    useTaharahStore.setState({ lockEnabled: true });
    renderWithTheme(
      <TaharahLock>
        <Text>secret</Text>
      </TaharahLock>,
    );
    const unlock = await screen.findByRole('button', { name: 'זיהוי לפתיחה' });
    const before = jest.mocked(authenticate).mock.calls.length;

    await userEvent.setup().press(unlock);

    expect(jest.mocked(authenticate).mock.calls.length).toBe(before + 1);
  });

  it('renders the screens while the lock is off', async () => {
    useTaharahStore.setState({ lockEnabled: false });
    renderWithTheme(
      <TaharahLock>
        <Text>secret</Text>
      </TaharahLock>,
    );
    await act(async () => {});

    expect(screen.getByText('secret')).toBeOnTheScreen();
  });
});
