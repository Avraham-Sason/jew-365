import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';
import { WEEKDAYS } from '@/utils/customMitzvah';

type Props = {
  selected: readonly number[];
  onToggle: (day: number) => void;
  style?: StyleProp<ViewStyle>;
};

export function WeekdayPicker({ selected, onToggle, style }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={[styles.row, style]}>
      {WEEKDAYS.map((day) => {
        const checked = selected.includes(day);
        const label = t(`weekday.short.${day}`);
        return (
          <Pressable
            key={day}
            onPress={() => onToggle(day)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={label}
            hitSlop={6}
            style={[styles.pill, { backgroundColor: checked ? colors.gold : colors.surface2 }]}
          >
            <Text style={[typography.captionBold, { color: checked ? colors.onGold : colors.textSub }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
});
