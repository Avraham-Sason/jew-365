import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';

type Props<T extends string | number> = {
  values: readonly T[];
  selected: T | null;
  onSelect: (value: T) => void;
  renderLabel: (value: T) => string;
  style?: StyleProp<ViewStyle>;
};

export function ChipRow<T extends string | number>({ values, selected, onSelect, renderLabel, style }: Props<T>) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, style]}>
      {values.map((value) => {
        const active = selected === value;
        return (
          <Pressable
            key={value}
            onPress={() => onSelect(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            hitSlop={6}
            style={[styles.pill, { backgroundColor: active ? colors.gold : colors.surface2 }]}
          >
            <Text style={[typography.small, { color: active ? colors.onGold : colors.textSub }]}>
              {renderLabel(value)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
