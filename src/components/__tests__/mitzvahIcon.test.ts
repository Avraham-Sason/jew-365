import { createElement } from 'react';
import { render } from '@testing-library/react-native';
import { Line, Path, Rect } from 'react-native-svg';
import { ICON_NAMES, ICON_VARIANT, MitzvahIcon, iconFor, type IconName, type IconVariant } from '../MitzvahIcon';
import { MITZVOT } from '@/data/mitzvot';
import { SIDDUR_GROUPS } from '@/data/siddur';

describe('MitzvahIcon', () => {
  it('lists every icon name once', () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it.each([...MITZVOT.map((m) => m.icon), 'custom'])('iconFor(%s) keeps a registered icon', (icon) => {
    expect(iconFor(icon)).toBe(icon);
  });

  it('falls back to the custom icon for an unknown name', () => {
    expect(iconFor('nonsense')).toBe('custom');
  });

  it.each(SIDDUR_GROUPS)('has an icon for the %s siddur group', (group) => {
    expect(ICON_NAMES).toContain(group);
  });

  it('uses a known variant', () => {
    expect(['outline', 'duotone']).toContain(ICON_VARIANT);
  });

  describe('the moon', () => {
    const pathsOf = (name: IconName, variant: IconVariant) =>
      render(createElement(MitzvahIcon, { name, color: '#111111', tint: '#eeeeee', variant })).UNSAFE_getAllByType(
        Path,
      );

    it('is one crescent path, unfilled in outline and tinted in duotone', () => {
      expect(pathsOf('moon', 'outline').map((path) => path.props.fill)).toEqual(['none']);
      expect(pathsOf('moon', 'duotone').map((path) => path.props.fill)).toEqual(['#eeeeee']);
    });

    it('is drawn apart from the night icon', () => {
      expect(pathsOf('moon', 'outline')[0].props.d).not.toBe(pathsOf('night', 'outline')[0].props.d);
    });
  });

  describe('the general icon', () => {
    const fills = (variant: IconVariant) =>
      render(createElement(MitzvahIcon, { name: 'general', color: '#111111', tint: '#eeeeee', variant }))
        .UNSAFE_getAllByType(Path)
        .map((path) => path.props.fill);

    it('draws three sparkles, unfilled in outline and tinted in duotone', () => {
      expect(fills('outline')).toEqual(['none', 'none', 'none']);
      expect(fills('duotone')).toEqual(['#eeeeee', '#eeeeee', '#eeeeee']);
    });

    it('replaces the retired prayers and blessings icon names', () => {
      expect(ICON_NAMES).not.toContain('prayers');
      expect(ICON_NAMES).not.toContain('blessings');
    });
  });

  describe('the calendar', () => {
    const drawing = (variant: IconVariant) =>
      render(createElement(MitzvahIcon, { name: 'calendar', color: '#111111', tint: '#eeeeee', variant }));

    it('is one page, unfilled in outline and tinted in duotone', () => {
      expect(
        drawing('outline')
          .UNSAFE_getAllByType(Rect)
          .map((rect) => rect.props.fill),
      ).toEqual(['none']);
      expect(
        drawing('duotone')
          .UNSAFE_getAllByType(Rect)
          .map((rect) => rect.props.fill),
      ).toEqual(['#eeeeee']);
    });

    it('carries two rings and a header line', () => {
      expect(drawing('outline').UNSAFE_getAllByType(Line)).toHaveLength(3);
    });
  });

  describe('the chok icon', () => {
    const drawing = (name: IconName, variant: IconVariant) =>
      render(createElement(MitzvahIcon, { name, color: '#111111', tint: '#eeeeee', variant }));
    const fills = (variant: IconVariant) =>
      drawing('chok', variant)
        .UNSAFE_getAllByType(Path)
        .map((path) => path.props.fill);

    it('is two pages, unfilled in outline and tinted in duotone', () => {
      expect(fills('outline')).toEqual(['none', 'none']);
      expect(fills('duotone')).toEqual(['#eeeeee', '#eeeeee']);
    });

    it('carries two text lines on each page', () => {
      expect(drawing('chok', 'outline').UNSAFE_getAllByType(Line)).toHaveLength(4);
    });

    it('is drawn apart from the siddur icon', () => {
      const pages = (name: IconName) => drawing(name, 'outline').UNSAFE_getAllByType(Path)[0].props.d;
      expect(pages('chok')).not.toBe(pages('siddur'));
    });
  });

  describe.each([
    ['chevronLeft', 'M15,6L9,12L15,18'],
    ['chevronRight', 'M9,6L15,12L9,18'],
  ] as const)('the %s icon', (name, d) => {
    const paths = (variant: IconVariant) =>
      render(createElement(MitzvahIcon, { name, color: '#111111', tint: '#eeeeee', variant })).UNSAFE_getAllByType(
        Path,
      );

    it.each(['outline', 'duotone'] as const)('draws one unfilled path in the %s variant', (variant) => {
      const drawn = paths(variant);
      expect(drawn.map((path) => path.props.d)).toEqual([d]);
      expect([undefined, 'none']).toContain(drawn[0].props.fill);
    });
  });
});
