import { fireEvent, screen } from '@testing-library/react-native';
import { ChipRow } from '../ChipRow';
import { renderWithTheme } from '@/testing/render';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { radius } from '@/theme/tokens';
import { useUserStore } from '@/stores/useUserStore';

const VALUES = [5, 10, 15] as const;
const label = (value: number) => `${value} min`;

describe('ChipRow', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('draws one button per value, named by its label', () => {
    renderWithTheme(<ChipRow values={VALUES} selected={10} onSelect={jest.fn()} renderLabel={label} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: '10 min' })).toBeOnTheScreen();
  });

  it('marks only the selected value as selected', () => {
    renderWithTheme(<ChipRow values={VALUES} selected={10} onSelect={jest.fn()} renderLabel={label} />);
    expect(screen.getByRole('button', { name: '10 min' })).toBeSelected();
    expect(screen.getByRole('button', { name: '5 min' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: '15 min' })).not.toBeSelected();
  });

  it.each(THEME_NAMES)('%s: the selected pill is gold with onGold text, the others surface2 with text', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(<ChipRow values={VALUES} selected={10} onSelect={jest.fn()} renderLabel={label} />);
    expect(screen.getByRole('button', { name: '10 min' })).toHaveStyle({ backgroundColor: THEMES[name].gold });
    expect(screen.getByText('10 min')).toHaveStyle({ color: THEMES[name].onGold });
    expect(screen.getByRole('button', { name: '5 min' })).toHaveStyle({ backgroundColor: THEMES[name].surface2 });
    expect(screen.getByText('5 min')).toHaveStyle({ color: THEMES[name].text });
  });

  it('calls onSelect once with the pressed value', () => {
    const onSelect = jest.fn();
    renderWithTheme(<ChipRow values={VALUES} selected={10} onSelect={onSelect} renderLabel={label} />);
    fireEvent.press(screen.getByRole('button', { name: '15 min' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(15);
  });

  it('selects nothing when selected is null', () => {
    renderWithTheme(<ChipRow values={VALUES} selected={null} onSelect={jest.fn()} renderLabel={label} />);
    screen.getAllByRole('button').forEach((button) => expect(button).not.toBeSelected());
  });

  it('draws fully rounded pills', () => {
    renderWithTheme(<ChipRow values={VALUES} selected={10} onSelect={jest.fn()} renderLabel={label} />);
    screen.getAllByRole('button').forEach((button) => expect(button).toHaveStyle({ borderRadius: radius.full }));
  });
});
