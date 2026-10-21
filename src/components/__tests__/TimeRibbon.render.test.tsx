import { StyleSheet } from 'react-native';
import { screen } from '@testing-library/react-native';
import { TimeRibbon } from '../TimeRibbon';
import { renderWithTheme } from '@/testing/render';
import { THEMES } from '@/theme/colors';
import { radius } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useUserStore } from '@/stores/useUserStore';

type Node = ReturnType<typeof screen.getByRole>;

const fillOf = (width: string): Node =>
  screen.UNSAFE_root.find(
    (node: Node) => typeof node.type === 'string' && StyleSheet.flatten(node.props.style)?.width === width,
  );

const hostParent = (node: Node): Node => {
  let current: Node | null = node.parent;
  while (current && typeof current.type !== 'string') current = current.parent;
  return current as Node;
};

describe('TimeRibbon', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('shows the time left in goldText captionBold', () => {
    renderWithTheme(<TimeRibbon pct={0.8} timeLeft="2 שעות" />);
    expect(screen.getByText('נותר: 2 שעות')).toHaveStyle({
      color: THEMES.gold.goldText,
      fontFamily: typography.captionBold.fontFamily,
    });
  });

  it('fills pct of a 6-point fully rounded surface2 track in gold', () => {
    renderWithTheme(<TimeRibbon pct={0.8} timeLeft="2 שעות" />);
    const fill = fillOf('80%');
    expect(fill).toHaveStyle({ backgroundColor: THEMES.gold.gold });
    expect(hostParent(fill)).toHaveStyle({
      height: 6,
      borderRadius: radius.full,
      backgroundColor: THEMES.gold.surface2,
    });
  });

  it('turns the text and the fill urgent while urgent', () => {
    renderWithTheme(<TimeRibbon pct={0.2} timeLeft="20 דקות" urgent />);
    expect(screen.getByText('נותר: 20 דקות')).toHaveStyle({ color: THEMES.gold.urgent });
    expect(fillOf('20%')).toHaveStyle({ backgroundColor: THEMES.gold.urgent });
  });

  it('clamps pct to the track', () => {
    const { rerender } = renderWithTheme(<TimeRibbon pct={5} timeLeft="2 שעות" />);
    expect(fillOf('100%')).toBeTruthy();
    rerender(<TimeRibbon pct={-3} timeLeft="2 שעות" />);
    expect(fillOf('0%')).toBeTruthy();
  });
});
