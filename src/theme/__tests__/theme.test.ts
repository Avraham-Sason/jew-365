import fs from 'fs';
import path from 'path';
import {
  BRAND,
  T_LIGHT,
  T_PINK,
  T_PURPLE,
  T_BLUE,
  T_DARK,
  T_PLUM,
  THEMES,
  THEME_NAMES,
  DARK_THEMES,
  isDarkTheme,
  paletteForGender,
  ThemeColors,
} from '../colors';
import { ribbonThresholds, durations, spacing, radius } from '../tokens';
import { APP_FONTS, fontFamilies, typography } from '../typography';
import he from '@/i18n/he.json';
import en from '@/i18n/en.json';

const COLOR = /^(#[0-9A-F]{6}|rgba\(.*\))$/i;

const READABLE_PAIRS: readonly (readonly [keyof ThemeColors, keyof ThemeColors, number])[] = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['textMuted', 'surface', 4.5],
  ['onGold', 'gold', 4.5],
  ['goldText', 'surface', 4.5],
  ['goldText', 'bg', 4.5],
  ['goldText', 'goldLight', 4.5],
  ['onUrgent', 'urgent', 4.5],
  ['headerText', 'headerBg', 4.5],
  ['headerAccent', 'headerBg', 4.5],
  ['textSub', 'surface', 4.0],
];

const linear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
  if (!/^#[0-9A-F]{6}$/i.test(hex)) throw new Error(`contrast needs a hex colour, got ${hex}`);
  const [r, g, b] = [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};

describe('Theme', () => {
  it('THEMES lists exactly the named palettes, in order', () => {
    expect(THEME_NAMES).toEqual(['gold', 'pink', 'purple', 'blue', 'dark', 'plum']);
    expect(Object.keys(THEMES)).toEqual([...THEME_NAMES]);
    expect(THEMES.gold).toBe(T_LIGHT);
    expect(THEMES.pink).toBe(T_PINK);
    expect(THEMES.purple).toBe(T_PURPLE);
    expect(THEMES.blue).toBe(T_BLUE);
    expect(THEMES.dark).toBe(T_DARK);
    expect(THEMES.plum).toBe(T_PLUM);
  });

  it('every palette has the same token set as gold', () => {
    const goldKeys = Object.keys(T_LIGHT).sort();
    for (const name of THEME_NAMES) {
      expect({ name, keys: Object.keys(THEMES[name]).sort() }).toEqual({ name, keys: goldKeys });
    }
  });

  it('every token is a colour string', () => {
    for (const name of THEME_NAMES) {
      const invalid = Object.entries(THEMES[name])
        .filter(([, value]) => typeof value !== 'string' || !COLOR.test(value))
        .map(([token]) => token);
      expect({ name, invalid }).toEqual({ name, invalid: [] });
    }
  });

  it('dark and plum are the dark palettes', () => {
    expect(DARK_THEMES).toEqual(['dark', 'plum']);
    expect(THEME_NAMES.filter((name) => isDarkTheme(name))).toEqual([...DARK_THEMES]);
    for (const name of ['gold', 'pink', 'purple', 'blue'] as const) expect(isDarkTheme(name)).toBe(false);
  });

  it.each([
    ['gold', 'male', 'gold'],
    ['gold', 'female', 'pink'],
    ['pink', 'male', 'gold'],
    ['pink', 'female', 'pink'],
    ['purple', 'male', 'gold'],
    ['purple', 'female', 'pink'],
    ['blue', 'male', 'gold'],
    ['blue', 'female', 'pink'],
    ['dark', 'male', 'dark'],
    ['dark', 'female', 'plum'],
    ['plum', 'male', 'dark'],
    ['plum', 'female', 'plum'],
  ] as const)('paletteForGender: %s palette with a %s answer gives %s', (current, gender, expected) => {
    expect(paletteForGender(gender, current)).toBe(expected);
  });

  it('paletteForGender keeps the light or dark class of every palette', () => {
    for (const name of THEME_NAMES) {
      for (const gender of ['male', 'female'] as const) {
        expect(isDarkTheme(paletteForGender(gender, name))).toBe(isDarkTheme(name));
      }
    }
  });

  it('the light palettes share white surfaces and the status colours', () => {
    for (const name of ['pink', 'purple', 'blue'] as const) {
      const palette = THEMES[name];
      expect({ name, surface: palette.surface, tabBg: palette.tabBg }).toEqual({
        name,
        surface: T_LIGHT.surface,
        tabBg: T_LIGHT.tabBg,
      });
      for (const token of ['urgent', 'onUrgent', 'urgentBg', 'urgentBorder', 'warning', 'safe'] as const) {
        expect({ name, token, value: palette[token] }).toEqual({ name, token, value: T_LIGHT[token] });
      }
    }
  });

  it('the palettes differ in background, accent and header', () => {
    for (const token of ['bg', 'gold', 'headerBg'] as const) {
      const values = THEME_NAMES.map((name) => THEMES[name][token]);
      expect({ token, distinct: new Set(values).size }).toEqual({ token, distinct: values.length });
    }
  });

  it('BRAND is the gold palette identity, independent of the active theme', () => {
    expect(BRAND).toEqual({ navy: T_LIGHT.text, gold: T_LIGHT.gold, parchment: T_LIGHT.bg, white: '#FFFFFF' });
  });

  it.each(THEME_NAMES)('text stays readable in the %s palette (WCAG contrast)', (name) => {
    const palette = THEMES[name];
    const failing = READABLE_PAIRS.map(([fg, bg, min]) => ({
      pair: `${fg}/${bg}`,
      ratio: contrast(palette[fg], palette[bg]),
      min,
    }))
      .filter(({ ratio, min }) => !(ratio >= min))
      .map(({ pair, ratio, min }) => `${pair} ${ratio.toFixed(2)} < ${min}`);
    expect(failing).toEqual([]);
  });

  it('every palette has a label in both dictionaries', () => {
    const tables: Record<string, Record<string, string>> = { he, en };
    for (const name of THEME_NAMES) {
      for (const [locale, table] of Object.entries(tables)) {
        const label = table[`settings.theme.${name}`];
        expect({ name, locale, label }).toEqual({ name, locale, label: expect.stringMatching(/\S/) });
      }
    }
  });

  it('8.3 ribbonThresholds are sane', () => {
    expect(ribbonThresholds.safe).toBeGreaterThan(ribbonThresholds.warning);
    expect(ribbonThresholds.safe).toBeLessThanOrEqual(1);
    expect(ribbonThresholds.warning).toBeGreaterThanOrEqual(0);
  });

  it('animation durations defined + ordered', () => {
    expect(durations.fast).toBeLessThan(durations.base);
    expect(durations.base).toBeLessThan(durations.slow);
    expect(durations.slow).toBeLessThan(durations.stamp);
  });

  it('spacing scale is monotonic', () => {
    const order = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'xxxl'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(spacing[order[i]]).toBeGreaterThan(spacing[order[i - 1]]);
    }
  });

  it('radius scale is monotonic', () => {
    const order = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'full'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(radius[order[i]]).toBeGreaterThan(radius[order[i - 1]]);
    }
  });
});

