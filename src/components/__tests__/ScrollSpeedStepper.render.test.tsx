import { StyleSheet } from 'react-native';
import { screen, userEvent } from '@testing-library/react-native';
import { ScrollSpeedStepper } from '../ScrollSpeedStepper';
import { MitzvahIcon } from '../MitzvahIcon';
import he from '@/i18n/he.json';
import { renderWithTheme } from '@/testing/render';
import { THEMES } from '@/theme/colors';
import { radius } from '@/theme/tokens';
import { SIDDUR_SCROLL_SPEEDS, useUserStore } from '@/stores/useUserStore';

const SLOWER = he['siddur.scrollSlower'];
const FASTER = he['siddur.scrollFaster'];
const MAX = SIDDUR_SCROLL_SPEEDS.length;

type Node = ReturnType<typeof screen.getByRole>;

const hostParent = (node: Node): Node => {
  let current = node.parent;
  while (current && typeof current.type !== 'string') current = current.parent;
  return current!;
};

const iconNames = () => screen.UNSAFE_getAllByType(MitzvahIcon).map((icon) => icon.props.name);

describe('ScrollSpeedStepper', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('draws the steps as the minus and plus icons, never as text', () => {
    renderWithTheme(<ScrollSpeedStepper level={4} onChange={jest.fn()} />);
    expect(iconNames()).toEqual(['minus', 'plus']);
    expect(screen.queryByText('−')).toBeNull();
    expect(screen.queryByText('+')).toBeNull();
  });

  it('shows the level between the steps and names it with the speed', () => {
    renderWithTheme(<ScrollSpeedStepper level={4} onChange={jest.fn()} />);
    expect(screen.getByText('4')).toBeOnTheScreen();
    expect(screen.getByLabelText(`מהירות 4 מתוך ${MAX}`)).toBeOnTheScreen();
  });

  it('names the steps slower and faster', () => {
    renderWithTheme(<ScrollSpeedStepper level={4} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: SLOWER })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: FASTER })).toBeOnTheScreen();
  });

  it('steps one level down and one level up', async () => {
    const onChange = jest.fn();
    renderWithTheme(<ScrollSpeedStepper level={4} onChange={onChange} />);
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: SLOWER }));
    await user.press(screen.getByRole('button', { name: FASTER }));
    expect(onChange.mock.calls).toEqual([[3], [5]]);
  });

  it('disables slower at level 1 and swallows the press', async () => {
    const onChange = jest.fn();
    renderWithTheme(<ScrollSpeedStepper level={1} onChange={onChange} />);
    const slower = screen.getByRole('button', { name: SLOWER });
    expect(slower).toBeDisabled();
    expect(screen.getByRole('button', { name: FASTER })).toBeEnabled();
    await userEvent.setup().press(slower);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables faster at the top level and swallows the press', async () => {
    const onChange = jest.fn();
    renderWithTheme(<ScrollSpeedStepper level={MAX} onChange={onChange} />);
    const faster = screen.getByRole('button', { name: FASTER });
    expect(faster).toBeDisabled();
    expect(screen.getByRole('button', { name: SLOWER })).toBeEnabled();
    await userEvent.setup().press(faster);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('draws the icons and the level in the text colour', () => {
    renderWithTheme(<ScrollSpeedStepper level={4} onChange={jest.fn()} />);
    expect(screen.UNSAFE_getAllByType(MitzvahIcon).map((icon) => icon.props.color)).toEqual([
      THEMES.gold.text,
      THEMES.gold.text,
    ]);
    expect(screen.getByText('4')).toHaveStyle({ color: THEMES.gold.text });
  });

  it('sits on one borderless surface2 pill', () => {
    renderWithTheme(<ScrollSpeedStepper level={4} onChange={jest.fn()} />);
    const group = hostParent(screen.getByText('4'));
    expect(group).toHaveStyle({ backgroundColor: THEMES.gold.surface2, borderRadius: radius.full });
    expect(StyleSheet.flatten(group.props.style).borderWidth).toBeUndefined();
  });

  it('compact narrows the steps to 26 points and the level to 16', () => {
    renderWithTheme(<ScrollSpeedStepper level={4} onChange={jest.fn()} compact />);
    expect(screen.getByRole('button', { name: SLOWER })).toHaveStyle({ minWidth: 26 });
    expect(screen.getByText('4')).toHaveStyle({ minWidth: 16 });
  });
});
