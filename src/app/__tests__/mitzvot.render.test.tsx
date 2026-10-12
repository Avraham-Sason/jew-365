const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

import { fireEvent, screen } from '@testing-library/react-native';
import MitzvotScreen from '../mitzvot';
import { MITZVOT } from '@/data/mitzvot';
import { IconTile } from '@/components/IconTile';
import { renderWithTheme } from '@/testing/render';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useUserStore } from '@/stores/useUserStore';

const TEFILLIN = 'הנחת תפילין';
const HAVDALAH = 'הבדלה';
const HILULOT = 'הילולות צדיקים';
const ROSH_CHODESH = 'ראש חודש';

const switchLabels = () => screen.getAllByRole('switch').map((node) => node.props.accessibilityLabel);
const chip = (label: string) =>
  screen.getAllByRole('button', { name: label }).find((node) => node.props.accessibilityState?.selected !== undefined)!;

describe('Mitzvot library', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    useMitzvotStore.getState().reset();
    mockPush.mockReset();
  });

  it('lists an enabled and a disabled mitzvah in the one list, each with its own switch state', () => {
    renderWithTheme(<MitzvotScreen />);
    expect(screen.getByText(TEFILLIN)).toBeOnTheScreen();
    expect(screen.getByText(HAVDALAH)).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: TEFILLIN })).toBeChecked();
    expect(screen.getByRole('switch', { name: HAVDALAH })).not.toBeChecked();
  });

  it('lists every registry mitzvah in registry order, then the two setting rows', () => {
    renderWithTheme(<MitzvotScreen />);
    expect(switchLabels()).toEqual([...MITZVOT.map((mitzvah) => mitzvah.name.he), HILULOT, ROSH_CHODESH]);
  });

  it('draws a disabled mitzvah with a muted icon and an enabled one with the accent icon', () => {
    renderWithTheme(<MitzvotScreen />);
    const tones = Object.fromEntries(
      screen.UNSAFE_getAllByType(IconTile).map((tile) => [tile.props.name, tile.props.tone]),
    );
    const enabledIcon = MITZVOT.find((mitzvah) => mitzvah.name.he === TEFILLIN)!.icon;
    const disabledIcon = MITZVOT.find((mitzvah) => mitzvah.name.he === HAVDALAH)!.icon;
    expect(tones[enabledIcon]).toBe('accent');
    expect(tones[disabledIcon]).toBe('muted');
  });

  it('draws no active / available segmented control', () => {
    renderWithTheme(<MitzvotScreen />);
    expect(screen.queryAllByRole('radio')).toEqual([]);
    expect(screen.queryByText('פעילות')).toBeNull();
    expect(screen.queryByText('זמינות')).toBeNull();
  });

  it('draws no active / available segmented control in English either', () => {
    useUserStore.setState({ language: 'en' });
    renderWithTheme(<MitzvotScreen />);
    expect(screen.queryAllByRole('radio')).toEqual([]);
    expect(screen.queryByText('Active')).toBeNull();
    expect(screen.queryByText('Available')).toBeNull();
  });

  it('keeps a row on screen and in place when its switch flips, and writes the mitzvot store', () => {
    renderWithTheme(<MitzvotScreen />);
    const before = switchLabels();

    fireEvent(screen.getByRole('switch', { name: HAVDALAH }), 'valueChange', true);
    expect(useMitzvotStore.getState().activeMitzvot.havdalah.enabled).toBe(true);
    expect(screen.getByText(HAVDALAH)).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: HAVDALAH })).toBeChecked();
    expect(switchLabels()).toEqual(before);

    fireEvent(screen.getByRole('switch', { name: TEFILLIN }), 'valueChange', false);
    expect(useMitzvotStore.getState().activeMitzvot.tefillin.enabled).toBe(false);
    expect(screen.getByText(TEFILLIN)).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: TEFILLIN })).not.toBeChecked();
    expect(switchLabels()).toEqual(before);
  });

  it('opens the mitzvah from its row', () => {
    renderWithTheme(<MitzvotScreen />);
    fireEvent.press(screen.getByText(HAVDALAH));
    expect(mockPush).toHaveBeenCalledWith('/mitzvah/havdalah');
  });

  it('shows the hilulot and Rosh Chodesh rows with their switches off', () => {
    renderWithTheme(<MitzvotScreen />);
    expect(screen.getByRole('switch', { name: HILULOT })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: ROSH_CHODESH })).not.toBeChecked();
  });

  it('shows the hilulot and Rosh Chodesh rows with their switches on', () => {
    useUserStore.setState({ hilulotEnabled: true, roshChodeshEnabled: true });
    renderWithTheme(<MitzvotScreen />);
    expect(screen.getByRole('switch', { name: HILULOT })).toBeChecked();
    expect(screen.getByRole('switch', { name: ROSH_CHODESH })).toBeChecked();
  });

  it('writes the user store from the setting rows and keeps them listed', () => {
    renderWithTheme(<MitzvotScreen />);
    fireEvent(screen.getByRole('switch', { name: HILULOT }), 'valueChange', true);
    fireEvent(screen.getByRole('switch', { name: ROSH_CHODESH }), 'valueChange', true);
    expect(useUserStore.getState().hilulotEnabled).toBe(true);
    expect(useUserStore.getState().roshChodeshEnabled).toBe(true);
    expect(screen.getByText(HILULOT)).toBeOnTheScreen();
    expect(screen.getByText(ROSH_CHODESH)).toBeOnTheScreen();
  });

  it('opens the hilulot and Rosh Chodesh screens from their rows', () => {
    renderWithTheme(<MitzvotScreen />);
    fireEvent.press(screen.getByText(HILULOT));
    expect(mockPush).toHaveBeenLastCalledWith('/hilulot');
    fireEvent.press(screen.getByText(ROSH_CHODESH));
    expect(mockPush).toHaveBeenLastCalledWith('/rosh-chodesh');
  });

  it('hides the two setting rows under a non-seasonal category and filters the mitzvot to it', () => {
    renderWithTheme(<MitzvotScreen />);
    fireEvent.press(chip('שבועית'));
    expect(screen.queryByText(HILULOT)).toBeNull();
    expect(screen.queryByText(ROSH_CHODESH)).toBeNull();
    expect(switchLabels()).toEqual(
      MITZVOT.filter((mitzvah) => mitzvah.category === 'weekly').map((mitzvah) => mitzvah.name.he),
    );
    expect(screen.queryByText(TEFILLIN)).toBeNull();
  });

  it('hides the two setting rows under a non-seasonal category whichever way their switches are set', () => {
    useUserStore.setState({ hilulotEnabled: true, roshChodeshEnabled: true });
    renderWithTheme(<MitzvotScreen />);
    fireEvent.press(chip('בוקר'));
    expect(screen.queryByText(HILULOT)).toBeNull();
    expect(screen.queryByText(ROSH_CHODESH)).toBeNull();
  });

  it('shows the two setting rows again under the seasonal category and under all', () => {
    renderWithTheme(<MitzvotScreen />);
    fireEvent.press(chip('בוקר'));
    fireEvent.press(chip('עונתית'));
    expect(screen.getByText(HILULOT)).toBeOnTheScreen();
    expect(screen.getByText(ROSH_CHODESH)).toBeOnTheScreen();
    expect(switchLabels()).toEqual([
      ...MITZVOT.filter((mitzvah) => mitzvah.category === 'seasonal').map((mitzvah) => mitzvah.name.he),
      HILULOT,
      ROSH_CHODESH,
    ]);

    fireEvent.press(chip('הכל'));
    expect(screen.getByText(HILULOT)).toBeOnTheScreen();
    expect(screen.getByText(ROSH_CHODESH)).toBeOnTheScreen();
    expect(screen.getByText(TEFILLIN)).toBeOnTheScreen();
  });

  it('shows no empty state while the list has rows', () => {
    renderWithTheme(<MitzvotScreen />);
    expect(screen.queryByText('אין מצוות בקטגוריה זו.')).toBeNull();
  });
});
