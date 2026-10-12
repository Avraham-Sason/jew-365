import { screen, userEvent } from '@testing-library/react-native';
import { ScrollSpeedStepper } from '../ScrollSpeedStepper';
import { MitzvahIcon } from '../MitzvahIcon';
import he from '@/i18n/he.json';
import { renderWithTheme } from '@/testing/render';
import { THEMES } from '@/theme/colors';
import { SIDDUR_SCROLL_SPEEDS, useUserStore } from '@/stores/useUserStore';

const SLOWER = he['siddur.scrollSlower'];
const FASTER = he['siddur.scrollFaster'];
const MAX = SIDDUR_SCROLL_SPEEDS.length;

const iconNames = () => screen.UNSAFE_getAllByType(MitzvahIcon).map((icon) => icon.props.name);

describe('ScrollSpeedStepper', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('draws the steps as the minus and plus icons, never as text', () => {
    renderWithTheme(<ScrollSpeedStepper level={4} onChange={jest.fn()} tone="surface" />);
    expect(iconNames()).toEqual(['minus', 'plus']);
    expect(screen.queryByText('−')).toBeNull();
    expect(screen.queryByText('+')).toBeNull();
  });

  it('shows the level between the steps and names it with the speed', () => {
    renderWithTheme(<ScrollSpeedStepper level={4} onChange={jest.fn()} tone="surface" />);
    expect(screen.getByText('4')).toBeOnTheScreen();
    expect(screen.getByLabelText(`מהירות 4 מתוך ${MAX}`)).toBeOnTheScreen();
  });

  it('names the steps slower and faster', () => {
    renderWithTheme(<ScrollSpeedStepper level={4} onChange={jest.fn()} tone="surface" />);
    expect(screen.getByRole('button', { name: SLOWER })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: FASTER })).toBeOnTheScreen();
  });

  it('steps one level down and one level up', async () => {
    const onChange = jest.fn();
    renderWithTheme(<ScrollSpeedStepper level={4} onChange={onChange} tone="surface" />);
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: SLOWER }));
    await user.press(screen.getByRole('button', { name: FASTER }));
    expect(onChange.mock.calls).toEqual([[3], [5]]);
  });

  it('disables slower at level 1 and swallows the press', async () => {
    const onChange = jest.fn();
    renderWithTheme(<ScrollSpeedStepper level={1} onChange={onChange} tone="surface" />);
    const slower = screen.getByRole('button', { name: SLOWER });
    expect(slower).toBeDisabled();
    expect(screen.getByRole('button', { name: FASTER })).toBeEnabled();
    await userEvent.setup().press(slower);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables faster at the top level and swallows the press', async () => {
    const onChange = jest.fn();
    renderWithTheme(<ScrollSpeedStepper level={MAX} onChange={onChange} tone="surface" />);
    const faster = screen.getByRole('button', { name: FASTER });
    expect(faster).toBeDisabled();
    expect(screen.getByRole('button', { name: SLOWER })).toBeEnabled();
    await userEvent.setup().press(faster);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('draws the icons in the text colour on a settings card and in headerText on the header', () => {
    const { rerender } = renderWithTheme(<ScrollSpeedStepper level={4} onChange={jest.fn()} tone="surface" />);
    expect(screen.UNSAFE_getAllByType(MitzvahIcon).map((icon) => icon.props.color)).toEqual([
      THEMES.gold.text,
      THEMES.gold.text,
    ]);
    rerender(<ScrollSpeedStepper level={4} onChange={jest.fn()} tone="header" />);
    expect(screen.UNSAFE_getAllByType(MitzvahIcon).map((icon) => icon.props.color)).toEqual([
      THEMES.gold.headerText,
      THEMES.gold.headerText,
    ]);
  });
});
