import { View } from 'react-native';
import { screen } from '@testing-library/react-native';
import Svg, { Path, Stop } from 'react-native-svg';
import { Landscape } from '../Landscape';
import { renderWithTheme } from '@/testing/render';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { useUserStore } from '@/stores/useUserStore';

describe('Landscape', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('fills the given height across the full width', () => {
    renderWithTheme(<Landscape height={300} />);
    expect(screen.UNSAFE_getByType(Svg).props).toMatchObject({
      width: '100%',
      height: 300,
      preserveAspectRatio: 'xMidYMax slice',
    });
  });

  it.each(THEME_NAMES)('%s: derives every colour from the palette', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(<Landscape height={300} />);
    const { bg, gold, goldLight, goldText } = THEMES[name];
    const allowed = [bg, gold, goldLight, goldText];
    const stops = screen.UNSAFE_getAllByType(Stop);
    stops.forEach((stop) => expect(allowed).toContain(stop.props.stopColor));
    screen.UNSAFE_getAllByType(Path).forEach((path) => expect(allowed).toContain(path.props.fill));
    const last = stops[stops.length - 1].props;
    expect(last.stopColor).toBe(bg);
    expect(last.stopOpacity).toBe(1);
  });

  it('draws three hills and one tree path', () => {
    renderWithTheme(<Landscape height={300} />);
    expect(screen.UNSAFE_getAllByType(Path)).toHaveLength(4);
  });

  it('is hidden from screen readers and lets touches through', () => {
    renderWithTheme(<Landscape height={300} />);
    const [root] = screen.UNSAFE_getAllByType(View);
    expect(root.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      pointerEvents: 'none',
    });
  });
});
