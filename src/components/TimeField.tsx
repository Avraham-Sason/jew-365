import React, { useState } from 'react';
import { Keyboard, Pressable, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';
import { TIME_PATTERN } from '@/utils/clock';
import { BottomSheet } from './BottomSheet';
import { ChipRow } from './ChipRow';

export const PICKER_HOURS: readonly number[] = Array.from({ length: 24 }, (_, hour) => hour);
export const PICKER_MINUTES: readonly number[] = Array.from({ length: 12 }, (_, step) => step * 5);

const pad = (value: number) => String(value).padStart(2, '0');

export function normalizeTimeInput(raw: string): string {
  const [head, ...tail] = raw.replace(/[^\d:]/g, '').split(':');
  const joined =
    tail.length > 0 ? `${head}:${tail.join('')}` : head.length > 2 ? `${head.slice(0, 2)}:${head.slice(2)}` : head;
  return joined.slice(0, 5);
}

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  style?: StyleProp<ViewStyle>;
};

export function TimeField({ label, value, onChange, style }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [picking, setPicking] = useState(false);
  const valid = TIME_PATTERN.test(value);
  const hour = valid ? Number(value.slice(0, 2)) : null;
  const minute = valid ? Number(value.slice(3)) : null;
  const selectedMinute = minute !== null && minute % 5 === 0 ? minute : null;
  const sectionLabel = [typography.captionBold, styles.sectionLabel, { color: colors.textSub }];
  const openPicker = () => {
    Keyboard.dismiss();
    setPicking(true);
  };

  return (
    <View style={style}>
      <Text style={[typography.captionBold, styles.label, { color: colors.textSub }]}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={(raw) => onChange(normalizeTimeInput(raw))}
          accessibilityLabel={label}
          placeholder="HH:MM"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          style={[styles.input, { backgroundColor: colors.surface2, color: colors.text, borderColor: colors.border }]}
        />
        <Pressable
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel={t('custom.pickTime')}
          hitSlop={6}
          style={[styles.pickBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
        >
          <Text style={[typography.captionBold, { color: colors.textSub }]}>{t('custom.pickTime')}</Text>
        </Pressable>
      </View>
      <BottomSheet visible={picking} title={label} onClose={() => setPicking(false)}>
        <Text style={sectionLabel}>{t('custom.pickHour')}</Text>
        <ChipRow
          values={PICKER_HOURS}
          selected={hour}
          onSelect={(picked) => onChange(`${pad(picked)}:${pad(minute ?? 0)}`)}
          renderLabel={pad}
        />
        <Text style={[sectionLabel, styles.minuteLabel]}>{t('custom.pickMinute')}</Text>
        <ChipRow
          values={PICKER_MINUTES}
          selected={selectedMinute}
          onSelect={(picked) => onChange(`${pad(hour ?? 0)}:${pad(picked)}`)}
          renderLabel={pad}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  pickBtn: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    marginBottom: spacing.sm,
  },
  minuteLabel: {
    marginTop: spacing.lg,
  },
});
