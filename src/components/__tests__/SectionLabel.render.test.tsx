import { screen } from '@testing-library/react-native';
import { SectionLabel } from '../SectionLabel';
import { renderWithTheme } from '@/testing/render';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { useUserStore } from '@/stores/useUserStore';

describe('SectionLabel', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it.each(THEME_NAMES)('%s: a section label is heading type in text', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(<SectionLabel text="Now" />);
    expect(screen.getByText('Now')).toHaveStyle({
      color: THEMES[name].text,
      fontFamily: typography.heading.fontFamily,
      fontSize: typography.heading.fontSize,
    });
  });

  it('marks a section label as a header', () => {
    renderWithTheme(<SectionLabel text="Now" />);
    expect(screen.getByRole('header', { name: 'Now' })).toBeOnTheScreen();
  });

  it('appends the count in brackets', () => {
    renderWithTheme(<SectionLabel text="Done" count={6} />);
    expect(screen.getByText('Done (6)')).toBeOnTheScreen();
  });

  it('draws a field label as captionBold in textSub with no header role', () => {
    renderWithTheme(<SectionLabel text="Name" variant="field" />);
    expect(screen.getByText('Name')).toHaveStyle({
      color: THEMES.gold.textSub,
      fontFamily: typography.captionBold.fontFamily,
      fontSize: typography.captionBold.fontSize,
    });
    expect(screen.queryByRole('header')).toBeNull();
  });

  it('applies the caller style last', () => {
    renderWithTheme(<SectionLabel text="Now" style={{ color: THEMES.gold.goldText }} />);
    expect(screen.getByText('Now')).toHaveStyle({ color: THEMES.gold.goldText });
  });
});
