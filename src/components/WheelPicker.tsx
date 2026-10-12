import React, { useEffect, useRef } from 'react';
import {
  AccessibilityActionEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { typography } from '@/theme/typography';

export const WHEEL_ITEM_HEIGHT = 40;
export const WHEEL_VISIBLE_ROWS = 5;

const EDGE_PADDING = ((WHEEL_VISIBLE_ROWS - 1) / 2) * WHEEL_ITEM_HEIGHT;
const WEB_SETTLE_MS = 120;
const ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

type Props = {
  values: readonly number[];
  selected: number;
  onChange: (value: number) => void;
  renderLabel?: (value: number) => string;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

export function WheelPicker({ values, selected, onChange, renderLabel = String, accessibilityLabel, style }: Props) {
  const { colors } = useTheme();
  const web = Platform.OS === 'web';
  const scrollRef = useRef<ScrollView>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selectedIndex = Math.max(0, values.indexOf(selected));
  const restingIndex = useRef(selectedIndex);

  const indexAt = (offsetY: number) =>
    Math.min(values.length - 1, Math.max(0, Math.round(offsetY / WHEEL_ITEM_HEIGHT)));
  const scrollToIndex = (index: number, animated: boolean) =>
    scrollRef.current?.scrollTo({ y: index * WHEEL_ITEM_HEIGHT, animated });
  const settle = (index: number) => {
    restingIndex.current = index;
    if (values[index] !== selected) onChange(values[index]);
  };
  const goTo = (index: number) => {
    restingIndex.current = index;
    scrollToIndex(index, true);
    onChange(values[index]);
  };
  const settleAt = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    settle(indexAt(event.nativeEvent.contentOffset.y));
  const settleWhenStill = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (event.nativeEvent.velocity?.y === 0) settleAt(event);
  };
  const settleOnWeb = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = indexAt(event.nativeEvent.contentOffset.y);
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => settle(index), WEB_SETTLE_MS);
  };
  const step = (event: AccessibilityActionEvent) => {
    const next = selectedIndex + (event.nativeEvent.actionName === 'increment' ? 1 : -1);
    if (next >= 0 && next < values.length) goTo(next);
  };

  useEffect(() => {
    if (restingIndex.current === selectedIndex) return;
    restingIndex.current = selectedIndex;
    scrollRef.current?.scrollTo({ y: selectedIndex * WHEEL_ITEM_HEIGHT, animated: false });
  }, [selectedIndex]);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  return (
    <View style={[styles.wheel, style]}>
      <View style={[styles.band, { backgroundColor: colors.surface2, borderColor: colors.border }]} />
      <ScrollView
        ref={scrollRef}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: renderLabel(selected) }}
        accessibilityActions={ACTIONS}
        onAccessibilityAction={step}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        nestedScrollEnabled
        scrollEventThrottle={16}
        onContentSizeChange={() => scrollToIndex(restingIndex.current, false)}
        onMomentumScrollEnd={settleAt}
        onScrollEndDrag={settleWhenStill}
        onScroll={web ? settleOnWeb : undefined}
        contentContainerStyle={styles.content}
        style={web ? webSnapTrack : undefined}
      >
        {values.map((value, index) => {
          const active = index === selectedIndex;
          return (
            <Pressable
              key={value}
              accessible={false}
              onPress={() => goTo(index)}
              style={[styles.row, web && webSnapRow]}
            >
              <Text
                style={[
                  active ? typography.heading : typography.body,
                  { color: active ? colors.text : colors.textMuted },
                ]}
              >
                {renderLabel(value)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const webSnapTrack = { scrollSnapType: 'y mandatory' } as ViewStyle;
const webSnapRow = { scrollSnapAlign: 'center' } as ViewStyle;

const styles = StyleSheet.create({
  wheel: {
    height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS,
  },
  band: {
    position: 'absolute',
    top: EDGE_PADDING,
    start: 0,
    end: 0,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  content: {
    paddingVertical: EDGE_PADDING,
  },
  row: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
