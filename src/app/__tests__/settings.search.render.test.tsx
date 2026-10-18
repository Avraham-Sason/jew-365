const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: mockPush, replace: jest.fn() }),
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
jest.mock('@/services/NotificationScheduler', () => ({
  NotificationScheduler: { rebuild: jest.fn(async () => {}), cancelAll: jest.fn(async () => {}) },
  requestNotificationPermissions: jest.fn(async () => true),
  syncNotificationPermissionStatus: jest.fn(async () => true),
}));

import { act, fireEvent, screen, within } from '@testing-library/react-native';
import SettingsScreen from '../(tabs)/settings';
import { translate } from '@/i18n';
import { renderWithTheme } from '@/testing/render';
import { useUserStore } from '@/stores/useUserStore';

const he = (key: string, options?: Record<string, unknown>) => translate(key, options, 'he', null);

async function renderSettings() {
  renderWithTheme(<SettingsScreen />);
  await act(async () => {});
}

const openSection = (key: string) => fireEvent.press(screen.getByText(he(key)));

const search = async (text: string) => {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(he('settings.search')), text);
  });
};

describe('Settings layout', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    useUserStore.setState({ isOnboarded: true, gender: 'male', maritalStatus: 'single' });
    mockPush.mockClear();
  });

  it('says under each section title what it holds', async () => {
    await renderSettings();
    for (const key of [
      'settings.profileSummary',
      'settings.prayerSummary',
      'settings.deviceSummary',
      'settings.backupSummary',
      'settings.contactSummary',
    ]) {
      expect(screen.getByText(he(key))).toBeOnTheScreen();
    }
  });

  it('names family purity in the summaries of a married user', async () => {
    useUserStore.setState({ maritalStatus: 'married' });
    await renderSettings();
    expect(screen.getByText(he('settings.profileSummaryTaharah'))).toBeOnTheScreen();
    expect(screen.getByText(he('settings.deviceSummaryTaharah'))).toBeOnTheScreen();
  });

  it('keeps the Shema opinion under the nusach in Prayer, not in Device', async () => {
    await renderSettings();
    openSection('settings.device');
    expect(screen.queryByText(he('settings.opinion'))).toBeNull();
    openSection('settings.device');

    openSection('settings.prayer');
    const prayer = screen.getByTestId('settings-anchor-opinion');
    expect(within(prayer).getByText(he('settings.opinion.GRA'))).toBeOnTheScreen();
    fireEvent.press(within(prayer).getByText(he('settings.opinion.MA')));
    expect(useUserStore.getState().halachicOpinions.ksSofZman).toBe('MA');
  });

  it('offers family purity in Profile and under the notifications of Device, one switch for both', async () => {
    useUserStore.setState({ maritalStatus: 'married' });
    await renderSettings();
    openSection('settings.profile');
    openSection('settings.device');

    const inProfile = screen.getByTestId('settings-anchor-taharah');
    const inDevice = screen.getByTestId('settings-anchor-taharahDevice');
    fireEvent(within(inDevice).getByLabelText(he('settings.taharahEnabled')), 'valueChange', true);
    expect(useUserStore.getState().taharahEnabled).toBe(true);
    expect(within(inProfile).getByLabelText(he('settings.taharahEnabled')).props.value).toBe(true);
    expect(within(inProfile).getByText(he('settings.taharahOpen'))).toBeOnTheScreen();
  });

  it('shows no family purity block to a single user', async () => {
    await renderSettings();
    openSection('settings.profile');
    openSection('settings.device');
    expect(screen.queryByText(he('settings.taharah'))).toBeNull();
  });
});

describe('Settings search', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    useUserStore.setState({ isOnboarded: true, gender: 'male', maritalStatus: 'single' });
    mockPush.mockClear();
  });

  it('replaces the sections with the matches while a query is typed', async () => {
    await renderSettings();
    await search('התראות');

    expect(screen.queryByText(he('settings.profile'))).toBeNull();
    expect(screen.getByText(he('settings.notifications'))).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText(he('settings.searchClear')));
    expect(screen.getByText(he('settings.profile'))).toBeOnTheScreen();
  });

  it('opens the section of a match and highlights the setting', async () => {
    await renderSettings();
    await search('גרא');
    await act(async () => {
      fireEvent.press(screen.getByText(he('settings.opinion')));
    });

    expect(screen.getByLabelText(he('settings.search')).props.value).toBe('');
    const target = screen.getByTestId('settings-anchor-opinion');
    expect(within(target).getByText(he('settings.opinion.GRA'))).toBeOnTheScreen();
    expect(target.props.style).toBeTruthy();
  });

  it('opens the first match on submit', async () => {
    await renderSettings();
    await search('צבע');
    await act(async () => {
      fireEvent(screen.getByLabelText(he('settings.search')), 'submitEditing');
    });
    expect(screen.getByTestId('settings-anchor-theme').props.style).toBeTruthy();
  });

  it('pushes the screen of a match that lives outside Settings', async () => {
    await renderSettings();
    await search('הילולות');
    fireEvent.press(screen.getByText(he('hilulot.title')));
    expect(mockPush).toHaveBeenCalledWith('/hilulot');
  });

  it('takes "add a mitzvah" to the new custom mitzvah screen', async () => {
    await renderSettings();
    await search('הוספת מצווה');
    fireEvent.press(screen.getByText(he('settings.searchAddMitzvah')));
    expect(mockPush).toHaveBeenCalledWith('/custom-mitzvah');
  });

  it('forgives a typo and a word typed in the other keyboard layout', async () => {
    await renderSettings();
    await search('התרעות');
    expect(screen.getByText(he('settings.notifications'))).toBeOnTheScreen();
    await search('v,rtu,');
    expect(screen.getByText(he('settings.notifications'))).toBeOnTheScreen();
  });

  it('says so when nothing matches', async () => {
    await renderSettings();
    await search('קקקקקק');
    expect(screen.getByText(he('settings.searchEmpty', { query: 'קקקקקק' }))).toBeOnTheScreen();
    expect(screen.getByText(he('settings.searchEmptyHint'))).toBeOnTheScreen();
  });

  it('keeps a profile draft typed before searching', async () => {
    await renderSettings();
    openSection('settings.profile');
    fireEvent.changeText(screen.getByPlaceholderText(he('settings.profileNamePlaceholder')), 'Avraham');
    await search('נוסח');
    expect(useUserStore.getState().profileName).toBe('Avraham');
  });

  it('never offers family purity to a single user', async () => {
    await renderSettings();
    await search('טהרה');
    expect(screen.queryByText(he('settings.taharah'))).toBeNull();
  });
});
