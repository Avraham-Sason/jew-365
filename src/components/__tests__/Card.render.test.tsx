import { StyleSheet, Text } from 'react-native';
import { screen } from '@testing-library/react-native';
import { Card } from '../Card';
import { renderWithTheme } from '@/testing/render';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { radius, spacing } from '@/theme/tokens';
import { useUserStore } from '@/stores/useUserStore';

type Node = ReturnType<typeof screen.getByRole>;

const hostParent = (node: Node): Node => {
  let current: Node | null = node.parent;
  while (current && typeof current.type !== 'string') current = current.parent;
  return current as Node;
};

const hostsWithHeight = (height: number): Node[] =>
  screen.UNSAFE_root.findAll(
    (node: Node) => typeof node.type === 'string' && StyleSheet.flatten(node.props.style)?.height === height,
  );

describe('Card', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('renders its children', () => {
    renderWithTheme(
      <Card>
        <Text>Body</Text>
      </Card>,
    );
    expect(screen.getByText('Body')).toBeOnTheScreen();
  });

  it.each(THEME_NAMES)('%s: paints surface on a radius-xl card with the soft shadow and no border', (name) => {
    useUserStore.setState({ theme: name });
    renderWithTheme(
      <Card>
        <Text>Body</Text>
      </Card>,
    );
    const outer = hostParent(hostParent(screen.getByText('Body')));
    expect(outer).toHaveStyle({
      backgroundColor: THEMES[name].surface,
      borderRadius: radius.xl,
      shadowColor: THEMES[name].shadow,
    });
    expect(StyleSheet.flatten(outer.props.style).borderWidth).toBeUndefined();
  });

  it('clips its content on an inner view of the same radius', () => {
    renderWithTheme(
      <Card>
        <Text>Body</Text>
      </Card>,
    );
    const inner = hostParent(screen.getByText('Body'));
    const outer = hostParent(inner);
    expect(inner).toHaveStyle({ borderRadius: radius.xl, overflow: 'hidden' });
    expect(StyleSheet.flatten(outer.props.style).overflow).toBeUndefined();
  });

  it('pads its content with padded', () => {
    const { rerender } = renderWithTheme(
      <Card padded>
        <Text>Body</Text>
      </Card>,
    );
    expect(hostParent(screen.getByText('Body'))).toHaveStyle({ padding: spacing.lg });
    rerender(
      <Card>
        <Text>Body</Text>
      </Card>,
    );
    expect(StyleSheet.flatten(hostParent(screen.getByText('Body')).props.style).padding).toBeUndefined();
  });

  it('divided draws one border hairline between consecutive children and none at the ends', () => {
    renderWithTheme(
      <Card divided>
        <Text>A</Text>
        {null}
        <Text>B</Text>
        <Text>C</Text>
      </Card>,
    );
    const dividers = hostsWithHeight(StyleSheet.hairlineWidth);
    expect(dividers).toHaveLength(2);
    dividers.forEach((divider) =>
      expect(divider).toHaveStyle({ backgroundColor: THEMES.gold.border, marginHorizontal: spacing.lg }),
    );
    ['A', 'B', 'C'].forEach((letter) => expect(screen.getByText(letter)).toBeOnTheScreen());
  });

  it('draws no divider without divided', () => {
    renderWithTheme(
      <Card>
        <Text>A</Text>
        {null}
        <Text>B</Text>
        <Text>C</Text>
      </Card>,
    );
    expect(hostsWithHeight(StyleSheet.hairlineWidth)).toHaveLength(0);
  });

  it('applies the caller style last', () => {
    renderWithTheme(
      <Card style={{ marginBottom: spacing.md, backgroundColor: THEMES.gold.urgentBg }}>
        <Text>Body</Text>
      </Card>,
    );
    const outer = hostParent(hostParent(screen.getByText('Body')));
    expect(outer).toHaveStyle({ marginBottom: spacing.md, backgroundColor: THEMES.gold.urgentBg });
  });
});
