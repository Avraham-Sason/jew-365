import { StyleSheet, Text } from 'react-native';
import { Path } from 'react-native-svg';
import { screen, userEvent } from '@testing-library/react-native';
import { ListRow } from '../ListRow';
import { IconTile } from '../IconTile';
import { MitzvahIcon } from '../MitzvahIcon';
import { renderWithTheme } from '@/testing/render';
import { THEMES } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { useUserStore } from '@/stores/useUserStore';

describe('ListRow', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('shows the title and the caption', () => {
    renderWithTheme(<ListRow icon="siddur" title="Birkat Hamazon" caption="After a meal" />);
    expect(screen.getByText('Birkat Hamazon')).toBeOnTheScreen();
    expect(screen.getByText('After a meal')).toBeOnTheScreen();
  });

  it('draws no caption line when the caption is omitted', () => {
    renderWithTheme(<ListRow icon="siddur" title="Birkat Hamazon" />);
    expect(screen.queryByText('After a meal')).toBeNull();
  });

  it('draws its icon through an IconTile named after the icon prop, accent by default', () => {
    renderWithTheme(<ListRow icon="candles" title="Candle lighting" />);
    const tile = screen.UNSAFE_getByType(IconTile);
    expect(tile.props.name).toBe('candles');
    expect(tile.props.tone).toBe('accent');
  });

  it('passes the muted icon tone to the tile and mutes the title', () => {
    renderWithTheme(<ListRow icon="candles" iconTone="muted" title="Candle lighting" />);
    expect(screen.UNSAFE_getByType(IconTile).props.tone).toBe('muted');
    expect(screen.getByText('Candle lighting')).toHaveStyle({ color: THEMES.gold.textMuted });
  });

  it('reads the title in the text colour for the accent tone', () => {
    renderWithTheme(<ListRow icon="candles" title="Candle lighting" />);
    expect(screen.getByText('Candle lighting')).toHaveStyle({ color: THEMES.gold.text });
  });

  it('is not a button without onPress', () => {
    renderWithTheme(<ListRow icon="siddur" title="Birkat Hamazon" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is a button with onPress, named by its accessibilityLabel, and fires once per tap', async () => {
    const onPress = jest.fn();
    renderWithTheme(
      <ListRow icon="siddur" title="Birkat Hamazon" accessibilityLabel="Open Birkat Hamazon" onPress={onPress} />,
    );
    await userEvent.setup().press(screen.getByRole('button', { name: 'Open Birkat Hamazon' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fires onLongPress once on a real long press and not onPress', async () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    renderWithTheme(<ListRow icon="siddur" title="Birkat Hamazon" onPress={onPress} onLongPress={onLongPress} />);
    await userEvent.setup().longPress(screen.getByText('Birkat Hamazon'));
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('stays a plain row with only onLongPress: no button role, and the long press still fires once', async () => {
    const onLongPress = jest.fn();
    renderWithTheme(<ListRow icon="siddur" title="Birkat Hamazon" onLongPress={onLongPress} />);
    expect(screen.queryByRole('button')).toBeNull();
    await userEvent.setup().longPress(screen.getByText('Birkat Hamazon'));
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('dims a disabled row to half opacity and swallows its taps', async () => {
    const onPress = jest.fn();
    renderWithTheme(<ListRow icon="siddur" title="Birkat Hamazon" disabled onPress={onPress} />);
    const row = screen.getByRole('button', { name: 'Birkat Hamazon' });
    expect(row).toBeDisabled();
    expect(row).toHaveStyle({ opacity: 0.5 });
    await userEvent.setup().press(row);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps an enabled row at full opacity', () => {
    renderWithTheme(<ListRow icon="siddur" title="Birkat Hamazon" onPress={jest.fn()} />);
    const row = screen.getByRole('button', { name: 'Birkat Hamazon' });
    expect(row).toBeEnabled();
    expect(row).toHaveStyle({ opacity: 1 });
  });

  it('draws no fill and no divider of its own', () => {
    renderWithTheme(<ListRow icon="siddur" title="Birkat Hamazon" onPress={jest.fn()} />);
    const row = screen.getByRole('button', { name: 'Birkat Hamazon' });
    const style = StyleSheet.flatten(row.props.style);
    expect(style.backgroundColor).toBeUndefined();
    expect(style.borderBottomWidth).toBeUndefined();
  });

  it('draws a default 44-point tile', () => {
    renderWithTheme(<ListRow icon="siddur" title="Birkat Hamazon" />);
    expect(screen.UNSAFE_getByType(IconTile).props.size).toBeUndefined();
    expect(screen.UNSAFE_getByType(MitzvahIcon).parent!).toHaveStyle({ width: 44 });
  });

  it('reads the caption in textSub caption type', () => {
    renderWithTheme(<ListRow icon="siddur" title="Birkat Hamazon" caption="After a meal" />);
    expect(screen.getByText('After a meal')).toHaveStyle({
      color: THEMES.gold.textSub,
      fontSize: typography.caption.fontSize,
    });
  });

  it('renders the trailing node after the title', () => {
    renderWithTheme(<ListRow icon="siddur" title="Birkat Hamazon" trailing={<Text>3 left</Text>} />);
    expect(screen.getByText('3 left')).toBeOnTheScreen();
  });

  describe('the forward chevron', () => {
    const chevrons = () =>
      screen
        .UNSAFE_getAllByType(Path)
        .map((path) => path.props.d)
        .filter((d) => d === 'M15,6L9,12L15,18' || d === 'M9,6L15,12L9,18');

    it('is drawn pointing left in Hebrew', () => {
      useUserStore.setState({ language: 'he' });
      renderWithTheme(<ListRow icon="siddur" title="Birkat Hamazon" chevron />);
      expect(chevrons()).toEqual(['M15,6L9,12L15,18']);
      expect(screen.queryByText('‹')).toBeNull();
      expect(screen.queryByText('›')).toBeNull();
    });

    it('is drawn pointing right in English', () => {
      useUserStore.setState({ language: 'en' });
      renderWithTheme(<ListRow icon="siddur" title="Birkat Hamazon" chevron />);
      expect(chevrons()).toEqual(['M9,6L15,12L9,18']);
      expect(screen.queryByText('‹')).toBeNull();
      expect(screen.queryByText('›')).toBeNull();
    });

    it('is left out when both trailing and chevron are given', () => {
      renderWithTheme(<ListRow icon="siddur" title="Birkat Hamazon" trailing={<Text>3 left</Text>} chevron />);
      expect(screen.getByText('3 left')).toBeOnTheScreen();
      expect(chevrons()).toEqual([]);
      expect(screen.queryByText('‹')).toBeNull();
      expect(screen.queryByText('›')).toBeNull();
    });
  });
});
