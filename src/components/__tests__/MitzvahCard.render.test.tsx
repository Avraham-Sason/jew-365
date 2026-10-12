import { Pressable, StyleSheet, View } from 'react-native';
import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { MitzvahCard } from '../MitzvahCard';
import { IconTile } from '../IconTile';
import { MitzvahIcon } from '../MitzvahIcon';
import { renderWithTheme } from '@/testing/render';
import { THEMES } from '@/theme/colors';
import { spacing } from '@/theme/tokens';
import { useUserStore } from '@/stores/useUserStore';

const BASE = { name: 'תפילין', timeLeft: '2 שעות', pct: 0.8 };
const BODY_NAME = 'תפילין, 2 שעות';
const CHECK_LABEL = 'סמן תפילין כהושלם';
const OPEN_TEXT_LABEL = 'פתח נוסח';
const BUTTON_STEP = 30 + spacing.md;

type Node = ReturnType<typeof screen.getByRole>;

function buttonsInsideButtons(): string[] {
  const buttons = screen.getAllByRole('button');
  return buttons
    .filter((button) => {
      for (let node: Node | null = button.parent; node; node = node.parent) {
        if (buttons.includes(node)) return true;
      }
      return false;
    })
    .map((button) => String(button.props.accessibilityLabel));
}

function cardOf(body: Node): Node {
  let current: Node | null = body.parent;
  while (current && !(typeof current.type === 'string' && StyleSheet.flatten(current.props.style)?.backgroundColor)) {
    current = current.parent;
  }
  return current as Node;
}

function hostsWith(prop: string): Node[] {
  return screen.UNSAFE_root.findAll((node: Node) => typeof node.type === 'string' && node.props[prop] !== undefined);
}

