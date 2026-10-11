import { fireEvent, screen } from '@testing-library/react-native';
import { SegmentedControl } from '../SegmentedControl';
import { renderWithTheme } from '@/testing/render';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { useUserStore } from '@/stores/useUserStore';

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

  it.each(THEME_NAMES)('%s: the surface tone fills the selected option with gold and onGold text', (name) => {
    useUserStore.setState({ theme: name });
    const colors = THEMES[name];
    renderWithTheme(<SegmentedControl options={OPTIONS} value="he" onChange={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'עברית' })).toHaveStyle({ backgroundColor: colors.gold });
    expect(screen.getByText('עברית')).toHaveStyle({ color: colors.onGold });
    expect(screen.getByRole('radio', { name: 'English' })).toHaveStyle({ backgroundColor: 'transparent' });
    expect(screen.getByText('English')).toHaveStyle({ color: colors.textMuted });
  });

  it.each(THEME_NAMES)('%s: the header tone fills the selected option with headerAccent', (name) => {
    useUserStore.setState({ theme: name });
    const colors = THEMES[name];
    renderWithTheme(<SegmentedControl options={OPTIONS} value="en" tone="header" onChange={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'English' })).toHaveStyle({ backgroundColor: colors.headerAccent });
    expect(screen.getByText('English')).toHaveStyle({ color: colors.headerBg });
    expect(screen.getByText('עברית')).toHaveStyle({ color: colors.headerSub });
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
