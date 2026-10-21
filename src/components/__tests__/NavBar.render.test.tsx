import { StyleSheet, Text } from 'react-native';
import { screen } from '@testing-library/react-native';
import { NavBar } from '../NavBar';
import { AppLogo } from '../AppLogo';
import { renderWithTheme } from '@/testing/render';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { useUserStore } from '@/stores/useUserStore';

describe('NavBar', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('shows the title and the subtitle', () => {
    renderWithTheme(<NavBar title="Settings" subtitle="All options" />);
    expect(screen.getByText('Settings')).toBeOnTheScreen();
    expect(screen.getByText('All options')).toBeOnTheScreen();
  });

  it.each(THEME_NAMES)('%s: the title is display type in text and the subtitle caption in textSub', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(<NavBar title="Settings" subtitle="All options" />);
    expect(screen.getByText('Settings')).toHaveStyle({
      color: THEMES[name].text,
      fontFamily: typography.display.fontFamily,
      fontSize: typography.display.fontSize,
    });
    expect(screen.getByText('All options')).toHaveStyle({
      color: THEMES[name].textSub,
      fontSize: typography.caption.fontSize,
    });
  });

  it('marks the title as a header for screen readers', () => {
    renderWithTheme(<NavBar title="Settings" />);
    expect(screen.getByRole('header', { name: 'Settings' })).toBeOnTheScreen();
  });

  it('draws no logo', () => {
    renderWithTheme(<NavBar title="Settings" />);
    expect(screen.UNSAFE_queryByType(AppLogo)).toBeNull();
  });

  it.each(THEME_NAMES)('%s: draws no band: nothing in it paints bg', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(<NavBar title="Settings" subtitle="All options" actions={<Text>Act</Text>} />);
    const painted = screen.UNSAFE_root.findAll(
      (node: ReturnType<typeof screen.getByRole>) =>
        typeof node.type === 'string' && StyleSheet.flatten(node.props.style)?.backgroundColor === THEMES[name].bg,
    );
    expect(painted).toHaveLength(0);
  });

  it('renders leading before the title block and actions after it', () => {
    renderWithTheme(<NavBar title="Title" leading={<Text>Lead</Text>} actions={<Text>Act</Text>} />);
    const json = JSON.stringify(screen.toJSON());
    expect(json.indexOf('Lead')).toBeLessThan(json.indexOf('Title'));
    expect(json.indexOf('Title')).toBeLessThan(json.indexOf('Act'));
  });

  it('draws no subtitle line without a subtitle', () => {
    renderWithTheme(<NavBar title="Settings" />);
    expect(screen.getAllByText(/./)).toHaveLength(1);
  });
});
