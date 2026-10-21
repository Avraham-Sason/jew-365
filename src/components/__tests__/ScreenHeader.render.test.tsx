import { StyleSheet, Text } from 'react-native';
import { Path } from 'react-native-svg';
import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { CounterPill, HeaderPill, ScreenHeader } from '../ScreenHeader';
import { MitzvahIcon } from '../MitzvahIcon';
import { renderWithTheme } from '@/testing/render';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { radius } from '@/theme/tokens';
import { useUserStore } from '@/stores/useUserStore';

type Node = ReturnType<typeof screen.getByRole>;

const hostParent = (node: Node): Node => {
  let current = node.parent;
  while (current && typeof current.type !== 'string') current = current.parent;
  return current!;
};

describe('ScreenHeader', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('shows the title and the subtitle', () => {
    renderWithTheme(<ScreenHeader title="Hilulot" subtitle="Coming soon" />);
    expect(screen.getByText('Hilulot')).toBeOnTheScreen();
    expect(screen.getByText('Coming soon')).toBeOnTheScreen();
  });

  it.each(THEME_NAMES)('%s: the title reads text and the subtitle textSub', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(<ScreenHeader title="Hilulot" subtitle="Coming soon" />);
    expect(screen.getByText('Hilulot')).toHaveStyle({ color: THEMES[name].text });
    expect(screen.getByText('Coming soon')).toHaveStyle({ color: THEMES[name].textSub });
  });

  it.each(THEME_NAMES)('%s: draws no band: nothing in it paints bg', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(<ScreenHeader title="Hilulot" subtitle="Coming soon" onBack={jest.fn()} />);
    const painted = screen.UNSAFE_root.findAll(
      (node: Node) =>
        typeof node.type === 'string' && StyleSheet.flatten(node.props.style)?.backgroundColor === THEMES[name].bg,
    );
    expect(painted).toHaveLength(0);
  });

  it('centres the title and the subtitle', () => {
    renderWithTheme(<ScreenHeader title="Hilulot" subtitle="Coming soon" />);
    expect(screen.getByText('Hilulot')).toHaveStyle({ textAlign: 'center' });
    expect(screen.getByText('Coming soon')).toHaveStyle({ textAlign: 'center' });
  });

  it('marks the title as a header for screen readers', () => {
    renderWithTheme(<ScreenHeader title="Hilulot" />);
    expect(screen.getByRole('header', { name: 'Hilulot' })).toBeOnTheScreen();
  });

  it('puts the leading node above the title', () => {
    renderWithTheme(<ScreenHeader title="Hilulot" leading={<Text>Leading tile</Text>} />);
    const json = JSON.stringify(screen.toJSON());
    expect(json.indexOf('Leading tile')).toBeLessThan(json.indexOf('Hilulot'));
  });

  it('draws no back pill without onBack', () => {
    renderWithTheme(<ScreenHeader title="Hilulot" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('draws the back pill labelled common.back in Hebrew and fires onBack once', () => {
    const onBack = jest.fn();
    renderWithTheme(<ScreenHeader title="Hilulot" onBack={onBack} />);
    const back = screen.getByRole('button', { name: 'חזור' });
    expect(screen.getByText('חזור')).toBeOnTheScreen();
    fireEvent.press(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('labels the back pill in English when the language is English', () => {
    useUserStore.setState({ language: 'en' });
    renderWithTheme(<ScreenHeader title="Hilulot" onBack={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    expect(screen.getByText('Back')).toBeOnTheScreen();
  });

  it('points the back chevron right in Hebrew and left in English', () => {
    const { unmount } = renderWithTheme(<ScreenHeader title="Hilulot" onBack={jest.fn()} />);
    expect(screen.UNSAFE_getByType(Path).props.d).toBe('M9,6L15,12L9,18');
    unmount();
    useUserStore.setState({ language: 'en' });
    renderWithTheme(<ScreenHeader title="Hilulot" onBack={jest.fn()} />);
    expect(screen.UNSAFE_getByType(Path).props.d).toBe('M15,6L9,12L15,18');
  });

  it('paints the back pill on surface with the label in text and the chevron in textSub', () => {
    renderWithTheme(<ScreenHeader title="Hilulot" onBack={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'חזור' })).toHaveStyle({ backgroundColor: THEMES.gold.surface });
    expect(screen.getByText('חזור')).toHaveStyle({ color: THEMES.gold.text });
    expect(screen.UNSAFE_getByType(MitzvahIcon).props.color).toBe(THEMES.gold.textSub);
  });

  it('renders the actions slot and keeps its controls pressable', () => {
    const onShare = jest.fn();
    renderWithTheme(
      <ScreenHeader
        title="Hilulot"
        actions={<HeaderPill label="Share" accessibilityLabel="Share list" onPress={onShare} />}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Share list' }));
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('shows the actions next to the back pill when both are passed', () => {
    renderWithTheme(<ScreenHeader title="Hilulot" onBack={jest.fn()} actions={<Text>Slot content</Text>} />);
    expect(screen.getByText('Slot content')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'חזור' })).toBeOnTheScreen();
  });

  it('renders the leading node and the body children', () => {
    renderWithTheme(
      <ScreenHeader title="Hilulot" leading={<Text>Leading tile</Text>}>
        <Text>Body row</Text>
      </ScreenHeader>,
    );
    expect(screen.getByText('Leading tile')).toBeOnTheScreen();
    expect(screen.getByText('Body row')).toBeOnTheScreen();
  });
});

describe('HeaderPill', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('fires onPress once and is named by its accessibilityLabel', async () => {
    const onPress = jest.fn();
    renderWithTheme(<HeaderPill label="Today" accessibilityLabel="Go to today" onPress={onPress} />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Go to today' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is unselected by default, a surface pill with text', () => {
    renderWithTheme(<HeaderPill label="Today" onPress={jest.fn()} />);
    const pill = screen.getByRole('button', { name: 'Today' });
    expect(pill).not.toBeSelected();
    expect(pill).toHaveStyle({ backgroundColor: THEMES.gold.surface });
    expect(screen.getByText('Today')).toHaveStyle({ color: THEMES.gold.text });
  });

  it('is enabled by default', () => {
    renderWithTheme(<HeaderPill label="Today" onPress={jest.fn()} />);
    const pill = screen.getByRole('button', { name: 'Today' });
    expect(pill).toBeEnabled();
    expect(pill).toHaveStyle({ opacity: 1 });
  });

  it('disabled fades the pill, marks it disabled and swallows the press', () => {
    const onPress = jest.fn();
    renderWithTheme(<HeaderPill label="Next" disabled onPress={onPress} />);
    const pill = screen.getByRole('button', { name: 'Next' });
    expect(pill).toBeDisabled();
    expect(pill).toHaveStyle({ opacity: 0.5 });
    fireEvent.press(pill);
    expect(onPress).not.toHaveBeenCalled();
  });

  it.each(THEME_NAMES)('%s: selected turns the pill gold with onGold text', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(<HeaderPill label="Today" selected onPress={jest.fn()} />);
    const pill = screen.getByRole('button', { name: 'Today' });
    expect(pill).toBeSelected();
    expect(pill).toHaveStyle({ backgroundColor: THEMES[name].gold });
    expect(screen.getByText('Today')).toHaveStyle({ color: THEMES[name].onGold });
  });

  describe('with an icon', () => {
    it('draws the icon in text with no text, named by its accessibilityLabel, and fires onPress once', async () => {
      const onPress = jest.fn();
      renderWithTheme(<HeaderPill icon="chevronRight" accessibilityLabel="Previous week" onPress={onPress} />);
      const icon = screen.UNSAFE_getByType(MitzvahIcon);
      expect(icon.props.name).toBe('chevronRight');
      expect(icon.props.color).toBe(THEMES.gold.text);
      expect(screen.UNSAFE_getByType(Path).props.d).toBe('M9,6L15,12L9,18');
      expect(screen.queryByText(/./)).toBeNull();
      await userEvent.setup().press(screen.getByRole('button', { name: 'Previous week' }));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it.each(THEME_NAMES)('%s: selected turns the icon onGold on the gold pill', (name) => {
      useUserStore.setState({ theme: name });
      renderWithTheme(<HeaderPill icon="chevronLeft" accessibilityLabel="Next week" selected onPress={jest.fn()} />);
      const pill = screen.getByRole('button', { name: 'Next week' });
      expect(pill).toBeSelected();
      expect(pill).toHaveStyle({ backgroundColor: THEMES[name].gold });
      expect(screen.UNSAFE_getByType(MitzvahIcon).props.color).toBe(THEMES[name].onGold);
    });

    it('disabled fades the pill and swallows the press', () => {
      const onPress = jest.fn();
      renderWithTheme(<HeaderPill icon="chevronLeft" accessibilityLabel="Next week" disabled onPress={onPress} />);
      const pill = screen.getByRole('button', { name: 'Next week' });
      expect(pill).toBeDisabled();
      expect(pill).toHaveStyle({ opacity: 0.5 });
      fireEvent.press(pill);
      expect(onPress).not.toHaveBeenCalled();
    });

    it('draws the icon and the label together when both are given', () => {
      renderWithTheme(<HeaderPill icon="plus" label="Add" onPress={jest.fn()} />);
      expect(screen.UNSAFE_getByType(MitzvahIcon).props.name).toBe('plus');
      expect(screen.getByText('Add')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Add' })).toBeOnTheScreen();
    });

    it('draws no icon for a label-only pill', () => {
      renderWithTheme(<HeaderPill label="Today" onPress={jest.fn()} />);
      expect(screen.UNSAFE_queryByType(MitzvahIcon)).toBeNull();
    });
  });
});

describe('CounterPill', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it.each(THEME_NAMES)('%s: shows its label in goldText on a goldLight pill', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(<CounterPill label="6/9" />);
    expect(screen.getByText('6/9')).toHaveStyle({ color: THEMES[name].goldText });
    expect(hostParent(screen.getByText('6/9'))).toHaveStyle({
      backgroundColor: THEMES[name].goldLight,
      borderRadius: radius.full,
    });
  });

  it('is named by its accessibilityLabel when given and is not a button', () => {
    renderWithTheme(<CounterPill label="6/9" accessibilityLabel="6 of 9 done" />);
    expect(screen.getByLabelText('6 of 9 done')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
