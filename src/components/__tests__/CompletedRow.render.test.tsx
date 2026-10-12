import { screen, userEvent } from '@testing-library/react-native';
import { CompletedRow } from '../CompletedRow';
import { MitzvahIcon } from '../MitzvahIcon';
import { renderWithTheme } from '@/testing/render';
import { THEMES } from '@/theme/colors';
import { useUserStore } from '@/stores/useUserStore';

const BASE = { name: 'תפילין', time: '07:42' };

const undoIcons = () => screen.UNSAFE_queryAllByType(MitzvahIcon).filter((icon) => icon.props.name === 'undo');

describe('CompletedRow', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('shows the name and the time it was done', () => {
    renderWithTheme(<CompletedRow {...BASE} />);
    expect(screen.getByText('תפילין')).toBeOnTheScreen();
    expect(screen.getByText('07:42')).toBeOnTheScreen();
  });

  it('draws no undo button without onUndo', () => {
    renderWithTheme(<CompletedRow {...BASE} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(undoIcons()).toHaveLength(0);
  });

  describe('with no undoLabel', () => {
    it('draws the undo icon in the accent text colour, never a text glyph', () => {
      renderWithTheme(<CompletedRow {...BASE} onUndo={jest.fn()} />);
      expect(undoIcons()).toHaveLength(1);
      expect(undoIcons()[0].props.color).toBe(THEMES.gold.goldText);
      expect(screen.queryByText(/↺/)).toBeNull();
    });

    it('names the button with the common undo word in Hebrew and fires onUndo once', async () => {
      const onUndo = jest.fn();
      renderWithTheme(<CompletedRow {...BASE} onUndo={onUndo} />);
      await userEvent.setup().press(screen.getByRole('button', { name: 'בטל' }));
      expect(onUndo).toHaveBeenCalledTimes(1);
    });

    it('names the button in English when the language is English', () => {
      useUserStore.setState({ language: 'en' });
      renderWithTheme(<CompletedRow name="Tefillin" time="07:42" onUndo={jest.fn()} />);
      expect(screen.getByRole('button', { name: 'Undo' })).toBeOnTheScreen();
    });
  });

  describe('with an undoLabel', () => {
    it('shows the label as text, names the button by it and draws no icon', async () => {
      const onUndo = jest.fn();
      renderWithTheme(<CompletedRow {...BASE} onUndo={onUndo} undoLabel="ביטול" />);
      expect(screen.getByText('ביטול')).toBeOnTheScreen();
      expect(undoIcons()).toHaveLength(0);
      await userEvent.setup().press(screen.getByRole('button', { name: 'ביטול' }));
      expect(onUndo).toHaveBeenCalledTimes(1);
    });
  });

  describe('row taps', () => {
    it('fires onPress once from a tap on the name', async () => {
      const onPress = jest.fn();
      renderWithTheme(<CompletedRow {...BASE} onPress={onPress} onUndo={jest.fn()} />);
      await userEvent.setup().press(screen.getByText('תפילין'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('presses undo without pressing the row', async () => {
      const onPress = jest.fn();
      const onUndo = jest.fn();
      renderWithTheme(<CompletedRow {...BASE} onPress={onPress} onUndo={onUndo} />);
      await userEvent.setup().press(screen.getByRole('button', { name: 'בטל' }));
      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(onPress).not.toHaveBeenCalled();
    });
  });
});
