import { fireEvent, screen } from '@testing-library/react-native';
import { ChoiceRow } from '../ChoiceRow';
import { MitzvahIcon } from '../MitzvahIcon';
import { renderWithTheme } from '@/testing/render';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { useUserStore } from '@/stores/useUserStore';

const checkIcons = () => screen.UNSAFE_queryAllByType(MitzvahIcon).filter((icon) => icon.props.name === 'check');

describe('ChoiceRow', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('is a radio named by its label that fires onPress once', () => {
    const onPress = jest.fn();
    renderWithTheme(<ChoiceRow label="גבר" selected={false} onPress={onPress} />);
    fireEvent.press(screen.getByRole('radio', { name: 'גבר' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('draws no tick while unselected and says so to a screen reader', () => {
    renderWithTheme(<ChoiceRow label="גבר" selected={false} onPress={jest.fn()} />);
    expect(checkIcons()).toHaveLength(0);
    expect(screen.queryByText(/✓/)).toBeNull();
    expect(screen.getByRole('radio', { name: 'גבר' })).not.toBeChecked();
  });

  it('draws the tick as the check icon, never a text glyph, and says it is selected', () => {
    renderWithTheme(<ChoiceRow label="גבר" selected onPress={jest.fn()} />);
    expect(checkIcons()).toHaveLength(1);
    expect(screen.queryByText(/✓/)).toBeNull();
    expect(screen.getByRole('radio', { name: 'גבר' })).toBeChecked();
  });

  it.each([true, false])('hands aria-checked %s to the web DOM, which ignores accessibilityState', (selected) => {
    renderWithTheme(<ChoiceRow label="גבר" selected={selected} onPress={jest.fn()} />);
    let node: ReturnType<typeof screen.getByRole> | null = screen.getByRole('radio', { name: 'גבר' });
    while (node && node.props['aria-checked'] === undefined) node = node.parent;
    expect(node?.props['aria-checked']).toBe(selected);
  });

  it.each(THEME_NAMES)(
    '%s: rests on surface with a transparent border and turns goldLight with a gold border when selected',
    (name) => {
      useUserStore.setState({ theme: name });
      const { rerender } = renderWithTheme(<ChoiceRow label="גבר" selected={false} onPress={jest.fn()} />);
      expect(screen.getByRole('radio', { name: 'גבר' })).toHaveStyle({
        backgroundColor: THEMES[name].surface,
        borderColor: 'transparent',
        borderWidth: 1.5,
        shadowColor: THEMES[name].shadow,
      });
      rerender(<ChoiceRow label="גבר" selected onPress={jest.fn()} />);
      expect(screen.getByRole('radio', { name: 'גבר' })).toHaveStyle({
        backgroundColor: THEMES[name].goldLight,
        borderColor: THEMES[name].gold,
        borderWidth: 1.5,
      });
    },
  );

  it.each(THEME_NAMES)('%s: the tick is onGold on a gold circle', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(<ChoiceRow label="גבר" selected onPress={jest.fn()} />);
    const [icon] = checkIcons();
    expect(icon.props.color).toBe(THEMES[name].onGold);
    expect(icon.parent).toHaveStyle({ backgroundColor: THEMES[name].gold, width: 22, height: 22 });
  });
});
