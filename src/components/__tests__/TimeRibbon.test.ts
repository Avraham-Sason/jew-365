import { ribbonColors } from '../TimeRibbon';
import { THEMES, THEME_NAMES } from '@/theme/colors';

describe('TimeRibbon colours', () => {
  it.each(THEME_NAMES)('%s: the accent fill and the accent text while not urgent', (name) => {
    expect(ribbonColors(false, THEMES[name])).toEqual({ fill: THEMES[name].gold, text: THEMES[name].goldText });
  });

  it.each(THEME_NAMES)('%s: the urgent colour for both while urgent', (name) => {
    expect(ribbonColors(true, THEMES[name])).toEqual({ fill: THEMES[name].urgent, text: THEMES[name].urgent });
  });
});
