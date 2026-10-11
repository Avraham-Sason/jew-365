import { createElement } from 'react';
import { render } from '@testing-library/react-native';
import { Path } from 'react-native-svg';
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

  describe('the prayers icon', () => {
    const drawn = (name: IconName, variant: IconVariant) =>
      render(createElement(MitzvahIcon, { name, color: '#111111', tint: '#eeeeee', variant }))
        .UNSAFE_getAllByType(Path)
        .map((path) => [path.props.d, path.props.fill]);

    it('draws the siddur book in both variants', () => {
      for (const variant of ['outline', 'duotone'] as const) {
        expect(drawn('prayers', variant)).toHaveLength(2);
        expect(drawn('prayers', variant)).toEqual(drawn('siddur', variant));
      }
    });
  });
});
