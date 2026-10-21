import { screen, userEvent } from '@testing-library/react-native';
import { Button } from '../Button';
import { MitzvahIcon } from '../MitzvahIcon';
import { renderWithTheme } from '@/testing/render';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { useUserStore } from '@/stores/useUserStore';

describe('Button', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it.each(THEME_NAMES)('%s: primary is the accent fill with the onGold label', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(<Button label="Save" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveStyle({
      backgroundColor: THEMES[name].gold,
      borderRadius: 16,
      minHeight: 48,
    });
    expect(screen.getByText('Save')).toHaveStyle({ color: THEMES[name].onGold, fontSize: 15 });
  });

  it('secondary is surface2 with the text label', () => {
    renderWithTheme(<Button label="Save" variant="secondary" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveStyle({ backgroundColor: THEMES.gold.surface2 });
    expect(screen.getByText('Save')).toHaveStyle({ color: THEMES.gold.text });
  });

  it('danger is urgentBg with an urgent border and label', () => {
    renderWithTheme(<Button label="Delete" variant="danger" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveStyle({
      backgroundColor: THEMES.gold.urgentBg,
      borderWidth: 1,
      borderColor: THEMES.gold.urgent,
    });
    expect(screen.getByText('Delete')).toHaveStyle({ color: THEMES.gold.urgent });
  });

  it('fires onPress once', async () => {
    const onPress = jest.fn();
    renderWithTheme(<Button label="Save" onPress={onPress} />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disabled dims, reports the state and ignores a press', async () => {
    const onPress = jest.fn();
    renderWithTheme(<Button label="Save" disabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ opacity: 0.5 });
    await userEvent.setup().press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('busy is disabled and busy', async () => {
    const onPress = jest.fn();
    renderWithTheme(<Button label="Save" busy onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toBeBusy();
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    await userEvent.setup().press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('draws the icon before the label in the label colour', () => {
    renderWithTheme(<Button label="Save" icon="plus" onPress={jest.fn()} />);
    expect(screen.UNSAFE_getByType(MitzvahIcon).props).toMatchObject({
      name: 'plus',
      size: 18,
      color: THEMES.gold.onGold,
    });
    const json = JSON.stringify(screen.toJSON());
    expect(json.indexOf('RNSVG')).toBeGreaterThan(-1);
    expect(json.indexOf('RNSVG')).toBeLessThan(json.indexOf('Save'));
  });

  it('compact uses the caption label and a 40-point height', () => {
    const { unmount } = renderWithTheme(<Button label="Save" size="compact" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveStyle({ minHeight: 40 });
    expect(screen.getByText('Save')).toHaveStyle({ fontSize: 13 });
    unmount();
    renderWithTheme(<Button label="Save" size="compact" icon="plus" onPress={jest.fn()} />);
    expect(screen.UNSAFE_getByType(MitzvahIcon).props.size).toBe(16);
  });

  it('uses the accessibilityLabel over the label', () => {
    renderWithTheme(<Button label="Save" accessibilityLabel="Restore" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Restore' })).toBeOnTheScreen();
  });
});
