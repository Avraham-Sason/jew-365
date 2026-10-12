import React, { useEffect, useState } from 'react';
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

const PLACEHOLDER = 'HH:MM';

const pad = (value: number) => String(value).padStart(2, '0');

export function normalizeTimeInput(raw: string): string {
  const [head, ...tail] = raw.replace(/[^\d:]/g, '').split(':');
  const joined =
    tail.length > 0 ? `${head}:${tail.join('')}` : head.length > 2 ? `${head.slice(0, 2)}:${head.slice(2)}` : head;
  return joined.slice(0, 5);
}

type PickerProps = {
  value: string;
  onChange: (value: string) => void;
};

type Props = PickerProps & {
  label: string;
  style?: StyleProp<ViewStyle>;
  inline?: boolean;
};

function TimePicker({ value, onChange }: PickerProps) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const [draft, setDraft] = useState(value);
  const valid = TIME_PATTERN.test(value);
  const hour = valid ? Number(value.slice(0, 2)) : null;
  const minute = valid ? Number(value.slice(3)) : null;
  // react-native-web has no I18nManager.isRTL: its rows mirror through the document dir, which follows the language.
  const rowMirrored = Platform.OS === 'web' ? language === 'he' : I18nManager.isRTL;

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const pick = (next: string) => {
    setDraft(next);
    onChange(next);
  };
  const type = (raw: string) => {
    const next = normalizeTimeInput(raw);
    setDraft(next);
    if (TIME_PATTERN.test(next)) onChange(next);
  };
  const hourWheel = (
    <WheelPicker
      key="hour"
      values={PICKER_HOURS}
      selected={hour ?? 0}
      onChange={(picked) => pick(`${pad(picked)}:${pad(minute ?? 0)}`)}
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
      onChange={(picked) => pick(`${pad(hour ?? 0)}:${pad(picked)}`)}
      renderLabel={pad}
      accessibilityLabel={t('custom.pickMinute')}
      style={styles.wheel}
    />
  );

  return (
    <>
      <Text style={[typography.captionBold, styles.typeLabel, { color: colors.textSub }]}>{t('custom.typeTime')}</Text>
      <TextInput
        value={draft}
        onChangeText={type}
        accessibilityLabel={t('custom.typeTime')}
        placeholder={PLACEHOLDER}
        placeholderTextColor={colors.textMuted}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        style={[
          styles.box,
          styles.valueText,
          { backgroundColor: colors.surface2, color: colors.text, borderColor: colors.border },
        ]}
      />
      <View style={styles.wheels}>
        {rowMirrored ? [minuteWheel, colon, hourWheel] : [hourWheel, colon, minuteWheel]}
      </View>
    </>
  );
}

export function TimeField({ label, value, onChange, style, inline = false }: Props) {
  const { colors } = useTheme();
  const [picking, setPicking] = useState(false);
  const openPicker = () => {
    Keyboard.dismiss();
    setPicking(true);
  };
  const labelText = <Text style={[typography.captionBold, styles.label, { color: colors.textSub }]}>{label}</Text>;

  if (inline) {
    return (
      <View style={style}>
        {labelText}
        <TimePicker value={value} onChange={onChange} />
      </View>
    );
  }

  return (
    <View style={style}>
      {labelText}
      <Pressable
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: value }}
        style={[styles.box, { backgroundColor: colors.surface2, borderColor: colors.border }]}
      >
        <Text style={[styles.valueText, { color: value ? colors.text : colors.textMuted }]}>
          {value || PLACEHOLDER}
        </Text>
      </Pressable>
      <BottomSheet visible={picking} title={label} onClose={() => setPicking(false)}>
        <TimePicker value={value} onChange={onChange} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.sm,
  },
  typeLabel: {
    marginBottom: spacing.sm,
  },
  box: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  valueText: {
    fontSize: 16,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  wheels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  wheel: {
    width: 96,
  },
});
