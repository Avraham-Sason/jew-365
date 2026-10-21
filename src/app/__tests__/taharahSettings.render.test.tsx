const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ replace: mockReplace, back: mockBack, canGoBack: () => true, push: jest.fn() }),
}));

import { fireEvent, screen } from '@testing-library/react-native';
import TaharahSettingsScreen from '../taharah/settings';
import { translate } from '@/i18n';
import { renderWithTheme } from '@/testing/render';
import { chooseGender, chooseMaritalStatus, setTaharahTracking } from '@/stores/taharahOptIn';
import { useTaharahStore } from '@/stores/useTaharahStore';
import { useUserStore } from '@/stores/useUserStore';
import { THEMES } from '@/theme/colors';

const he = (key: string) => translate(key, undefined, 'he', null);

describe('Taharah settings', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    useTaharahStore.getState().reset();
    chooseGender('female');
    chooseMaritalStatus('married');
    setTaharahTracking(true);
    useTaharahStore.getState().addEvent({ type: 'onset', onah: { abs: 740000, kind: 'night' } });
    useTaharahStore.getState().setRule('ohrZarua', true);
    mockReplace.mockClear();
    mockBack.mockClear();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('explains what every setting affects', () => {
    renderWithTheme(<TaharahSettingsScreen />);
    for (const key of [
      'preset',
      'hefsekEarliestDay',
      'mochDachuk',
      'onahBeinonitDays',
      'onahBeinonitSpan',
      'ohrZarua',
      'haflagaMethod',
      'role',
      'reminders',
      'deleteData',
      'reset',
    ]) {
      expect(screen.getByText(he(`taharah.affects.${key}`))).toBeOnTheScreen();
    }
  });

  it('draws both resets as danger buttons', () => {
    renderWithTheme(<TaharahSettingsScreen />);
    const palette = THEMES[useUserStore.getState().theme];
    for (const key of ['taharah.settings.deleteData', 'taharah.settings.reset']) {
      expect(screen.getByRole('button', { name: he(key) })).toHaveStyle({
        backgroundColor: palette.urgentBg,
        borderColor: palette.urgent,
      });
    }
  });

  it('deletes only the records, keeping the rules and tracking', () => {
    renderWithTheme(<TaharahSettingsScreen />);
    fireEvent.press(screen.getByText(he('taharah.settings.deleteData')));
    fireEvent.press(screen.getByText(he('taharah.settings.deleteAction')));

    expect(useTaharahStore.getState().events).toEqual([]);
    expect(useTaharahStore.getState().settings.rules.ohrZarua).toBe(true);
    expect(useUserStore.getState().taharahEnabled).toBe(true);
  });

  it('resets tracking completely after a confirmation and leaves for Settings', () => {
    renderWithTheme(<TaharahSettingsScreen />);
    fireEvent.press(screen.getByText(he('taharah.settings.reset')));
    expect(screen.getByText(he('taharah.settings.resetConfirmBody'))).toBeOnTheScreen();
    expect(useUserStore.getState().taharahEnabled).toBe(true);

    fireEvent.press(screen.getByText(he('taharah.settings.resetAction')));

    expect(useUserStore.getState().taharahEnabled).toBe(false);
    expect(useTaharahStore.getState().events).toEqual([]);
    expect(useTaharahStore.getState().settings.rules.ohrZarua).toBe(false);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/settings');
  });

  it('keeps everything when the reset is cancelled', () => {
    renderWithTheme(<TaharahSettingsScreen />);
    fireEvent.press(screen.getByText(he('taharah.settings.reset')));
    fireEvent.press(screen.getByText(he('common.cancel')));

    expect(useUserStore.getState().taharahEnabled).toBe(true);
    expect(useTaharahStore.getState().events).toHaveLength(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
