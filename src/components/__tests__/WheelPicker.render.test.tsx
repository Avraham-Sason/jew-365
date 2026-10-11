import { Platform, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { WHEEL_ITEM_HEIGHT, WHEEL_VISIBLE_ROWS, WheelPicker } from '../WheelPicker';
import { renderWithTheme } from '@/testing/render';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { useUserStore } from '@/stores/useUserStore';

const VALUES = [5, 10, 15, 20, 25, 30, 35, 40];
const LABEL = 'Minutes';
const label = (value: number) => `${value}m`;

function renderWheel(selected: number, onChange = jest.fn()) {
  const view = renderWithTheme(
    <WheelPicker
      values={VALUES}
      selected={selected}
      onChange={onChange}
      renderLabel={label}
      accessibilityLabel={LABEL}
    />,
  );
  return { onChange, ...view };
}

const wheel = () => screen.getByLabelText(LABEL);
const scrollEvent = (y: number, velocityY?: number) => ({
  nativeEvent: { contentOffset: { x: 0, y }, ...(velocityY === undefined ? {} : { velocity: { x: 0, y: velocityY } }) },
});
const endMomentumAt = (y: number) => fireEvent(wheel(), 'momentumScrollEnd', scrollEvent(y));
const scrollToMock = () => screen.UNSAFE_getByType(ScrollView).instance.scrollTo as jest.Mock;
const accessibilityAction = (actionName: string) =>
  fireEvent(wheel(), 'accessibilityAction', { nativeEvent: { actionName } });

describe('WheelPicker', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('snaps every row and pads two rows at both ends so the first and last values can sit in the centre', () => {
    renderWheel(5);
    const { snapToInterval, contentContainerStyle } = screen.UNSAFE_getByType(ScrollView).props;
    expect(snapToInterval).toBe(40);
    expect(StyleSheet.flatten(contentContainerStyle)).toEqual({ paddingVertical: 80 });
    expect(WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS).toBe(200);
  });

  it('renders every value with its label, in order', () => {
    renderWheel(5);
    for (const value of VALUES) expect(screen.getByText(label(value))).toBeOnTheScreen();
    expect(screen.getAllByText(/^\d+m$/).map((row) => row.props.children)).toEqual(VALUES.map(label));
  });

  it('labels the values with String when no renderLabel is given', () => {
    renderWithTheme(<WheelPicker values={[3, 4]} selected={3} onChange={jest.fn()} accessibilityLabel={LABEL} />);
    expect(screen.getByText('3')).toBeOnTheScreen();
    expect(screen.getByText('4')).toBeOnTheScreen();
    expect(wheel()).toHaveAccessibilityValue({ text: '3' });
  });

  it('is an adjustable element named by its label and valued by the selected label', () => {
    renderWheel(20);
    expect(wheel().props.accessibilityRole).toBe('adjustable');
    expect(wheel()).toHaveAccessibilityValue({ text: '20m' });
    expect(wheel().props.accessibilityActions).toEqual([{ name: 'increment' }, { name: 'decrement' }]);
  });

  it('moves the accessibility value when the selected prop changes', () => {
    const { rerender } = renderWheel(20);
    rerender(
      <WheelPicker values={VALUES} selected={35} onChange={jest.fn()} renderLabel={label} accessibilityLabel={LABEL} />,
    );
    expect(wheel()).toHaveAccessibilityValue({ text: '35m' });
  });

  it.each(THEME_NAMES)(
    '%s: the selected row is heading text in text colour, the others body text in textMuted',
    (name) => {
      useUserStore.setState({ theme: name });
      const colors = THEMES[name];
      renderWheel(20);
      expect(screen.getByText('20m')).toHaveStyle({ color: colors.text, fontSize: typography.heading.fontSize });
      expect(screen.getByText('15m')).toHaveStyle({ color: colors.textMuted, fontSize: typography.body.fontSize });
      expect(screen.getByText('25m')).toHaveStyle({ color: colors.textMuted, fontSize: typography.body.fontSize });
    },
  );

  it('calls onChange once with the value under the centre when momentum ends at offset 3', () => {
    const { onChange } = renderWheel(5);
    endMomentumAt(3 * WHEEL_ITEM_HEIGHT);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(VALUES[3]);
  });

  it('does not call onChange when momentum ends on the selected value', () => {
    const { onChange } = renderWheel(20);
    endMomentumAt(3 * WHEEL_ITEM_HEIGHT);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    [0, 0],
    [0.4 * WHEEL_ITEM_HEIGHT, 0],
    [0.6 * WHEEL_ITEM_HEIGHT, 1],
    [2.49 * WHEEL_ITEM_HEIGHT, 2],
    [2.51 * WHEEL_ITEM_HEIGHT, 3],
    [7 * WHEEL_ITEM_HEIGHT, 7],
  ])('rounds the offset %d to the row at index %d', (offset, index) => {
    const { onChange } = renderWheel(VALUES[index] === 5 ? 40 : 5);
    endMomentumAt(offset);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(VALUES[index]);
  });

  it('clamps an offset past the last row to the last value', () => {
    const { onChange } = renderWheel(5);
    endMomentumAt(99 * WHEEL_ITEM_HEIGHT);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(VALUES[VALUES.length - 1]);
  });

  it('clamps a negative offset to the first value', () => {
    const { onChange } = renderWheel(40);
    endMomentumAt(-3 * WHEEL_ITEM_HEIGHT);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(VALUES[0]);
  });

  it('settles when a drag ends without velocity, because no momentum follows', () => {
    const { onChange } = renderWheel(5);
    fireEvent(wheel(), 'scrollEndDrag', scrollEvent(2 * WHEEL_ITEM_HEIGHT, 0));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(VALUES[2]);
  });

  it('waits for the momentum end when a drag ends with velocity', () => {
    const { onChange } = renderWheel(5);
    fireEvent(wheel(), 'scrollEndDrag', scrollEvent(2 * WHEEL_ITEM_HEIGHT, 1.5));
    fireEvent(wheel(), 'scrollEndDrag', scrollEvent(2 * WHEEL_ITEM_HEIGHT));
    expect(onChange).not.toHaveBeenCalled();
    endMomentumAt(5 * WHEEL_ITEM_HEIGHT);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(VALUES[5]);
  });

  it('increments by one value and scrolls there', () => {
    const { onChange } = renderWheel(15);
    scrollToMock().mockClear();
    accessibilityAction('increment');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(20);
    expect(scrollToMock()).toHaveBeenCalledWith({ y: 3 * WHEEL_ITEM_HEIGHT, animated: true });
  });

  it('decrements by one value', () => {
    const { onChange } = renderWheel(15);
    accessibilityAction('decrement');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('does not step past either end', () => {
    const first = renderWheel(5);
    accessibilityAction('decrement');
    expect(first.onChange).not.toHaveBeenCalled();
    first.unmount();
    const last = renderWheel(40);
    accessibilityAction('increment');
    expect(last.onChange).not.toHaveBeenCalled();
  });

  it('selects a row and scrolls to it when it is tapped', () => {
    const { onChange } = renderWheel(5);
    scrollToMock().mockClear();
    fireEvent.press(screen.getByText('30m'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(30);
    expect(scrollToMock()).toHaveBeenCalledWith({ y: 5 * WHEEL_ITEM_HEIGHT, animated: true });
  });

  it('reports the tapped row even when it is the selected one', () => {
    const { onChange } = renderWheel(30);
    fireEvent.press(screen.getByText('30m'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(30);
  });

  it('scrolls to the selected row without animation once the content has a size', () => {
    renderWheel(25);
    scrollToMock().mockClear();
    fireEvent(screen.UNSAFE_getByType(ScrollView), 'contentSizeChange', 320, 640);
    expect(scrollToMock()).toHaveBeenCalledTimes(1);
    expect(scrollToMock()).toHaveBeenCalledWith({ y: 4 * WHEEL_ITEM_HEIGHT, animated: false });
  });

  it('scrolls without animation when the selected prop changes from outside', () => {
    const { rerender } = renderWheel(5);
    scrollToMock().mockClear();
    rerender(
      <WheelPicker values={VALUES} selected={35} onChange={jest.fn()} renderLabel={label} accessibilityLabel={LABEL} />,
    );
    expect(scrollToMock()).toHaveBeenCalledTimes(1);
    expect(scrollToMock()).toHaveBeenCalledWith({ y: 6 * WHEEL_ITEM_HEIGHT, animated: false });
  });

  it('does not scroll again when the prop catches up with a scroll the user made', () => {
    const { rerender, onChange } = renderWheel(5);
    endMomentumAt(3 * WHEEL_ITEM_HEIGHT);
    scrollToMock().mockClear();
    rerender(
      <WheelPicker values={VALUES} selected={20} onChange={onChange} renderLabel={label} accessibilityLabel={LABEL} />,
    );
    expect(scrollToMock()).not.toHaveBeenCalled();
  });

  describe('on web', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.replaceProperty(Platform, 'OS', 'web');
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('settles 120 ms after the last scroll event and not before', () => {
      const { onChange } = renderWheel(5);
      fireEvent.scroll(wheel(), scrollEvent(2 * WHEEL_ITEM_HEIGHT));
      act(() => {
        jest.advanceTimersByTime(119);
      });
      expect(onChange).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(VALUES[2]);
    });

    it('restarts the wait on each scroll event and reports only the last position', () => {
      const { onChange } = renderWheel(5);
      fireEvent.scroll(wheel(), scrollEvent(1 * WHEEL_ITEM_HEIGHT));
      act(() => {
        jest.advanceTimersByTime(100);
      });
      fireEvent.scroll(wheel(), scrollEvent(3 * WHEEL_ITEM_HEIGHT));
      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(onChange).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(20);
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(VALUES[3]);
    });

    it('clamps an out-of-range offset to the last value', () => {
      const { onChange } = renderWheel(5);
      fireEvent.scroll(wheel(), scrollEvent(99 * WHEEL_ITEM_HEIGHT));
      act(() => {
        jest.advanceTimersByTime(120);
      });
      expect(onChange).toHaveBeenCalledWith(VALUES[VALUES.length - 1]);
    });

    it('snaps with CSS scroll snapping', () => {
      renderWheel(5);
      expect(StyleSheet.flatten(wheel().props.style)).toMatchObject({ scrollSnapType: 'y mandatory' });
    });

    it('cancels a pending settle when it unmounts', () => {
      const { onChange, unmount } = renderWheel(5);
      fireEvent.scroll(wheel(), scrollEvent(2 * WHEEL_ITEM_HEIGHT));
      unmount();
      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it('ignores scroll events off the web, where momentum events settle the value', () => {
    jest.useFakeTimers();
    try {
      const { onChange } = renderWheel(5);
      fireEvent.scroll(wheel(), scrollEvent(2 * WHEEL_ITEM_HEIGHT));
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
