import { fireEvent, screen } from '@testing-library/react-native';
import { WeekdayPicker } from '../WeekdayPicker';
import { renderWithTheme } from '@/testing/render';
import { t } from '@/i18n';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { useUserStore } from '@/stores/useUserStore';
import { WEEKDAYS } from '@/utils/customMitzvah';

const labelOf = (day: number) => t(`weekday.short.${day}`);

describe('WeekdayPicker', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('draws seven checkboxes from Sunday to Saturday', () => {
    renderWithTheme(<WeekdayPicker selected={[]} onToggle={jest.fn()} />);
    const pills = screen.getAllByRole('checkbox');
    expect(pills).toHaveLength(7);
    expect(pills.map((pill) => pill.props.accessibilityLabel)).toEqual(WEEKDAYS.map(labelOf));
  });

  it('checks exactly the selected days', () => {
    renderWithTheme(<WeekdayPicker selected={[0, 6]} onToggle={jest.fn()} />);
    for (const day of WEEKDAYS) {
      const pill = screen.getByRole('checkbox', { name: labelOf(day) });
      if (day === 0 || day === 6) expect(pill).toBeChecked();
      else expect(pill).not.toBeChecked();
    }
  });

  it('checks nothing for an empty selection', () => {
    renderWithTheme(<WeekdayPicker selected={[]} onToggle={jest.fn()} />);
    expect(screen.getAllByRole('checkbox').filter((pill) => pill.props.accessibilityState?.checked)).toHaveLength(0);
  });

  it('calls onToggle once with 3 when the Wednesday pill is pressed', () => {
    const onToggle = jest.fn();
    renderWithTheme(<WeekdayPicker selected={[0, 6]} onToggle={onToggle} />);
    fireEvent.press(screen.getByRole('checkbox', { name: labelOf(3) }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(3);
  });

  it.each(WEEKDAYS)('calls onToggle with %i for the pill at that weekday', (day) => {
    const onToggle = jest.fn();
    renderWithTheme(<WeekdayPicker selected={[0, 1, 2, 3, 4, 5, 6]} onToggle={onToggle} />);
    fireEvent.press(screen.getByRole('checkbox', { name: labelOf(day) }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(day);
  });

  it('moves the checked state when the selection prop changes', () => {
    const { rerender } = renderWithTheme(<WeekdayPicker selected={[1]} onToggle={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: labelOf(1) })).toBeChecked();
    rerender(<WeekdayPicker selected={[2]} onToggle={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: labelOf(2) })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: labelOf(1) })).not.toBeChecked();
  });

  it.each(THEME_NAMES)('%s: a checked pill fills with gold and onGold text, an unchecked one with surface2', (name) => {
    useUserStore.setState({ theme: name });
    const colors = THEMES[name];
    renderWithTheme(<WeekdayPicker selected={[4]} onToggle={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: labelOf(4) })).toHaveStyle({ backgroundColor: colors.gold });
    expect(screen.getByText(labelOf(4))).toHaveStyle({ color: colors.onGold });
    expect(screen.getByRole('checkbox', { name: labelOf(5) })).toHaveStyle({ backgroundColor: colors.surface2 });
    expect(screen.getByText(labelOf(5))).toHaveStyle({ color: colors.text });
  });
});
