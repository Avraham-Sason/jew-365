import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { IconTile } from '@/components/IconTile';
import { MitzvahIcon, forwardIcon, type IconName } from '@/components/MitzvahIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';

type Props = {
  icon: IconName;
  iconTone?: 'accent' | 'muted';
  title: string;
  caption?: string;
  trailing?: React.ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function ListRow({
  icon,
  iconTone = 'accent',
  title,
  caption,
  trailing,
  chevron = false,
  onPress,
  onLongPress,
  disabled = false,
  accessibilityLabel,
  style,
}: Props) {
  const { colors } = useTheme();
  const { language } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      android_ripple={onPress ? { color: colors.border } : undefined}
      style={[
        styles.row,
        { backgroundColor: colors.surface, borderBottomColor: colors.border, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      <IconTile name={icon} tone={iconTone} />
      <View style={styles.meta}>
        <Text style={[typography.bodyBold, { color: iconTone === 'muted' ? colors.textMuted : colors.text }]}>
          {title}
        </Text>
        {caption ? (
          <Text style={[typography.small, styles.caption, { color: colors.textMuted }]}>{caption}</Text>
        ) : null}
      </View>
      {trailing ??
        (chevron ? (
          <MitzvahIcon name={forwardIcon(language)} size={16} color={colors.textMuted} strokeWidth={2.5} />
        ) : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  caption: {
    marginTop: 2,
  },
});
