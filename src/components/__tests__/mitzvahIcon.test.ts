import { createElement } from 'react';
import { render } from '@testing-library/react-native';
import { Circle, Line, Path, Rect } from 'react-native-svg';
import {
  ICON_NAMES,
  ICON_VARIANT,
  MitzvahIcon,
  backIcon,
  forwardIcon,
  iconFor,
  type IconName,
  type IconVariant,
} from '../MitzvahIcon';
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
    ['chevronDown', 'M6,9L12,15L18,9'],
    ['chevronUp', 'M6,15L12,9L18,15'],
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

  describe.each(['check', 'close', 'plus', 'minus', 'undo'] as const)('the %s stroke icon', (name) => {
    it.each(['outline', 'duotone'] as const)('is never filled in the %s variant', (variant) => {
      const drawn = render(createElement(MitzvahIcon, { name, color: '#111111', tint: '#eeeeee', variant }))
        .UNSAFE_getAllByType(Path)
        .map((path) => path.props.fill);
      expect(drawn.length).toBeGreaterThan(0);
      drawn.forEach((fill) => expect([undefined, 'none']).toContain(fill));
    });
  });

  describe.each([
    ['close', 'M6,6L18,18M18,6L6,18'],
    ['plus', 'M12,5V19M5,12H19'],
    ['minus', 'M5,12H19'],
  ] as const)('the %s icon', (name, d) => {
    it('draws its strokes as one path inside the 24-unit box', () => {
      const drawn = render(createElement(MitzvahIcon, { name, color: '#111111' })).UNSAFE_getAllByType(Path);
      expect(drawn.map((path) => path.props.d)).toEqual([d]);
    });
  });

  describe('the undo icon', () => {
    const paths = () =>
      render(createElement(MitzvahIcon, { name: 'undo', color: '#111111' })).UNSAFE_getAllByType(Path);

    it('is one open arc going counter-clockwise (sweep 0) and an arrowhead at its end', () => {
      const [arc, head] = paths().map((path) => path.props.d);
      expect(arc).toBe('M5,13A7,7 0 1 0 7.05,8.05');
      expect(head).toBe('M7.05,4.05V8.05H11.05');
    });
  });

  describe('the sun icon', () => {
    const drawing = (variant: IconVariant) =>
      render(createElement(MitzvahIcon, { name: 'sun', color: '#111111', tint: '#eeeeee', variant }));

    it('is one disc, unfilled in outline and tinted in duotone', () => {
      expect(
        drawing('outline')
          .UNSAFE_getAllByType(Circle)
          .map((disc) => disc.props.fill),
      ).toEqual(['none']);
      expect(
        drawing('duotone')
          .UNSAFE_getAllByType(Circle)
          .map((disc) => disc.props.fill),
      ).toEqual(['#eeeeee']);
    });

    it('carries eight rays, a separate move for each', () => {
      const [rays] = drawing('outline').UNSAFE_getAllByType(Path);
      expect(String(rays.props.d).match(/M/g)).toHaveLength(8);
    });

    it('is drawn apart from the mincha icon', () => {
      const mincha = render(createElement(MitzvahIcon, { name: 'mincha', color: '#111111' }));
      expect(mincha.UNSAFE_getAllByType(Circle)[0].props.r).not.toBe(
        drawing('outline').UNSAFE_getByType(Circle).props.r,
      );
    });
  });

  describe('the warning icon', () => {
    const drawing = (variant: IconVariant) =>
      render(createElement(MitzvahIcon, { name: 'warning', color: '#111111', tint: '#eeeeee', variant }));

    it('is a closed triangle, unfilled in outline and tinted in duotone', () => {
      const [triangle] = drawing('outline').UNSAFE_getAllByType(Path);
      expect(String(triangle.props.d).endsWith('Z')).toBe(true);
      expect(triangle.props.fill).toBe('none');
      expect(drawing('duotone').UNSAFE_getAllByType(Path)[0].props.fill).toBe('#eeeeee');
    });

    it('carries an exclamation mark: a stem and a dot', () => {
      expect(drawing('outline').UNSAFE_getAllByType(Line)).toHaveLength(2);
    });
  });

  describe('the star', () => {
    const paths = (name: IconName, variant: IconVariant) =>
      render(createElement(MitzvahIcon, { name, color: '#111111', tint: '#eeeeee', variant })).UNSAFE_getAllByType(
        Path,
      );

    it('is one five-point path under both names', () => {
      const star = paths('star', 'outline');
      expect(star).toHaveLength(1);
      expect(star[0].props.d).toBe(paths('custom', 'outline')[0].props.d);
    });

    it('is unfilled in outline and tinted in duotone', () => {
      expect(paths('star', 'outline').map((path) => path.props.fill)).toEqual(['none']);
      expect(paths('star', 'duotone').map((path) => path.props.fill)).toEqual(['#eeeeee']);
      expect(paths('custom', 'duotone').map((path) => path.props.fill)).toEqual(['#eeeeee']);
    });
  });

  describe('the cloud', () => {
    const paths = (variant: IconVariant) =>
      render(
        createElement(MitzvahIcon, { name: 'cloud', color: '#111111', tint: '#eeeeee', variant }),
      ).UNSAFE_getAllByType(Path);

    it('is one closed path, unfilled in outline and tinted in duotone', () => {
      const outline = paths('outline');
      expect(outline).toHaveLength(1);
      expect(String(outline[0].props.d).endsWith('Z')).toBe(true);
      expect(outline.map((path) => path.props.fill)).toEqual(['none']);
      expect(paths('duotone').map((path) => path.props.fill)).toEqual(['#eeeeee']);
    });
  });

  describe('the chat bubble', () => {
    const paths = (variant: IconVariant) =>
      render(
        createElement(MitzvahIcon, { name: 'chat', color: '#111111', tint: '#eeeeee', variant }),
      ).UNSAFE_getAllByType(Path);

    it('is a bubble and two text lines, only the bubble taking the tint', () => {
      expect(paths('outline').map((path) => path.props.fill)).toEqual(['none', undefined]);
      expect(paths('duotone').map((path) => path.props.fill)).toEqual(['#eeeeee', undefined]);
    });

    it('closes the bubble outline', () => {
      expect(String(paths('outline')[0].props.d).endsWith('Z')).toBe(true);
    });
  });

  describe('every icon', () => {
    it.each(ICON_NAMES)('%s draws something in both variants', (name) => {
      (['outline', 'duotone'] as const).forEach((variant) => {
        const tree = render(createElement(MitzvahIcon, { name, color: '#111111', tint: '#eeeeee', variant }));
        const shapes = [
          ...tree.UNSAFE_queryAllByType(Path),
          ...tree.UNSAFE_queryAllByType(Line),
          ...tree.UNSAFE_queryAllByType(Circle),
          ...tree.UNSAFE_queryAllByType(Rect),
        ];
        expect(shapes.length).toBeGreaterThan(0);
        tree.unmount();
      });
    });
  });

  describe('the direction helpers', () => {
    it('points back right in Hebrew and left in English', () => {
      expect(backIcon('he')).toBe('chevronRight');
      expect(backIcon('en')).toBe('chevronLeft');
    });

    it('points forward the opposite way to back in both languages', () => {
      expect(forwardIcon('he')).toBe('chevronLeft');
      expect(forwardIcon('en')).toBe('chevronRight');
    });
  });
});
