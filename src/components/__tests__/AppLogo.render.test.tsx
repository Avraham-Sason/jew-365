import { screen } from '@testing-library/react-native';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { AppLogo, type AppLogoVariant } from '../AppLogo';
import { LOGO_ASPECT, LOGO_SVG } from '../logo.generated';
import { renderWithTheme } from '@/testing/render';
import { useUserStore } from '@/stores/useUserStore';

const VARIANTS: AppLogoVariant[] = ['mark', 'icon', 'wordmark'];

const drawn = () => screen.UNSAFE_getByType(SvgXml).props;

const wrapper = () => screen.UNSAFE_getByType(View).props;

const aspectOf = (svg: string) => {
  const [, , width, height] = svg
    .match(/viewBox="([^"]+)"/)![1]
    .split(' ')
    .map(Number);
  return width / height;
};

describe('AppLogo', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('draws the mark at 32 points high when given no props', () => {
    renderWithTheme(<AppLogo />);
    expect(drawn().xml).toBe(LOGO_SVG.mark);
    expect(drawn().height).toBe(32);
    expect(drawn().width).toBe(Math.round(32 * LOGO_ASPECT.mark));
    expect(wrapper().style).toEqual({ width: Math.round(32 * LOGO_ASPECT.mark), height: 32 });
  });

  it.each(VARIANTS)('%s: draws its own generated art, sized by height with the width from its aspect', (variant) => {
    renderWithTheme(<AppLogo variant={variant} size={57} />);
    expect(drawn().xml).toBe(LOGO_SVG[variant]);
    expect(drawn().height).toBe(57);
    expect(drawn().width).toBe(Math.round(57 * LOGO_ASPECT[variant]));
    expect(wrapper().style).toEqual({ width: Math.round(57 * LOGO_ASPECT[variant]), height: 57 });
  });

  it.each(['dark', 'plum'] as const)('%s palette: the mark and the wordmark switch to their on-dark art', (theme) => {
    useUserStore.setState({ theme });
    renderWithTheme(<AppLogo variant="mark" />);
    expect(drawn().xml).toBe(LOGO_SVG.markOnDark);
    expect(LOGO_SVG.markOnDark).not.toBe(LOGO_SVG.mark);
    screen.unmount();
    renderWithTheme(<AppLogo variant="wordmark" />);
    expect(drawn().xml).toBe(LOGO_SVG.wordmarkOnDark);
    expect(LOGO_SVG.wordmarkOnDark).not.toBe(LOGO_SVG.wordmark);
  });

  it('the icon has no on-dark art: it keeps its art under a dark palette', () => {
    useUserStore.setState({ theme: 'dark' });
    renderWithTheme(<AppLogo variant="icon" />);
    expect(drawn().xml).toBe(LOGO_SVG.icon);
  });

  it('light palettes keep the light art', () => {
    useUserStore.setState({ theme: 'blue' });
    renderWithTheme(<AppLogo variant="wordmark" />);
    expect(drawn().xml).toBe(LOGO_SVG.wordmark);
  });

  it('is decorative: the wrapper hides it from screen readers and touches, the svg carries no accessibility props', () => {
    renderWithTheme(<AppLogo />);
    expect(wrapper()).toMatchObject({
      accessible: false,
      importantForAccessibility: 'no-hide-descendants',
      accessibilityElementsHidden: true,
      pointerEvents: 'none',
    });
    expect(Object.keys(drawn()).filter((prop) => /^(accessib|importantForAccessibility)/.test(prop))).toEqual([]);
  });

  it.each(Object.entries(LOGO_SVG))('%s: valid generated markup', (_name, svg) => {
    expect(svg).toMatch(/^<svg\b/);
    expect(svg).toMatch(/viewBox="[^"]+"/);
    expect(svg).not.toContain('<title');
    expect(svg).not.toContain(' class=');
    expect(svg).not.toContain(' style=');
  });

  it.each([
    ['mark', LOGO_SVG.mark],
    ['icon', LOGO_SVG.icon],
    ['wordmark', LOGO_SVG.wordmark],
  ] as const)('%s: LOGO_ASPECT is the width over the height of the viewBox', (variant, svg) => {
    expect(LOGO_ASPECT[variant]).toBeCloseTo(aspectOf(svg), 3);
  });
});
