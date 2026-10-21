import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconName, MitzvahIcon, backIcon } from '@/components/MitzvahIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { shadowPresets, shadowStyle } from '@/theme/shadowStyle';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
  children?: React.ReactNode;
};

const BACK_ICON_SIZE = 14;
const BACK_ICON_STROKE = 2.5;

export function ScreenHeader({ title, subtitle, onBack, actions, leading, children }: ScreenHeaderProps) {
  const { colors } = useTheme();
  const { language, t } = useI18n();

  return (
    <View style={styles.wrap}>
      {onBack || actions ? (
        <View style={styles.topRow}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              hitSlop={10}
              style={({ pressed }) => [
                styles.pill,
                { backgroundColor: pressed ? colors.surface2 : colors.surface },
                shadowStyle(colors.shadow, shadowPresets.cardSoft),
              ]}
            >
              <MitzvahIcon
                name={backIcon(language)}
                size={BACK_ICON_SIZE}
                color={colors.textSub}
                strokeWidth={BACK_ICON_STROKE}
              />
              <Text style={[typography.captionBold, { color: colors.text }]}>{t('common.back')}</Text>
            </Pressable>
          ) : null}
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      ) : null}
      <View style={styles.titleBlock}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <Text
          accessibilityRole="header"
          style={[typography.title, styles.centered, { color: colors.text }]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typography.caption, styles.centered, styles.subtitle, { color: colors.textSub }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children ? <View style={styles.extra}>{children}</View> : null}
    </View>
  );
}

type HeaderPillProps = {
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
} & (
  | { label: string; icon?: IconName; accessibilityLabel?: string }
  | { label?: undefined; icon: IconName; accessibilityLabel: string }
);

const PILL_ICON_SIZE = 18;
const PILL_ICON_STROKE = 2.2;

export function HeaderPill({
  label,
  icon,
  onPress,
  accessibilityLabel,
  selected = false,
  disabled = false,
}: HeaderPillProps) {
  const { colors } = useTheme();
  const color = selected ? colors.onGold : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: selected ? colors.gold : pressed ? colors.surface2 : colors.surface,
          opacity: disabled ? 0.5 : 1,
        },
        shadowStyle(colors.shadow, shadowPresets.cardSoft),
      ]}
    >
      {icon ? <MitzvahIcon name={icon} size={PILL_ICON_SIZE} color={color} strokeWidth={PILL_ICON_STROKE} /> : null}
      {label ? <Text style={[typography.captionBold, { color }]}>{label}</Text> : null}
    </Pressable>
  );
}

type CounterPillProps = { label: string; accessibilityLabel?: string };

export function CounterPill({ label, accessibilityLabel }: CounterPillProps) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.counter, { backgroundColor: colors.goldLight }]}
    >
      <Text style={[typography.bodyBold, { color: colors.goldText }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  actions: {
    marginStart: 'auto',
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleBlock: {
    alignItems: 'center',
  },
  leading: {
    marginBottom: spacing.sm,
  },
  centered: {
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 2,
  },
  extra: {
    marginTop: spacing.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  counter: {
    minWidth: 48,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
