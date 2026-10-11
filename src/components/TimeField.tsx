import React, { useState } from 'react';
import {
  I18nManager,
  Keyboard,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';
import { TIME_PATTERN } from '@/utils/clock';
import { BottomSheet } from './BottomSheet';
import { WheelPicker } from './WheelPicker';

export const PICKER_HOURS: readonly number[] = Array.from({ length: 24 }, (_, hour) => hour);
export const PICKER_MINUTES: readonly number[] = Array.from({ length: 60 }, (_, minute) => minute);

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
  const { t, language } = useI18n();
  const [picking, setPicking] = useState(false);
  const valid = TIME_PATTERN.test(value);
  const hour = valid ? Number(value.slice(0, 2)) : null;
  const minute = valid ? Number(value.slice(3)) : null;
  // react-native-web has no I18nManager.isRTL: its rows mirror through the document dir, which follows the language.
  const rowMirrored = Platform.OS === 'web' ? language === 'he' : I18nManager.isRTL;
  const openPicker = () => {
    Keyboard.dismiss();
    setPicking(true);
  };
  const hourWheel = (
    <WheelPicker
      key="hour"
      values={PICKER_HOURS}
      selected={hour ?? 0}
      onChange={(picked) => onChange(`${pad(picked)}:${pad(minute ?? 0)}`)}
      renderLabel={pad}
      accessibilityLabel={t('custom.pickHour')}
      style={styles.wheel}
    />
  );
  const colon = (
    <Text key="colon" style={[typography.heading, { color: colors.text }]}>
      :
    </Text>
  );
  const minuteWheel = (
    <WheelPicker
      key="minute"
      values={PICKER_MINUTES}
      selected={minute ?? 0}
      onChange={(picked) => onChange(`${pad(hour ?? 0)}:${pad(picked)}`)}
      renderLabel={pad}
      accessibilityLabel={t('custom.pickMinute')}
      style={styles.wheel}
    />
  );

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
        <View style={styles.wheels}>
          {rowMirrored ? [minuteWheel, colon, hourWheel] : [hourWheel, colon, minuteWheel]}
        </View>
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
  wheels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  wheel: {
    width: 96,
  },
});
