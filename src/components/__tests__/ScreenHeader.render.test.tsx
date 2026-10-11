import { Text } from 'react-native';
import { Path } from 'react-native-svg';
import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { HEADER_PILL_BG, HeaderPill, ScreenHeader } from '../ScreenHeader';
import { renderWithTheme } from '@/testing/render';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { useUserStore } from '@/stores/useUserStore';

describe('ScreenHeader', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('shows the title and the subtitle', () => {
    renderWithTheme(<ScreenHeader title="Hilulot" subtitle="Coming soon" />);
    expect(screen.getByText('Hilulot')).toBeOnTheScreen();
    expect(screen.getByText('Coming soon')).toBeOnTheScreen();
  });

  it.each(THEME_NAMES)('%s: the title reads headerText and the subtitle headerSub', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(<ScreenHeader title="Hilulot" subtitle="Coming soon" />);
    expect(screen.getByText('Hilulot')).toHaveStyle({ color: THEMES[name].headerText });
    expect(screen.getByText('Coming soon')).toHaveStyle({ color: THEMES[name].headerSub });
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
    expect(screen.UNSAFE_getByType(Path).props.d).toBe('M9 6l6 6-6 6');
    unmount();
    useUserStore.setState({ language: 'en' });
    renderWithTheme(<ScreenHeader title="Hilulot" onBack={jest.fn()} />);
    expect(screen.UNSAFE_getByType(Path).props.d).toBe('M15 6l-6 6 6 6');
  });

  it('paints the back pill on the translucent header white', () => {
    renderWithTheme(<ScreenHeader title="Hilulot" onBack={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'חזור' })).toHaveStyle({ backgroundColor: HEADER_PILL_BG });
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

  it('is unselected by default, on the translucent white with headerText', () => {
    renderWithTheme(<HeaderPill label="Today" onPress={jest.fn()} />);
    const pill = screen.getByRole('button', { name: 'Today' });
    expect(pill).not.toBeSelected();
    expect(pill).toHaveStyle({ backgroundColor: HEADER_PILL_BG });
    expect(screen.getByText('Today')).toHaveStyle({ color: THEMES.gold.headerText });
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

  it.each(THEME_NAMES)('%s: selected turns the pill headerAccent with headerBg text', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(<HeaderPill label="Today" selected onPress={jest.fn()} />);
    const pill = screen.getByRole('button', { name: 'Today' });
    expect(pill).toBeSelected();
    expect(pill).toHaveStyle({ backgroundColor: THEMES[name].headerAccent });
    expect(screen.getByText('Today')).toHaveStyle({ color: THEMES[name].headerBg });
  });
});
