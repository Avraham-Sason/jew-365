import { Path } from 'react-native-svg';
import { screen, userEvent } from '@testing-library/react-native';
import { DayStepper, formatDayLine } from '../DayStepper';
import { MitzvahIcon } from '../MitzvahIcon';
import { renderWithTheme } from '@/testing/render';
import { THEMES } from '@/theme/colors';
import { useUserStore } from '@/stores/useUserStore';

const TODAY = new Date(2026, 9, 14);
const YESTERDAY = new Date(2026, 9, 13);
const TOMORROW = new Date(2026, 9, 15);

const RIGHT = 'M9,6L15,12L9,18';
const LEFT = 'M15,6L9,12L15,18';

const chevronsDrawn = () => screen.UNSAFE_getAllByType(Path).map((path) => path.props.d);

describe('DayStepper', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('shows the civil date line of the day', () => {
    renderWithTheme(<DayStepper value={TODAY} onChange={jest.fn()} />);
    expect(screen.getByText(formatDayLine(TODAY, 'he'))).toBeOnTheScreen();
  });

  it('draws the arrows as chevron icons in the text colour, never as text', () => {
    renderWithTheme(<DayStepper value={TODAY} onChange={jest.fn()} />);
    const icons = screen.UNSAFE_getAllByType(MitzvahIcon);
    expect(icons.map((icon) => icon.props.color)).toEqual([THEMES.gold.text, THEMES.gold.text]);
    expect(screen.queryByText(/[←→]/)).toBeNull();
  });

  it('points previous right and next left in Hebrew, the order the row mirrors to', () => {
    renderWithTheme(<DayStepper value={TODAY} onChange={jest.fn()} />);
    expect(chevronsDrawn()).toEqual([RIGHT, LEFT]);
  });

  it('points previous left and next right in English', () => {
    useUserStore.setState({ language: 'en' });
    renderWithTheme(<DayStepper value={TODAY} onChange={jest.fn()} />);
    expect(chevronsDrawn()).toEqual([LEFT, RIGHT]);
  });

  it('names each arrow after the day it steps to', () => {
    renderWithTheme(<DayStepper value={TODAY} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: formatDayLine(YESTERDAY, 'he') })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: formatDayLine(TOMORROW, 'he') })).toBeOnTheScreen();
  });

  it('steps one calendar day each way', async () => {
    const onChange = jest.fn();
    renderWithTheme(<DayStepper value={TODAY} onChange={onChange} />);
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: formatDayLine(YESTERDAY, 'he') }));
    await user.press(screen.getByRole('button', { name: formatDayLine(TOMORROW, 'he') }));
    expect(onChange.mock.calls.map(([date]) => (date as Date).getTime())).toEqual([
      YESTERDAY.getTime(),
      TOMORROW.getTime(),
    ]);
  });

  it('disables the step past min and past max and swallows the press', async () => {
    const onChange = jest.fn();
    renderWithTheme(<DayStepper value={TODAY} min={TODAY} max={TODAY} onChange={onChange} />);
    const user = userEvent.setup();
    const previous = screen.getByRole('button', { name: formatDayLine(YESTERDAY, 'he') });
    const next = screen.getByRole('button', { name: formatDayLine(TOMORROW, 'he') });
    expect(previous).toBeDisabled();
    expect(next).toBeDisabled();
    await user.press(previous);
    await user.press(next);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the other step open when only one side is at its limit', () => {
    renderWithTheme(<DayStepper value={TODAY} min={TODAY} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: formatDayLine(YESTERDAY, 'he') })).toBeDisabled();
    expect(screen.getByRole('button', { name: formatDayLine(TOMORROW, 'he') })).toBeEnabled();
  });
});
