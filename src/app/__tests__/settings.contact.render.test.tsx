jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
jest.mock('@/services/NotificationScheduler', () => ({
  NotificationScheduler: { rebuild: jest.fn(async () => {}), cancelAll: jest.fn(async () => {}) },
  requestNotificationPermissions: jest.fn(async () => true),
  syncNotificationPermissionStatus: jest.fn(async () => true),
}));
jest.mock('@/services/ContactService', () => ({
  ...(jest.requireActual('@/services/ContactService') as object),
  isContactConfigured: jest.fn(() => true),
  sendContactMessage: jest.fn(async () => {}),
}));

import { Linking } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import SettingsScreen from '../(tabs)/settings';
import {
  CONTACT_EMAIL,
  ContactError,
  contactMailUrl,
  isContactConfigured,
  sendContactMessage,
} from '@/services/ContactService';
import { translate } from '@/i18n';
import { renderWithTheme } from '@/testing/render';
import { useUserStore } from '@/stores/useUserStore';

const he = (key: string) => translate(key, undefined, 'he', null);
const mockSend = jest.mocked(sendContactMessage);
const mockConfigured = jest.mocked(isContactConfigured);

async function openContactSection() {
  renderWithTheme(<SettingsScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByText(he('settings.contact')));
}

const field = (key: string) => screen.getByLabelText(he(key));

const send = async () => {
  await act(async () => {
    fireEvent.press(screen.getByText(he('settings.contactSend')));
  });
};

describe('Settings contact', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    useUserStore.setState({ isOnboarded: true, profileName: 'Avraham Sason', profilePhone: '050-1234567' });
    jest.clearAllMocks();
    mockConfigured.mockReturnValue(true);
  });

  it('is closed until opened, and is its own section', async () => {
    renderWithTheme(<SettingsScreen />);
    await act(async () => {});
    expect(screen.queryByText(he('settings.contactSend'))).toBeNull();

    fireEvent.press(screen.getByText(he('settings.contact')));
    expect(screen.getByText(he('settings.contactHint'))).toBeOnTheScreen();
    expect(screen.getByText(he('settings.contactSend'))).toBeOnTheScreen();
    expect(screen.getByText(he('settings.contactPrivacy'))).toBeOnTheScreen();
  });

  it('fills the name and phone from the profile and leaves the message empty', async () => {
    await openContactSection();

    expect(field('settings.profileName').props.value).toBe('Avraham Sason');
    expect(field('settings.profilePhone').props.value).toBe('050-1234567');
    expect(field('settings.contactMessage').props.value).toBe('');
  });

  it('takes the profile drafts typed in this visit', async () => {
    useUserStore.setState({ profileName: '', profilePhone: '' });
    renderWithTheme(<SettingsScreen />);
    await act(async () => {});
    fireEvent.press(screen.getByText(he('settings.profile')));
    fireEvent.changeText(screen.getByPlaceholderText(he('settings.profileNamePlaceholder')), 'New Name');
    fireEvent.press(screen.getByText(he('settings.contact')));

    expect(field('settings.profileName').props.value).toBe('New Name');
  });

  it('sends the three fields, clears the message and confirms', async () => {
    await openContactSection();
    fireEvent.changeText(field('settings.contactMessage'), 'Please add Kiddush');
    await send();

    expect(mockSend).toHaveBeenCalledWith(
      { name: 'Avraham Sason', phone: '050-1234567', message: 'Please add Kiddush' },
      'he',
    );
    expect(screen.getByText(he('settings.contactSent'))).toBeOnTheScreen();
    expect(field('settings.contactMessage').props.value).toBe('');
    expect(useUserStore.getState().profileName).toBe('Avraham Sason');
  });

  it.each([
    ['message', 'settings.contactMessage', ''],
    ['name', 'settings.profileName', '  '],
    ['phone', 'settings.profilePhone', ''],
  ])('refuses to send without a %s', async (_name, key, value) => {
    await openContactSection();
    fireEvent.changeText(field('settings.contactMessage'), 'Hello');
    fireEvent.changeText(field(key), value);
    await send();

    expect(mockSend).not.toHaveBeenCalled();
    expect(screen.getByText(he('settings.contactMissing'))).toBeOnTheScreen();
  });

  it('refuses a phone number that is not one', async () => {
    await openContactSection();
    fireEvent.changeText(field('settings.contactMessage'), 'Hello');
    fireEvent.changeText(field('settings.profilePhone'), '123');
    await send();

    expect(mockSend).not.toHaveBeenCalled();
    expect(screen.getByText(he('settings.contactPhoneInvalid'))).toBeOnTheScreen();
  });

  it.each([
    ['offline', 'settings.contactOffline'],
    ['busy', 'settings.contactBusy'],
    ['rejected', 'settings.contactFailed'],
  ] as const)('keeps the message and explains a %s failure', async (reason, key) => {
    mockSend.mockRejectedValueOnce(new ContactError(reason));
    await openContactSection();
    fireEvent.changeText(field('settings.contactMessage'), 'Hello');
    await send();

    expect(screen.getByText(he(key))).toBeOnTheScreen();
    expect(field('settings.contactMessage').props.value).toBe('Hello');
  });

  it('sends once while a send is in flight', async () => {
    let finish: () => void = () => {};
    mockSend.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    await openContactSection();
    fireEvent.changeText(field('settings.contactMessage'), 'Hello');
    await send();

    expect(screen.getByText(he('settings.contactSending'))).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByText(he('settings.contactSending')));
    });
    expect(mockSend).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(screen.getByText(he('settings.contactSent'))).toBeOnTheScreen();
  });

  it('opens the mail app on the developer address', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await openContactSection();
    fireEvent.press(screen.getByText(CONTACT_EMAIL));

    expect(openURL).toHaveBeenCalledWith(contactMailUrl());
    openURL.mockRestore();
  });

  it('shows only the email while no form is configured', async () => {
    mockConfigured.mockReturnValue(false);
    await openContactSection();

    expect(screen.queryByText(he('settings.contactSend'))).toBeNull();
    expect(screen.queryByLabelText(he('settings.contactMessage'))).toBeNull();
    expect(screen.getByText(CONTACT_EMAIL)).toBeOnTheScreen();
  });
});
