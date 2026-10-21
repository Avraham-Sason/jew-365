import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { radius, spacing } from '@/theme/tokens';
import { useI18n } from '@/i18n';

type Props = {
  pct: number;
  timeLeft: string;
  urgent?: boolean;
};

export function ribbonColors(
  urgent: boolean,
  colors: Pick<ThemeColors, 'gold' | 'goldText' | 'urgent'>,
): { fill: string; text: string } {
  return urgent ? { fill: colors.urgent, text: colors.urgent } : { fill: colors.gold, text: colors.goldText };
}

export function TimeRibbon({ pct, timeLeft, urgent = false }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const p = Math.max(0, Math.min(1, pct));
  const { fill, text } = ribbonColors(urgent, colors);

  return (
    <View style={styles.wrap}>
      <Text style={[typography.captionBold, styles.label, { color: text }]}>{t('time.left', { value: timeLeft })}</Text>
      <View style={[styles.track, { backgroundColor: colors.surface2 }]}>
        <View style={[styles.fill, { width: `${p * 100}%`, backgroundColor: fill }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  label: { marginBottom: spacing.sm },
  track: { height: 6, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full },
});
