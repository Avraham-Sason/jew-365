import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Mitzvah, Reminder, ReminderAnchor, UserSettings } from '@/types/mitzvah';
import type { Location } from '@/types/zmanim';
import { nextReminderAt } from '@/services/NotificationScheduler';
import { BRAND } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';
import { currentOrNextWindow } from '@/utils/buildDayTimeline';
import { TIME_PATTERN, minutesToTime, timeToMinutes } from '@/utils/clock';
import { BottomSheet } from './BottomSheet';
import { SegmentedControl } from './SegmentedControl';
import { TimeField } from './TimeField';

const BODY_HEIGHT_SHARE = 0.65;

const MAX_OFFSET_MIN = 720;

type Props = {
  visible: boolean;
  initialValue?: Reminder | null;
  mitzvah: Mitzvah;
  location: Location;
  settings: UserSettings;
  allowClock?: boolean;
  mitzvahName?: string;
  onClose: () => void;
  onSave: (value: Reminder) => void;
};

export function ReminderEditor({
  visible,
  initialValue,
  mitzvah,
  location,
  settings,
  allowClock = false,
  mitzvahName,
  onClose,
  onSave,
}: Props) {
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const { t } = useI18n();
  const [anchor, setAnchor] = useState<ReminderAnchor>('start');
  const [offsetMin, setOffsetMin] = useState('0');
  const [time, setTime] = useState('');
  const [label, setLabel] = useState('');
  const [skipIfDone, setSkipIfDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const startsOnClock = initialValue?.anchor === 'clock';
    setAnchor(initialValue?.anchor ?? 'start');
    setOffsetMin(startsOnClock ? '0' : String(initialValue?.offsetMin ?? 0));
    setTime(startsOnClock ? minutesToTime(initialValue.offsetMin) : '');
    setLabel(initialValue?.label ?? '');
    setSkipIfDone(initialValue?.skipIfDone ?? false);
    setError(null);
  }, [initialValue, visible]);

  const changeAnchor = (next: ReminderAnchor) => {
    if (anchor === 'clock' && next !== 'clock') setOffsetMin('0');
    setAnchor(next);
  };

  // A reminder is sendable when the scheduler would fire it at least once in its own lookahead. The marks
  // are left out, so a mitzvah already done today never makes a sendable reminder look dead.
  const firesAtLeastOnce = (reminder: Reminder) => {
    const now = new Date();
    if (!currentOrNextWindow(mitzvah, location, settings, now)) return true;
    return nextReminderAt(mitzvah, [reminder], { now, location, settings, completions: {}, skipped: {} }) !== null;
  };

  const save = () => {
    const onClock = anchor === 'clock';
    if (onClock && !TIME_PATTERN.test(time)) {
      setError(t('reminder.errors.timeRequired'));
      return;
    }
    const minutes = onClock ? timeToMinutes(time) : Number(offsetMin) || 0;
    if (!onClock && Math.abs(minutes) > MAX_OFFSET_MIN) {
      setError(t('reminder.errors.offsetRange', { max: MAX_OFFSET_MIN }));
      return;
    }
    const reminder: Reminder = {
      anchor,
      offsetMin: minutes,
      label: label.trim() || mitzvahName || t('detail.addReminder'),
      skipIfDone,
    };
    if (!firesAtLeastOnce(reminder)) {
      setError(t(onClock ? 'reminder.errors.timeOutsideWindow' : 'reminder.errors.outsideWindow'));
      return;
    }
    setError(null);
    onSave(reminder);
    onClose();
  };

  const anchorOptions: { value: ReminderAnchor; label: string }[] = [
    { value: 'start', label: t('reminder.anchor.start') },
    { value: 'end', label: t('reminder.anchor.end') },
    ...(allowClock ? [{ value: 'clock' as const, label: t('reminder.anchor.clock') }] : []),
  ];

  return (
    <BottomSheet
      visible={visible}
      title={initialValue ? t('reminder.edit') : t('reminder.add')}
      caption={mitzvahName}
      onClose={onClose}
    >
      <ScrollView
        style={{ maxHeight: windowHeight * BODY_HEIGHT_SHARE }}
        contentContainerStyle={styles.fields}
        keyboardShouldPersistTaps="handled"
      >
        <SegmentedControl
          tone="surface"
          options={anchorOptions}
          value={anchor}
          onChange={changeAnchor}
          style={styles.anchor}
        />
        <Text style={[typography.captionBold, styles.fieldLabel, { color: colors.text }]}>{t('reminder.label')}</Text>
        <TextInput
          accessibilityLabel={t('reminder.label')}
          value={label}
          onChangeText={setLabel}
          placeholder={t('detail.addReminder')}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { backgroundColor: colors.surface2, color: colors.text, borderColor: colors.border }]}
        />
        {anchor === 'clock' ? (
          <TimeField inline label={t('reminder.time')} value={time} onChange={setTime} />
        ) : (
          <>
            <Text style={[typography.captionBold, styles.fieldLabel, { color: colors.text }]}>
              {t('reminder.offset')}
            </Text>
            <View style={styles.offsetRow}>
              <Pressable
                onPress={() => setOffsetMin(String((Number(offsetMin) || 0) - 5))}
                style={[styles.stepper, { backgroundColor: colors.surface2, borderColor: colors.border }]}
              >
                <Text style={[typography.bodyBold, { color: colors.text }]}>-5</Text>
              </Pressable>
              <TextInput
                accessibilityLabel={t('reminder.offset')}
                keyboardType="numbers-and-punctuation"
                value={offsetMin}
                onChangeText={setOffsetMin}
                style={[
                  styles.input,
                  styles.offsetInput,
                  { backgroundColor: colors.surface2, color: colors.text, borderColor: colors.border },
                ]}
              />
              <Pressable
                onPress={() => setOffsetMin(String((Number(offsetMin) || 0) + 5))}
                style={[styles.stepper, { backgroundColor: colors.surface2, borderColor: colors.border }]}
              >
                <Text style={[typography.bodyBold, { color: colors.text }]}>+5</Text>
              </Pressable>
            </View>
          </>
        )}
        <View style={[styles.switchRow, { borderTopColor: colors.border }]}>
          <View style={styles.switchLabel}>
            <Text style={[typography.subheading, { color: colors.text }]}>{t('reminder.skipIfDone')}</Text>
          </View>
          <Switch
            value={skipIfDone}
            onValueChange={setSkipIfDone}
            thumbColor={BRAND.white}
            trackColor={{ false: colors.border, true: colors.gold }}
          />
        </View>
        {error ? <Text style={[typography.small, styles.error, { color: colors.urgent }]}>{error}</Text> : null}
        <Pressable onPress={save} accessibilityRole="button" style={[styles.saveBtn, { backgroundColor: colors.gold }]}>
          <Text style={[typography.bodyBold, { color: colors.onGold }]}>{t('common.save')}</Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: spacing.sm,
  },
  anchor: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  offsetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepper: {
    width: 54,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offsetInput: {
    flex: 1,
    minWidth: 0,
    marginBottom: 0,
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  switchLabel: {
    flex: 1,
  },
  error: {
    marginTop: spacing.xs,
  },
  saveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
});
