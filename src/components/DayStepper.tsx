import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DateTime } from 'luxon';
import { MitzvahIcon, backIcon, forwardIcon } from '@/components/MitzvahIcon';
import { HebcalService } from '@/services/HebcalService';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { AppLanguage, useI18n } from '@/i18n';

type Props = {
  value: Date;
  onChange: (next: Date) => void;
  min?: Date;
  max?: Date;
};

export function formatDayLine(date: Date, language: AppLanguage): string {
  return DateTime.fromJSDate(date)
    .setLocale(language)
    .toFormat(language === 'he' ? 'cccc · d LLLL' : 'cccc · LLL d');
}

const ARROW_SIZE = 20;
const ARROW_STROKE = 2.4;

const stepDay = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export function DayStepper({ value, onChange, min, max }: Props) {
  const { colors } = useTheme();
  const { language } = useI18n();
  const prev = stepDay(value, -1);
  const next = stepDay(value, 1);
  const prevDisabled = min !== undefined && prev.getTime() < stepDay(min, 0).getTime();
  const nextDisabled = max !== undefined && next.getTime() > stepDay(max, 0).getTime();

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange(prev)}
        disabled={prevDisabled}
        accessibilityRole="button"
        accessibilityLabel={formatDayLine(prev, language)}
        style={[styles.arrow, { backgroundColor: colors.surface2, opacity: prevDisabled ? 0.35 : 1 }]}
      >
        <MitzvahIcon name={backIcon(language)} size={ARROW_SIZE} color={colors.text} strokeWidth={ARROW_STROKE} />
      </Pressable>
      <View style={styles.label}>
        <Text style={[typography.bodyBold, { color: colors.text }]}>{formatDayLine(value, language)}</Text>
        <Text style={[typography.caption, { color: colors.textSub }]}>
          {HebcalService.getHebrewDate(value).hebrewDateStr}
        </Text>
      </View>
      <Pressable
        onPress={() => onChange(next)}
        disabled={nextDisabled}
        accessibilityRole="button"
        accessibilityLabel={formatDayLine(next, language)}
        style={[styles.arrow, { backgroundColor: colors.surface2, opacity: nextDisabled ? 0.35 : 1 }]}
      >
        <MitzvahIcon name={forwardIcon(language)} size={ARROW_SIZE} color={colors.text} strokeWidth={ARROW_STROKE} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    alignItems: 'center',
  },
});
