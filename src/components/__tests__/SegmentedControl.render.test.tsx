import { StyleSheet } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { SegmentedControl } from '../SegmentedControl';
import { renderWithTheme } from '@/testing/render';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { radius, spacing } from '@/theme/tokens';
import { useUserStore } from '@/stores/useUserStore';

type Node = ReturnType<typeof screen.getByRole>;

const hostParent = (node: Node): Node => {
  let current = node.parent;
  while (current && typeof current.type !== 'string') current = current.parent;
  return current!;
};

const OPTIONS = [
  { value: 'he', label: 'עברית' },
  { value: 'en', label: 'English' },
] as const;

describe('SegmentedControl', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('draws every option as a radio named by its label', () => {
    renderWithTheme(<SegmentedControl options={OPTIONS} value="he" onChange={jest.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'עברית' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'English' })).toBeOnTheScreen();
  });

  it('marks only the current value as selected and checked', () => {
    renderWithTheme(<SegmentedControl options={OPTIONS} value="en" onChange={jest.fn()} />);
    const he = screen.getByRole('radio', { name: 'עברית' });
    const en = screen.getByRole('radio', { name: 'English' });
    expect(en).toBeSelected();
    expect(en).toBeChecked();
    expect(he).not.toBeSelected();
    expect(he).not.toBeChecked();
  });

  it('moves the selected state when the value prop changes', () => {
    const { rerender } = renderWithTheme(<SegmentedControl options={OPTIONS} value="he" onChange={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'עברית' })).toBeSelected();
    rerender(<SegmentedControl options={OPTIONS} value="en" onChange={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'English' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'עברית' })).not.toBeSelected();
  });

  it('calls onChange once with the pressed option value', () => {
    const onChange = jest.fn();
    renderWithTheme(<SegmentedControl options={OPTIONS} value="he" onChange={onChange} />);
    fireEvent.press(screen.getByRole('radio', { name: 'English' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('en');
  });

  it.each(THEME_NAMES)(
    '%s: the chosen option is a gold pill with onGold text, the others surface2 pills with text',
    (name) => {
      useUserStore.setState({ theme: name });
      const colors = THEMES[name];
      renderWithTheme(<SegmentedControl options={OPTIONS} value="he" onChange={jest.fn()} />);
      expect(screen.getByRole('radio', { name: 'עברית' })).toHaveStyle({ backgroundColor: colors.gold });
      expect(screen.getByText('עברית')).toHaveStyle({ color: colors.onGold });
      expect(screen.getByRole('radio', { name: 'English' })).toHaveStyle({ backgroundColor: colors.surface2 });
      expect(screen.getByText('English')).toHaveStyle({ color: colors.text });
    },
  );

  it('lays the options out as separate pills 4 points apart', () => {
    renderWithTheme(<SegmentedControl options={OPTIONS} value="he" onChange={jest.fn()} />);
    const track = hostParent(screen.getAllByRole('radio')[0]);
    expect(track).toHaveStyle({ flexDirection: 'row', gap: spacing.xs });
    expect(StyleSheet.flatten(track.props.style).backgroundColor).toBeUndefined();
    screen.getAllByRole('radio').forEach((radio) => expect(radio).toHaveStyle({ borderRadius: radius.md }));
  });
});

describe('SegmentedControl web accessibility state', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  // react-native-web 0.21 maps only the aria-* props to the DOM and ignores accessibilityState,
  // so the selected option must reach the Pressable as aria-checked to be more than visual on the web.
  function ariaCheckedOf(label: string) {
    let node: ReturnType<typeof screen.getByRole> | null = screen.getByRole('radio', { name: label }).parent;
    while (node && node.props['aria-checked'] === undefined) node = node.parent;
    return node?.props['aria-checked'];
  }

  it('hands aria-checked true to the selected option and false to the others', () => {
    renderWithTheme(<SegmentedControl options={OPTIONS} value="en" onChange={jest.fn()} />);
    expect(ariaCheckedOf('English')).toBe(true);
    expect(ariaCheckedOf('עברית')).toBe(false);
  });

  it('moves aria-checked with the value prop', () => {
    const { rerender } = renderWithTheme(<SegmentedControl options={OPTIONS} value="he" onChange={jest.fn()} />);
    expect(ariaCheckedOf('עברית')).toBe(true);
    rerender(<SegmentedControl options={OPTIONS} value="en" onChange={jest.fn()} />);
    expect(ariaCheckedOf('English')).toBe(true);
    expect(ariaCheckedOf('עברית')).toBe(false);
  });

  it('keeps the native accessibility state: selected and checked on the chosen option only', () => {
    renderWithTheme(<SegmentedControl options={OPTIONS} value="he" onChange={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'עברית' }).props.accessibilityState).toMatchObject({
      selected: true,
      checked: true,
    });
    expect(screen.getByRole('radio', { name: 'English' }).props.accessibilityState).toMatchObject({
      selected: false,
      checked: false,
    });
  });
});

describe('SegmentedControl accessibility label', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('names an option by its accessibility label when it has one, else by its label', () => {
    const onChange = jest.fn();
    renderWithTheme(
      <SegmentedControl
        options={[
          { value: 'a', label: 'א׳', accessibilityLabel: 'יום ראשון' },
          { value: 'b', label: 'ב׳' },
        ]}
        value="a"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('radio', { name: 'יום ראשון' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'ב׳' })).not.toBeSelected();
    expect(screen.getByText('א׳')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('radio', { name: 'ב׳' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
