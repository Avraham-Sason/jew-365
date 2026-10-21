const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/services/NotificationScheduler', () => ({
  requestNotificationPermissions: jest.fn(async () => true),
  syncNotificationPermissionStatus: jest.fn(async () => {}),
  NotificationScheduler: { rebuild: jest.fn(async () => {}) },
}));

import { act, fireEvent, screen } from '@testing-library/react-native';
import OnboardingLocationScreen from '../onboarding/location';
import ProfileScreen from '../onboarding/profile';
import { CITIES, getLocationName } from '@/data/cities';
import { translate } from '@/i18n';
import { renderWithTheme } from '@/testing/render';
import { useUserStore } from '@/stores/useUserStore';

const he = (key: string) => translate(key, undefined, 'he', null);

describe('Onboarding Continue buttons', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    useUserStore.setState({ language: 'he' });
    mockPush.mockClear();
  });

  it('keeps Continue on the profile step disabled until gender and status are chosen', () => {
    renderWithTheme(<ProfileScreen />);
    const next = () => screen.getByRole('button', { name: he('common.continue') });
    expect(next()).toBeDisabled();

    fireEvent.press(screen.getByText(he('profile.gender.male')));
    fireEvent.press(screen.getByText(he('profile.maritalStatus.married.male')));

    expect(next()).toBeEnabled();
    fireEvent.press(next());
    expect(mockPush).toHaveBeenCalledWith('/onboarding/nusach');
  });

  it('keeps Continue on the location step disabled until the location is confirmed', async () => {
    useUserStore.setState({ locationStatus: 'missing' });
    renderWithTheme(<OnboardingLocationScreen />);
    await act(async () => {});
    const next = () => screen.getByRole('button', { name: he('common.continue') });
    expect(next()).toBeDisabled();
    expect(screen.getByText(he('onboarding.locationRequired'))).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: getLocationName(CITIES[0], 'he') }));

    expect(next()).toBeEnabled();
    fireEvent.press(next());
    expect(mockPush).toHaveBeenCalledWith('/onboarding/ready');
  });
});