describe('Typography', () => {
  const sizes = (variant: keyof typeof typography) => typography[variant].fontSize!;
  const loaded: readonly string[] = APP_FONTS;

  it('font sizes rise from micro to display', () => {
    expect(sizes('micro')).toBeLessThan(sizes('small'));
    expect(sizes('small')).toBeLessThan(sizes('caption'));
    expect(sizes('caption')).toBeLessThan(sizes('body'));
    expect(sizes('body')).toBe(sizes('bodyBold'));
    expect(sizes('body')).toBe(sizes('subheading'));
    expect(sizes('subheading')).toBeLessThan(sizes('heading'));
    expect(sizes('heading')).toBeLessThan(sizes('title'));
    expect(sizes('title')).toBeLessThan(sizes('display'));
  });

  it('every line is taller than its font', () => {
    for (const [variant, style] of Object.entries(typography)) {
      expect({ variant, taller: style.lineHeight! > style.fontSize! }).toEqual({ variant, taller: true });
    }
  });

  it('every family the app styles with is a loaded font', () => {
    const families = [
      ...Object.values(typography).map((style) => style.fontFamily),
      ...Object.values(fontFamilies.heebo),
      ...Object.values(fontFamilies.siddur),
    ];
    expect(families.filter((family) => !loaded.includes(family as string))).toEqual([]);
  });

  it('the unused Heebo weights are not loaded', () => {
    expect(loaded).not.toContain('Heebo_300Light');
    expect(loaded).not.toContain('Heebo_500Medium');
  });

  it('the root layout loads exactly APP_FONTS', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', '_layout.tsx'), 'utf8');
    expect(APP_FONTS.filter((font) => !source.includes(font))).toEqual([]);
    expect(source).not.toContain('Heebo_300Light');
    expect(source).not.toContain('Heebo_500Medium');
  });
});
