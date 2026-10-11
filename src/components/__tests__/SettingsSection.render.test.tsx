import { Text } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { SettingsSection } from '../SettingsSection';
import { renderWithTheme } from '@/testing/render';
import { THEMES } from '@/theme/colors';
import { useUserStore } from '@/stores/useUserStore';

describe('SettingsSection', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('draws a static card with its title and children and no button', () => {
    renderWithTheme(
      <SettingsSection title="Profile">
        <Text>Name field</Text>
      </SettingsSection>,
    );
    expect(screen.getByText('Profile')).toBeOnTheScreen();
    expect(screen.getByText('Name field')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps the children of a collapsible card out of the tree while collapsed', () => {
    renderWithTheme(
      <SettingsSection title="Profile" collapsible expanded={false} onToggle={jest.fn()}>
        <Text>Name field</Text>
      </SettingsSection>,
    );
    expect(screen.queryByText('Name field')).toBeNull();
    const header = screen.getByRole('button', { name: 'Profile' });
    expect(header).toBeCollapsed();
    expect(header.props.accessibilityState).toEqual({ expanded: false });
  });

  it('collapses by default when collapsible is set without expanded', () => {
    renderWithTheme(
      <SettingsSection title="Profile" collapsible onToggle={jest.fn()}>
        <Text>Name field</Text>
      </SettingsSection>,
    );
    expect(screen.queryByText('Name field')).toBeNull();
    expect(screen.getByRole('button', { name: 'Profile' })).toBeCollapsed();
  });

  it('calls onToggle once per press of the header', () => {
    const onToggle = jest.fn();
    renderWithTheme(
      <SettingsSection title="Profile" collapsible expanded={false} onToggle={onToggle}>
        <Text>Name field</Text>
      </SettingsSection>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Profile' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the children and the expanded state while expanded', () => {
    renderWithTheme(
      <SettingsSection title="Profile" collapsible expanded onToggle={jest.fn()}>
        <Text>Name field</Text>
      </SettingsSection>,
    );
    expect(screen.getByText('Name field')).toBeOnTheScreen();
    const header = screen.getByRole('button', { name: 'Profile' });
    expect(header).toBeExpanded();
    expect(header.props.accessibilityState).toEqual({ expanded: true });
  });

  it('follows the open and closed state through a rerender', () => {
    const { rerender } = renderWithTheme(
      <SettingsSection title="Profile" collapsible expanded={false} onToggle={jest.fn()}>
        <Text>Name field</Text>
      </SettingsSection>,
    );
    expect(screen.queryByText('Name field')).toBeNull();
    rerender(
      <SettingsSection title="Profile" collapsible expanded onToggle={jest.fn()}>
        <Text>Name field</Text>
      </SettingsSection>,
    );
    expect(screen.getByText('Name field')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Profile' })).toBeExpanded();
  });

  it('draws the title in the palette text colour', () => {
    useUserStore.setState({ theme: 'plum' });
    renderWithTheme(
      <SettingsSection title="Profile" collapsible expanded onToggle={jest.fn()}>
        <Text>Name field</Text>
      </SettingsSection>,
    );
    expect(screen.getByText('Profile')).toHaveStyle({ color: THEMES.plum.text });
  });
});
