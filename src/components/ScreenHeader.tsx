import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';

export const HEADER_PILL_BG = 'rgba(255,255,255,0.12)';
export const HEADER_PILL_BG_PRESSED = 'rgba(255,255,255,0.22)';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
  children?: React.ReactNode;
};

export function ScreenHeader({ title, subtitle, onBack, actions, leading, children }: ScreenHeaderProps) {
  const { colors } = useTheme();
  const { language, t } = useI18n();

  return (
    <View style={[styles.wrap, { backgroundColor: colors.headerBg }]}>
      {onBack || actions ? (
        <View style={styles.topRow}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              hitSlop={10}
              style={({ pressed }) => [
                styles.backBtn,
                { backgroundColor: pressed ? HEADER_PILL_BG_PRESSED : HEADER_PILL_BG },
              ]}
            >
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path
                  d={language === 'he' ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'}
                  stroke={colors.headerText}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
              <Text style={[typography.captionBold, { color: colors.headerText }]}>{t('common.back')}</Text>
            </Pressable>
          ) : null}
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      ) : null}
      <View style={styles.titleRow}>
        {leading}
        <View style={styles.titleBlock}>
          <Text style={[typography.title, { color: colors.headerText }]} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text style={[typography.caption, { color: colors.headerSub }]}>{subtitle}</Text> : null}
        </View>
      </View>
      {children ? <View style={styles.extra}>{children}</View> : null}
    </View>
  );
}

type HeaderPillProps = {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  selected?: boolean;
  disabled?: boolean;
};

export function HeaderPill({
  label,
  onPress,
  accessibilityLabel,
  selected = false,
  disabled = false,
}: HeaderPillProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      hitSlop={8}
      style={[
        styles.pill,
        { backgroundColor: selected ? colors.headerAccent : HEADER_PILL_BG, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Text style={[typography.captionBold, { color: selected ? colors.headerBg : colors.headerText }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  actions: {
    marginStart: 'auto',
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  extra: {
    marginTop: spacing.md,
  },
  pill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
});
