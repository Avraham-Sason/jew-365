import { screen } from '@testing-library/react-native';
import { IconTile } from '../IconTile';
import { MitzvahIcon } from '../MitzvahIcon';
import { renderWithTheme } from '@/testing/render';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { useUserStore } from '@/stores/useUserStore';

const tile = () => screen.UNSAFE_getByType(MitzvahIcon).parent!;
const icon = () => screen.UNSAFE_getByType(MitzvahIcon);

describe('IconTile', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('defaults to a 44-point tile, radius 18, with a 24-point icon', () => {
    renderWithTheme(<IconTile name="siddur" />);
    expect(tile()).toHaveStyle({ width: 44, height: 44, borderRadius: 18 });
    expect(icon().props.size).toBe(24);
  });

  it.each(THEME_NAMES)('%s: accent is gold on goldLight', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(<IconTile name="siddur" />);
    expect(tile()).toHaveStyle({ backgroundColor: THEMES[name].goldLight });
    expect(icon().props.color).toBe(THEMES[name].gold);
    expect(icon().props.tint).toBe(THEMES[name].goldLight);
  });

  it.each(['muted', 'done'] as const)('%s is textMuted on surface2', (tone) => {
    renderWithTheme(<IconTile name="siddur" tone={tone} />);
    expect(tile()).toHaveStyle({ backgroundColor: THEMES.gold.surface2 });
    expect(icon().props.color).toBe(THEMES.gold.textMuted);
    expect(icon().props.tint).toBe(THEMES.gold.surface2);
  });

  it('scales the radius and the icon with the size', () => {
    const { rerender } = renderWithTheme(<IconTile name="siddur" size={64} />);
    expect(tile()).toHaveStyle({ width: 64, height: 64, borderRadius: 26 });
    expect(icon().props.size).toBe(35);
    rerender(<IconTile name="siddur" size={40} />);
    expect(tile()).toHaveStyle({ width: 40, height: 40, borderRadius: 16 });
    expect(icon().props.size).toBe(22);
  });

  it('is hidden from accessibility', () => {
    renderWithTheme(<IconTile name="siddur" />);
    expect(tile().props.accessible).toBe(false);
  });
});