describe('MitzvahCard', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('names the card button by the mitzvah and the time left', () => {
    renderWithTheme(<MitzvahCard {...BASE} onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'תפילין, 2 שעות' })).toBeOnTheScreen();
    expect(screen.getByText('תפילין')).toBeOnTheScreen();
  });

  it('puts the status text into the accessible name between the name and the time left', () => {
    renderWithTheme(<MitzvahCard {...BASE} statusText="עד הנץ" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'תפילין, עד הנץ, 2 שעות' })).toBeOnTheScreen();
    expect(screen.getByText('עד הנץ')).toBeOnTheScreen();
  });

  it('draws its icon through an IconTile: the given name in the accent tone while open', () => {
    renderWithTheme(<MitzvahCard {...BASE} icon="tefillin" onPress={jest.fn()} />);
    const tile = screen.UNSAFE_getByType(IconTile);
    expect(tile.props.name).toBe('tefillin');
    expect(tile.props.tone).toBe('accent');
  });

  it('falls back to the custom icon when none is given', () => {
    renderWithTheme(<MitzvahCard {...BASE} onPress={jest.fn()} />);
    expect(screen.UNSAFE_getByType(IconTile).props.name).toBe('custom');
  });

  it('shows the time ribbon while open and hides it with hideProgress', () => {
    const { rerender } = renderWithTheme(<MitzvahCard {...BASE} onPress={jest.fn()} />);
    expect(screen.getByText('נותר: 2 שעות')).toBeOnTheScreen();
    rerender(<MitzvahCard {...BASE} hideProgress onPress={jest.fn()} />);
    expect(screen.queryByText('נותר: 2 שעות')).toBeNull();
  });

  describe('open card', () => {
    it('offers the check button named after the mitzvah and fires onComplete once', () => {
      const onComplete = jest.fn();
      renderWithTheme(<MitzvahCard {...BASE} onComplete={onComplete} />);
      fireEvent.press(screen.getByLabelText('סמן תפילין כהושלם'));
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('draws no check button without onComplete', () => {
      renderWithTheme(<MitzvahCard {...BASE} onPress={jest.fn()} />);
      expect(screen.queryByLabelText('סמן תפילין כהושלם')).toBeNull();
    });

    it('draws no check button when readOnly and says so', () => {
      renderWithTheme(<MitzvahCard {...BASE} readOnly onComplete={jest.fn()} onPress={jest.fn()} />);
      expect(screen.queryByLabelText('סמן תפילין כהושלם')).toBeNull();
      expect(screen.getByText('תצוגה בלבד')).toBeOnTheScreen();
    });

    it('warns when urgent and has no status text', () => {
      renderWithTheme(<MitzvahCard {...BASE} urgent onPress={jest.fn()} />);
      expect(screen.getByText('פג בקרוב')).toBeOnTheScreen();
      expect(screen.getByText('פג בקרוב')).toHaveStyle({ color: THEMES.gold.urgent });
    });

    it('draws the urgent warning with the warning icon in the urgent colour, never a text glyph', () => {
      renderWithTheme(<MitzvahCard {...BASE} urgent onPress={jest.fn()} />);
      const warnings = screen.UNSAFE_getAllByType(MitzvahIcon).filter((icon) => icon.props.name === 'warning');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].props.color).toBe(THEMES.gold.urgent);
      expect(screen.queryByText(/⚠/)).toBeNull();
    });

    it('names the card the same while urgent: the warning adds nothing to the accessible name', () => {
      renderWithTheme(<MitzvahCard {...BASE} urgent onPress={jest.fn()} />);
      expect(screen.getByRole('button', { name: BODY_NAME })).toBeOnTheScreen();
    });

    it('draws no warning icon on a card that is not urgent', () => {
      renderWithTheme(<MitzvahCard {...BASE} onPress={jest.fn()} />);
      expect(screen.UNSAFE_getAllByType(MitzvahIcon).filter((icon) => icon.props.name === 'warning')).toHaveLength(0);
    });

    it('lets the status text replace the urgent warning, in the tone it names', () => {
      renderWithTheme(<MitzvahCard {...BASE} urgent statusText="עד חצות" statusTone="safe" onPress={jest.fn()} />);
      expect(screen.queryByText('פג בקרוב')).toBeNull();
      expect(screen.UNSAFE_getAllByType(MitzvahIcon).filter((icon) => icon.props.name === 'warning')).toHaveLength(0);
      expect(screen.getByText('עד חצות')).toHaveStyle({ color: THEMES.gold.safe });
    });

    it('draws the check button with the urgent border while urgent', () => {
      renderWithTheme(<MitzvahCard {...BASE} urgent onComplete={jest.fn()} />);
      expect(screen.getByLabelText('סמן תפילין כהושלם')).toHaveStyle({
        borderColor: THEMES.gold.urgent,
      });
    });
  });

  describe('done card', () => {
    it('hides the check button, the status text and the ribbon, and says it is done', () => {
      renderWithTheme(<MitzvahCard {...BASE} done statusText="עד הנץ" onComplete={jest.fn()} onPress={jest.fn()} />);
      expect(screen.queryByLabelText('סמן תפילין כהושלם')).toBeNull();
      expect(screen.queryByText('עד הנץ')).toBeNull();
      expect(screen.queryByText('נותר: 2 שעות')).toBeNull();
      expect(screen.getByText('בוצע')).toBeOnTheScreen();
    });

    it('draws the completed line with the check icon in the safe colour, never a text glyph', () => {
      renderWithTheme(<MitzvahCard {...BASE} done onPress={jest.fn()} />);
      const checks = screen.UNSAFE_getAllByType(MitzvahIcon).filter((icon) => icon.props.name === 'check');
      expect(checks).toHaveLength(1);
      expect(checks[0].props.color).toBe(THEMES.gold.safe);
      expect(screen.getByText('בוצע')).toHaveStyle({ color: THEMES.gold.safe });
      expect(screen.queryByText(/✓/)).toBeNull();
    });

    it('draws no check icon on an open card', () => {
      renderWithTheme(<MitzvahCard {...BASE} onPress={jest.fn()} onComplete={jest.fn()} />);
      expect(screen.UNSAFE_getAllByType(MitzvahIcon).filter((icon) => icon.props.name === 'check')).toHaveLength(0);
    });

    it('exposes only the body as a button on a done card: no enabled check button', () => {
      renderWithTheme(<MitzvahCard {...BASE} done onComplete={jest.fn()} onPress={jest.fn()} />);
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('swaps the time left for the completed state in the accessible name', () => {
      renderWithTheme(<MitzvahCard {...BASE} done onPress={jest.fn()} />);
      expect(screen.getByRole('button', { name: 'תפילין, בוצע' })).toBeOnTheScreen();
    });

    it('draws the icon tile in the done tone and strikes the name through', () => {
      renderWithTheme(<MitzvahCard {...BASE} icon="shacharit" done onPress={jest.fn()} />);
      expect(screen.UNSAFE_getByType(IconTile).props.tone).toBe('done');
      expect(screen.getByText('תפילין')).toHaveStyle({ textDecorationLine: 'line-through' });
    });

    it('dims the card and paints it on the surface2 fill', () => {
      renderWithTheme(<MitzvahCard {...BASE} done onPress={jest.fn()} />);
      const card = cardOf(screen.getByRole('button', { name: 'תפילין, בוצע' }));
      expect(card).toHaveStyle({ opacity: 0.55, backgroundColor: THEMES.gold.surface2 });
    });

    it('keeps the done mark out of the way of a tap: it is not a touch target, so the body below takes it', () => {
      renderWithTheme(<MitzvahCard {...BASE} done onPress={jest.fn()} />);
      expect(hostsWith('pointerEvents').map((node) => node.props.pointerEvents)).toContain('none');
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });
  });

  describe('open-text button', () => {
    it('appears only when onOpenText is passed and fires it once', () => {
      const onOpenText = jest.fn();
      const { rerender } = renderWithTheme(<MitzvahCard {...BASE} onPress={jest.fn()} />);
      expect(screen.queryByLabelText('פתח נוסח')).toBeNull();
      rerender(<MitzvahCard {...BASE} onPress={jest.fn()} onOpenText={onOpenText} />);
      fireEvent.press(screen.getByLabelText('פתח נוסח'));
      expect(onOpenText).toHaveBeenCalledTimes(1);
    });

    it('stays on a done card', () => {
      renderWithTheme(<MitzvahCard {...BASE} done onOpenText={jest.fn()} />);
      expect(screen.getByLabelText('פתח נוסח')).toBeOnTheScreen();
    });
  });

  describe('card taps', () => {
    it('fires onPress once from a tap on the time ribbon: the body covers it', async () => {
      const onPress = jest.fn();
      renderWithTheme(<MitzvahCard {...BASE} onPress={onPress} />);
      await userEvent.setup().press(screen.getByText('נותר: 2 שעות'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('fires onPress once from a tap on the name', async () => {
      const onPress = jest.fn();
      renderWithTheme(<MitzvahCard {...BASE} onPress={onPress} />);
      await userEvent.setup().press(screen.getByText('תפילין'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('fires onPress once from the card', async () => {
      const onPress = jest.fn();
      renderWithTheme(<MitzvahCard {...BASE} onPress={onPress} />);
      await userEvent.setup().press(screen.getByRole('button', { name: 'תפילין, 2 שעות' }));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('fires onLongPress once from a long press on the card', async () => {
      const onLongPress = jest.fn();
      renderWithTheme(<MitzvahCard {...BASE} onPress={jest.fn()} onLongPress={onLongPress} />);
      await userEvent.setup().longPress(screen.getByRole('button', { name: 'תפילין, 2 שעות' }));
      expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    it('fires onLongPress from a real long press on the check button too, and does not complete', async () => {
      const onLongPress = jest.fn();
      const onComplete = jest.fn();
      renderWithTheme(<MitzvahCard {...BASE} onComplete={onComplete} onLongPress={onLongPress} />);
      // userEvent drives the nested Pressable's own responder; fireEvent would find the card's handler on an ancestor.
      await userEvent.setup().longPress(screen.getByLabelText('סמן תפילין כהושלם'));
      expect(onLongPress).toHaveBeenCalledTimes(1);
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe('long-press accessibility action', () => {
    it('exposes one longpress action labelled home.quick.title when onLongPress is passed', () => {
      renderWithTheme(<MitzvahCard {...BASE} onPress={jest.fn()} onLongPress={jest.fn()} />);
      expect(screen.getByRole('button', { name: 'תפילין, 2 שעות' }).props.accessibilityActions).toEqual([
        { name: 'longpress', label: 'פעולות מהירות' },
      ]);
    });

    it('calls onLongPress once when a screen reader invokes the action', () => {
      const onLongPress = jest.fn();
      renderWithTheme(<MitzvahCard {...BASE} onPress={jest.fn()} onLongPress={onLongPress} />);
      fireEvent(screen.getByRole('button', { name: 'תפילין, 2 שעות' }), 'accessibilityAction', {
        nativeEvent: { actionName: 'longpress' },
      });
      expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    it('exposes no action without onLongPress', () => {
      renderWithTheme(<MitzvahCard {...BASE} onPress={jest.fn()} />);
      expect(screen.getByRole('button', { name: 'תפילין, 2 שעות' }).props.accessibilityActions).toBeUndefined();
    });
  });

  describe('buttons are siblings, never nested', () => {
    it('reports a button inside a button, so the check below can fail', () => {
      renderWithTheme(
        <Pressable accessibilityRole="button" accessibilityLabel="outer">
          <View>
            <Pressable accessibilityRole="button" accessibilityLabel="inner" />
          </View>
        </Pressable>,
      );
      expect(buttonsInsideButtons()).toEqual(['inner']);
    });

    it.each([
      [
        'an open home card',
        { onPress: jest.fn(), onLongPress: jest.fn(), onComplete: jest.fn(), onOpenText: jest.fn() },
      ],
      ['a done card with a text', { done: true, onPress: jest.fn(), onOpenText: jest.fn() }],
      ['a check-in card', { onComplete: jest.fn() }],
      ['a read-only card', { readOnly: true, onPress: jest.fn(), onComplete: jest.fn() }],
      ['a stamping card', { stamping: true, onPress: jest.fn(), onComplete: jest.fn() }],
    ])('%s has no button inside another button', (_label, handlers) => {
      renderWithTheme(<MitzvahCard {...BASE} {...handlers} />);
      expect(buttonsInsideButtons()).toEqual([]);
    });

    it('lists the body, the open-text button and the check button as three separate buttons', () => {
      renderWithTheme(<MitzvahCard {...BASE} onPress={jest.fn()} onComplete={jest.fn()} onOpenText={jest.fn()} />);
      expect(screen.getAllByRole('button')).toHaveLength(3);
      expect(screen.getByRole('button', { name: BODY_NAME })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: OPEN_TEXT_LABEL })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: CHECK_LABEL })).toBeOnTheScreen();
    });

    it('presses the check button without pressing the body', async () => {
      const onPress = jest.fn();
      const onComplete = jest.fn();
      renderWithTheme(<MitzvahCard {...BASE} onPress={onPress} onComplete={onComplete} />);
      await userEvent.setup().press(screen.getByLabelText(CHECK_LABEL));
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onPress).not.toHaveBeenCalled();
    });

    it('presses the open-text button without pressing the body', async () => {
      const onPress = jest.fn();
      const onOpenText = jest.fn();
      renderWithTheme(<MitzvahCard {...BASE} onPress={onPress} onOpenText={onOpenText} />);
      await userEvent.setup().press(screen.getByLabelText(OPEN_TEXT_LABEL));
      expect(onOpenText).toHaveBeenCalledTimes(1);
      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('body button', () => {
    it('is disabled when nothing on the card responds', () => {
      renderWithTheme(<MitzvahCard {...BASE} />);
      expect(screen.getByRole('button', { name: BODY_NAME })).toBeDisabled();
    });

    it.each([
      ['onPress', { onPress: jest.fn() }],
      ['onLongPress', { onLongPress: jest.fn() }],
    ])('is enabled when only %s is passed', (_label, handlers) => {
      renderWithTheme(<MitzvahCard {...BASE} {...handlers} />);
      expect(screen.getByRole('button', { name: BODY_NAME })).toBeEnabled();
    });

    it('is disabled when only onComplete is passed, and the check button still works', async () => {
      const onComplete = jest.fn();
      renderWithTheme(<MitzvahCard {...BASE} onComplete={onComplete} />);
      expect(screen.getByRole('button', { name: BODY_NAME })).toBeDisabled();
      expect(screen.getByLabelText(CHECK_LABEL)).toBeEnabled();
      await userEvent.setup().press(screen.getByLabelText(CHECK_LABEL));
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('is disabled when only onOpenText is passed, and the open-text button still works', async () => {
      const onOpenText = jest.fn();
      renderWithTheme(<MitzvahCard {...BASE} onOpenText={onOpenText} />);
      expect(screen.getByRole('button', { name: BODY_NAME })).toBeDisabled();
      expect(screen.getByLabelText(OPEN_TEXT_LABEL)).toBeEnabled();
      await userEvent.setup().press(screen.getByLabelText(OPEN_TEXT_LABEL));
      expect(onOpenText).toHaveBeenCalledTimes(1);
    });

    it('is disabled for a read-only card that has only an onComplete, which offers no check button', () => {
      renderWithTheme(<MitzvahCard {...BASE} readOnly onComplete={jest.fn()} />);
      expect(screen.getByRole('button', { name: BODY_NAME })).toBeDisabled();
      expect(screen.queryByLabelText(CHECK_LABEL)).toBeNull();
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('lets a check-in card with no onPress and no onLongPress mark through its check button alone', async () => {
      const onComplete = jest.fn();
      renderWithTheme(
        <MitzvahCard name="תפילין" timeLeft="" pct={0} hideProgress statusText="ממתין" onComplete={onComplete} />,
      );
      expect(screen.getByRole('button', { name: 'תפילין, ממתין' })).toBeDisabled();
      await userEvent.setup().press(screen.getByLabelText(CHECK_LABEL));
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('layout', () => {
    it.each([
      ['no button', {}, 0],
      ['the open-text button', { onOpenText: jest.fn() }, BUTTON_STEP],
      ['the check button', { onComplete: jest.fn() }, BUTTON_STEP],
      ['both buttons', { onComplete: jest.fn(), onOpenText: jest.fn() }, 2 * BUTTON_STEP],
      ['the done mark', { done: true }, BUTTON_STEP],
      ['the done mark and the open-text button', { done: true, onOpenText: jest.fn() }, 2 * BUTTON_STEP],
    ])('reserves the end of the first row for %s', (_label, handlers, reserved) => {
      renderWithTheme(<MitzvahCard {...BASE} {...handlers} />);
      const [row] = hostsWith('onLayout');
      expect(StyleSheet.flatten(row.props.style).paddingEnd).toBe(reserved);
    });

    it('centres the buttons on the first row and follows it when the row grows', () => {
      renderWithTheme(<MitzvahCard {...BASE} onComplete={jest.fn()} />);
      const [row] = hostsWith('onLayout');
      const actions = () => hostsWith('pointerEvents').find((node) => node.props.pointerEvents === 'box-none');
      expect(StyleSheet.flatten(actions()?.props.style)).toMatchObject({
        height: 38,
        top: spacing.lg,
        end: spacing.lg,
      });
      fireEvent(row, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 52 } } });
      expect(StyleSheet.flatten(actions()?.props.style).height).toBe(52);
    });
  });

  it('shows the stamp only while stamping', () => {
    const { rerender } = renderWithTheme(<MitzvahCard {...BASE} onPress={jest.fn()} />);
    expect(screen.queryByText('נעשה!')).toBeNull();
    rerender(<MitzvahCard {...BASE} stamping onPress={jest.fn()} />);
    expect(screen.getByText('נעשה!')).toBeOnTheScreen();
  });

  it('speaks English when the language is English', () => {
    useUserStore.setState({ language: 'en' });
    renderWithTheme(<MitzvahCard name="Tefillin" timeLeft="2 hours" pct={0.8} onComplete={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Tefillin, 2 hours' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Mark Tefillin as done')).toBeOnTheScreen();
  });
});
