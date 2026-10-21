import { screen } from '@testing-library/react-native';
import { Circle } from 'react-native-svg';
import { StreakRing } from '../StreakRing';
import { renderWithTheme } from '@/testing/render';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { useUserStore } from '@/stores/useUserStore';

const circles = () => screen.UNSAFE_getAllByType(Circle);

describe('StreakRing', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    useUserStore.setState({ language: 'he' });
  });

  it('draws the streak, its label and an arc toward the next goal', () => {
    renderWithTheme(<StreakRing streak={15} />);
    expect(screen.getByText('15')).toBeOnTheScreen();
    expect(screen.getByText('ימים ברצף')).toBeOnTheScreen();
    expect(screen.getByLabelText('15 ימים ברצף')).toBeOnTheScreen();
    expect(circles()).toHaveLength(3);
    const arc = circles()[2].props;
    expect(arc.r).toBe(104);
    expect(arc.strokeWidth).toBe(12);
    expect(arc.strokeDashoffset).toBeCloseTo(2 * Math.PI * 104 * (1 - 15 / 30));
    expect(arc.transform).toBe('rotate(-90 110 110)');
  });

  it('draws no arc at zero days', () => {
    const { unmount } = renderWithTheme(<StreakRing streak={0} />);
    expect(circles()).toHaveLength(2);
    unmount();
    renderWithTheme(<StreakRing streak={7} />);
    expect(circles()).toHaveLength(3);
    expect(circles()[2].props.strokeDashoffset).toBeCloseTo(2 * Math.PI * 104 * (1 - 7 / 30));
  });

  it('says one day in the singular', () => {
    renderWithTheme(<StreakRing streak={1} />);
    expect(screen.getByText('יום ברצף')).toBeOnTheScreen();
    expect(screen.getByLabelText('יום אחד ברצף')).toBeOnTheScreen();
  });

  it.each(THEME_NAMES)('%s: takes every colour from the palette', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(<StreakRing streak={15} />);
    const [disc, track, arc] = circles();
    expect(disc.props.fill).toBe(THEMES[name].surface);
    expect(track.props.stroke).toBe(THEMES[name].surface2);
    expect(arc.props.stroke).toBe(THEMES[name].gold);
    expect(screen.getByText('15')).toHaveStyle({ color: THEMES[name].text, fontSize: 64 });
  });

  it('scales with size', () => {
    renderWithTheme(<StreakRing streak={15} size={110} />);
    expect(screen.getByText('15')).toHaveStyle({ fontSize: 32 });
    expect(circles()[1].props.strokeWidth).toBe(6);
  });
});
