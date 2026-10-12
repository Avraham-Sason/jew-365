import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';

type Props<T extends string> = {
  options: readonly { value: T; label: string; accessibilityLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
  tone?: 'header' | 'surface';
  style?: StyleProp<ViewStyle>;
};

export function SegmentedControl<T extends string>({ options, value, onChange, tone = 'surface', style }: Props<T>) {
  const { colors } = useTheme();
  const onHeader = tone === 'header';
  return (
    <View style={[styles.track, { backgroundColor: onHeader ? 'rgba(255,255,255,0.08)' : colors.surface2 }, style]}>
      {options.map((option) => {
        const selected = option.value === value;
        const fill = onHeader ? colors.headerAccent : colors.gold;
        const selectedText = onHeader ? colors.headerBg : colors.onGold;
        const idleText = onHeader ? colors.headerSub : colors.textMuted;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel}
            accessibilityState={{ selected, checked: selected }}
            aria-checked={selected}
            hitSlop={6}
            style={[styles.option, { backgroundColor: selected ? fill : 'transparent' }]}
          >
            <Text style={[typography.captionBold, { color: selected ? selectedText : idleText }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 3,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
  },
});
