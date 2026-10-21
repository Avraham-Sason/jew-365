import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { MitzvahIcon, type IconName } from '@/components/MitzvahIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'regular' | 'compact';
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const ICON_SIZE = 18;
const COMPACT_ICON_SIZE = 16;
const ICON_STROKE = 2.4;

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'regular',
  icon,
  disabled = false,
  busy = false,
  accessibilityLabel,
  style,
}: Props) {
  const { colors } = useTheme();
  const inactive = disabled || busy;
  const compact = size === 'compact';
  const fill = variant === 'primary' ? colors.gold : variant === 'danger' ? colors.urgentBg : colors.surface2;
  const ink = variant === 'primary' ? colors.onGold : variant === 'danger' ? colors.urgent : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        { backgroundColor: fill, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'danger' && { borderWidth: 1, borderColor: colors.urgent },
        style,
      ]}
    >
      {icon ? (
        <MitzvahIcon name={icon} size={compact ? COMPACT_ICON_SIZE : ICON_SIZE} color={ink} strokeWidth={ICON_STROKE} />
      ) : null}
      <Text
        numberOfLines={2}
        style={[compact ? typography.captionBold : typography.bodyBold, styles.label, { color: ink }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  compact: {
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  label: {
    flexShrink: 1,
    textAlign: 'center',
  },
});
