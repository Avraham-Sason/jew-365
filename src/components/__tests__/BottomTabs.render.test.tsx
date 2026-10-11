import { fireEvent, screen } from '@testing-library/react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BottomTabs } from '../BottomTabs';
import { renderWithTheme } from '@/testing/render';
import { useUserStore } from '@/stores/useUserStore';

const ROUTE_NAMES = ['index', 'more', 'history', 'home', 'siddur', 'settings'];

function tabBarProps(focused: string) {
  const routes = ROUTE_NAMES.map((name) => ({ key: `${name}-key`, name }));
  const descriptors = Object.fromEntries(
    routes.map((route) => [route.key, { options: route.name === 'index' ? { href: null } : {} }]),
  );
  const navigation = { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() };
  const props = {
    state: { index: ROUTE_NAMES.indexOf(focused), routes },
    descriptors,
    navigation,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  } as unknown as BottomTabBarProps;
  return { props, navigation };
}

describe('BottomTabs', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('draws the five tabs in the registered order, More first and home third', () => {
    renderWithTheme(<BottomTabs {...tabBarProps('home').props} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    ['עוד', 'היסטוריה', 'בית', 'סידור', 'הגדרות'].forEach((name, index) => {
      expect(tabs[index]).toHaveAccessibleName(name);
    });
  });

  it('names the More tab in English and draws no schedule tab', () => {
    useUserStore.setState({ language: 'en' });
    renderWithTheme(<BottomTabs {...tabBarProps('home').props} />);
    expect(screen.getByRole('tab', { name: 'More' })).toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Schedule' })).toBeNull();
  });

  it('navigates to the more route when its tab is pressed', () => {
    const { props, navigation } = tabBarProps('home');
    renderWithTheme(<BottomTabs {...props} />);
    fireEvent.press(screen.getByRole('tab', { name: 'עוד' }));
    expect(navigation.navigate).toHaveBeenCalledWith('more');
  });

  it('marks only the focused tab as selected', () => {
    renderWithTheme(<BottomTabs {...tabBarProps('more').props} />);
    expect(screen.getByRole('tab', { name: 'עוד' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'בית' })).not.toBeSelected();
  });
});
