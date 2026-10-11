import React, { useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextStyle,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheet, SheetAction } from '@/components/BottomSheet';
import { ChipRow } from '@/components/ChipRow';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TimeField } from '@/components/TimeField';
import { WeekdayPicker } from '@/components/WeekdayPicker';
import { SIDDUR_GROUPS, SIDDUR_TEXTS, standaloneTextsIn } from '@/data/siddur';
import { useCustomMitzvotStore, makeCustomMitzvahId } from '@/stores/useCustomMitzvotStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { BRAND } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';
import { TIME_PATTERN, timeToMinutes } from '@/utils/clock';
import {
  DraftBlock,
  WEEKDAYS,
  categoryForWindow,
  cleanContentBlocks,
  reminderClock,
  siddurTextName,
} from '@/utils/customMitzvah';
import { Reminder, ReminderAnchor, SkipContext, Weekday } from '@/types/mitzvah';
import { MitzvahTextId, SiddurTextId } from '@/types/siddur';

const CONTENT_TYPES: DraftBlock['type'][] = ['text', 'blessing', 'link', 'siddur'];
const SIDDUR_CHOICES: readonly SiddurTextId[] = [
  ...(Object.keys(SIDDUR_TEXTS) as MitzvahTextId[]),
  ...SIDDUR_GROUPS.flatMap(standaloneTextsIn),
];

function emptyReminder(): Reminder {
  return { anchor: 'start', offsetMin: 0, label: '' };
}

function FieldLabel({ text }: { text: string }) {
  const { colors } = useTheme();
  return <Text style={[typography.captionBold, styles.label, { color: colors.textSub }]}>{text}</Text>;
}

function Hint({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return <Text style={[typography.small, styles.hint, { color: colors.textMuted }, style]}>{text}</Text>;
}

export default function CustomMitzvahScreen() {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const editingId = typeof rawId === 'string' && rawId.length > 0 ? rawId : null;

  const existing = useCustomMitzvotStore((s) => (editingId ? s.items[editingId] : undefined));
  const addCustom = useCustomMitzvotStore((s) => s.add);
  const updateCustom = useCustomMitzvotStore((s) => s.update);
  const removeCustom = useCustomMitzvotStore((s) => s.remove);
  const setEnabled = useMitzvotStore((s) => s.setEnabled);
  const removeFromActive = useMitzvotStore((s) => s.removeMitzvah);

  const [name, setName] = useState(existing?.name ?? '');
  const [startTime, setStartTime] = useState(existing?.startHHMM ?? '08:00');
  const [endTime, setEndTime] = useState(existing?.endHHMM ?? '12:00');
  const [activeDays, setActiveDays] = useState<Weekday[]>(existing?.activeDays ?? [...WEEKDAYS]);
  const [skipShabbat, setSkipShabbat] = useState(existing?.skipOn.includes('shabbat') ?? false);
  const [skipYomtov, setSkipYomtov] = useState(existing?.skipOn.includes('yomtov') ?? false);
  const [reminders, setReminders] = useState<Reminder[]>(
    () =>
      (editingId ? useMitzvotStore.getState().activeMitzvot[editingId]?.customReminders : undefined) ??
      existing?.reminders ?? [emptyReminder()],
  );
  const [contentBlocks, setContentBlocks] = useState<DraftBlock[]>(existing?.contentBlocks ?? []);
  const [pickingBlockIndex, setPickingBlockIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const pickerRef = useRef<ScrollView>(null);

  const titleText = useMemo(() => (editingId ? t('custom.editTitle') : t('custom.title')), [editingId, t]);
  const timesValid = TIME_PATTERN.test(startTime) && TIME_PATTERN.test(endTime);
  const windowValid = timesValid && timeToMinutes(endTime) > timeToMinutes(startTime);
  const pickingBlock = pickingBlockIndex === null ? undefined : contentBlocks[pickingBlockIndex];
  const pickedTextId = pickingBlock?.type === 'siddur' ? pickingBlock.textId : null;

  const onSave = () => {
    setError(null);
    if (!name.trim()) {
      setError(t('custom.errors.nameRequired'));
      return;
    }
    if (!timesValid) {
      setError(t('custom.errors.timeInvalid'));
      return;
    }
    if (!windowValid) {
      setError(t('custom.errors.endBeforeStart'));
      return;
    }
    if (!activeDays.length) {
      setError(t('custom.errors.daysRequired'));
      return;
    }
    const skipOn: SkipContext[] = [];
    if (skipShabbat) skipOn.push('shabbat');
    if (skipYomtov) skipOn.push('yomtov');
    if (!reminders.length) {
      setError(t('custom.errors.reminderRequired'));
      return;
    }
    if (reminders.some((r) => !r.label.trim())) {
      setError(t('custom.errors.reminderLabelRequired'));
      return;
    }
    const cleanedReminders = reminders.map(({ bodyVariants: _dropped, ...r }) => ({
      ...r,
      label: r.label.trim(),
    }));
    if (cleanedReminders.some((r) => reminderClock(startTime, endTime, r) === null)) {
      setError(t('custom.errors.reminderOutsideWindow'));
      return;
    }
    const fields = {
      name: name.trim(),
      startHHMM: startTime,
      endHHMM: endTime,
      skipOn,
      activeDays: [...activeDays].sort((a, b) => a - b),
      reminders: cleanedReminders,
      contentBlocks: cleanContentBlocks(contentBlocks),
    };
    if (editingId && existing) {
      updateCustom(editingId, fields);
      useMitzvotStore.getState().resetToDefault(editingId);
    } else {
      const id = makeCustomMitzvahId();
      addCustom({ id, ...fields, createdAt: Date.now() });
      setEnabled(id, true);
    }
    router.back();
  };

  const onDelete = () => {
    if (!editingId) return;
    removeCustom(editingId);
    removeFromActive(editingId);
    setDeleteVisible(false);
    router.back();
  };

  const toggleDay = (day: number) => {
    const weekday = WEEKDAYS.find((candidate) => candidate === day);
    if (weekday === undefined) return;
    setActiveDays((prev) => (prev.includes(weekday) ? prev.filter((d) => d !== weekday) : [...prev, weekday]));
  };
  const updateReminder = (idx: number, patch: Partial<Reminder>) => {
    setReminders((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const changeAnchor = (idx: number, anchor: ReminderAnchor) => {
    setReminders((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, anchor, offsetMin: anchor === 'end' ? -Math.abs(r.offsetMin) : Math.abs(r.offsetMin) } : r,
      ),
    );
  };
  const removeReminder = (idx: number) => {
    setReminders((prev) => prev.filter((_, i) => i !== idx));
  };
  const addReminder = () => {
    setReminders((prev) => [...prev, emptyReminder()]);
  };
  const addContentBlock = () => {
    setContentBlocks((prev) => [...prev, { type: 'text', he: '' }]);
  };
  const removeContentBlock = (idx: number) => {
    setContentBlocks((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateContentBlock = (idx: number, next: DraftBlock) => {
    setContentBlocks((prev) => prev.map((block, i) => (i === idx ? next : block)));
  };
  const changeContentType = (idx: number, type: DraftBlock['type']) => {
    setContentBlocks((prev) =>
      prev.map((block, i): DraftBlock => {
        if (i !== idx || block.type === type) return block;
        const he = block.type === 'siddur' || type === 'siddur' ? '' : block.he;
        if (type === 'link') return { type, he, url: block.type === 'link' ? block.url : '' };
        if (type === 'siddur') return { type, he, textId: null };
        return { type, he };
      }),
    );
  };
  const pickSiddurText = (textId: SiddurTextId) => {
    if (pickingBlockIndex === null) return;
    updateContentBlock(pickingBlockIndex, {
      type: 'siddur',
      he: siddurTextName(textId, 'he') ?? '',
      en: siddurTextName(textId, 'en') ?? undefined,
      textId,
    });
    setPickingBlockIndex(null);
  };

  const inputDir = language === 'he' ? 'rtl' : 'ltr';
  const anchorOptions: { value: ReminderAnchor; label: string }[] = [
    { value: 'start', label: t('custom.anchor.fromStart') },
    { value: 'end', label: t('custom.anchor.beforeEnd') },
  ];
  const categoryLabel = windowValid ? t(`library.category.${categoryForWindow(startTime, endTime)}`) : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ title: titleText, headerShown: false }} />
      <ScreenHeader title={titleText} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FieldLabel text={t('custom.name')} />
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('custom.namePlaceholder')}
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            {
              backgroundColor: colors.surface2,
              color: colors.text,
              borderColor: colors.border,
              writingDirection: inputDir,
            },
          ]}
        />

        <View style={[styles.row, styles.section]}>
          <TimeField label={t('custom.startTime')} value={startTime} onChange={setStartTime} style={styles.timeField} />
          <TimeField label={t('custom.endTime')} value={endTime} onChange={setEndTime} style={styles.timeField} />
        </View>
        <Hint text={t('custom.hint.time')} />

        <View style={styles.section}>
          <FieldLabel text={t('custom.category')} />
          {categoryLabel ? (
            <View
              accessible
              accessibilityLabel={`${t('custom.category')}: ${categoryLabel}`}
              style={[styles.pill, { backgroundColor: colors.surface2 }]}
            >
              <Text style={[typography.small, { color: colors.textSub }]}>{categoryLabel}</Text>
            </View>
          ) : null}
          <Hint text={t('custom.hint.category')} />
        </View>

        <View style={styles.section}>
          <FieldLabel text={t('custom.activeDays')} />
          <WeekdayPicker selected={activeDays} onToggle={toggleDay} />
          <Hint text={t('custom.hint.days')} />
        </View>

        <View style={[styles.switchRow, styles.section]}>
          <Text style={[typography.bodyBold, { color: colors.text }]}>{t('custom.skipShabbat')}</Text>
          <Switch
            value={skipShabbat}
            onValueChange={setSkipShabbat}
            thumbColor={BRAND.white}
            trackColor={{ false: colors.border, true: colors.gold }}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={[typography.bodyBold, { color: colors.text }]}>{t('custom.skipYomtov')}</Text>
          <Switch
            value={skipYomtov}
            onValueChange={setSkipYomtov}
            thumbColor={BRAND.white}
            trackColor={{ false: colors.border, true: colors.gold }}
          />
        </View>
        <Hint text={t('custom.hint.skip')} style={styles.tightHint} />

        <Text style={[typography.subheading, styles.section, { color: colors.text }]}>{t('custom.reminders')}</Text>
        <Hint text={t('custom.hint.reminders')} style={styles.headingHint} />
        {reminders.map((r, idx) => {
          const clock = reminderClock(startTime, endTime, r);
          return (
            <View
              key={idx}
              style={[styles.reminderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <TextInput
                value={r.label}
                onChangeText={(v) => updateReminder(idx, { label: v })}
                placeholder={t('custom.reminderLabelPlaceholder')}
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surface2,
                    color: colors.text,
                    borderColor: colors.border,
                    writingDirection: inputDir,
                    marginBottom: spacing.md,
                  },
                ]}
              />
              <View style={styles.reminderRow}>
                <TextInput
                  value={String(r.anchor === 'end' ? Math.abs(r.offsetMin) : r.offsetMin)}
                  onChangeText={(v) => {
                    const num = Math.max(0, Math.min(720, Number(v.replace(/[^0-9]/g, '')) || 0));
                    updateReminder(idx, { offsetMin: r.anchor === 'end' ? -num : num });
                  }}
                  accessibilityLabel={t('custom.offsetMinutes')}
                  keyboardType="number-pad"
                  style={[
                    styles.input,
                    styles.offsetInput,
                    {
                      backgroundColor: colors.surface2,
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                  maxLength={3}
                />
                <Text style={[typography.caption, styles.offsetWord, { color: colors.textSub }]}>
                  {t('custom.offsetMinutes')}
                </Text>
                <SegmentedControl
                  tone="surface"
                  options={anchorOptions}
                  value={r.anchor}
                  onChange={(v) => changeAnchor(idx, v)}
                  style={styles.anchor}
                />
              </View>
              {clock ? (
                <Text style={[typography.small, styles.reminderNote, { color: colors.goldText }]}>
                  {t('custom.reminderPreview', { time: clock })}
                </Text>
              ) : windowValid ? (
                <Text style={[typography.small, styles.reminderNote, { color: colors.urgent }]}>
                  {t('custom.reminderOutsideWindow')}
                </Text>
              ) : null}
              <Hint text={t('custom.hint.reminderAnchor')} style={styles.tightHint} />
              <Pressable
                onPress={() => removeReminder(idx)}
                accessibilityRole="button"
                style={[styles.deleteItemBtn, { backgroundColor: colors.urgentBg, borderColor: colors.urgent }]}
              >
                <Text style={[typography.captionBold, { color: colors.urgent }]}>{t('custom.deleteReminder')}</Text>
              </Pressable>
            </View>
          );
        })}
        <Pressable
          onPress={addReminder}
          style={[styles.addBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
        >
          <Text style={[typography.bodyBold, { color: colors.text }]}>+ {t('custom.addReminder')}</Text>
        </Pressable>

        <View style={[styles.editorSection, { borderColor: colors.border }]}>
          <Text style={[typography.subheading, { color: colors.text }]}>{t('custom.contentBlocks')}</Text>
          <Hint text={t('custom.hint.content')} style={styles.headingHint} />
          {contentBlocks.map((block, idx) => (
            <View
              key={idx}
              style={[styles.contentEditorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <ChipRow
                values={CONTENT_TYPES}
                selected={block.type}
                onSelect={(type) => changeContentType(idx, type)}
                renderLabel={(type) => t(`custom.contentType.${type}`)}
              />
              {block.type === 'siddur' ? (
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setPickingBlockIndex(idx);
                  }}
                  accessibilityRole="button"
                  style={[
                    styles.addBtn,
                    { backgroundColor: colors.surface2, borderColor: colors.border, marginTop: spacing.md },
                  ]}
                >
                  <Text style={[typography.bodyBold, { color: block.textId ? colors.text : colors.textSub }]}>
                    {block.textId
                      ? (siddurTextName(block.textId, language) ??
                        (language === 'en' && block.en ? block.en : block.he))
                      : t('custom.pickSiddurText')}
                  </Text>
                </Pressable>
              ) : (
                <>
                  <TextInput
                    value={block.he}
                    onChangeText={(value) => updateContentBlock(idx, { ...block, he: value })}
                    placeholder={t('custom.contentTextPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    multiline
                    style={[
                      styles.input,
                      styles.multiInput,
                      {
                        backgroundColor: colors.surface2,
                        color: colors.text,
                        borderColor: colors.border,
                        writingDirection: inputDir,
                        marginTop: spacing.md,
                      },
                    ]}
                  />
                  {block.type === 'link' ? (
                    <TextInput
                      value={block.url}
                      onChangeText={(value) => updateContentBlock(idx, { ...block, url: value })}
                      placeholder={t('custom.contentUrlPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      keyboardType="url"
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.surface2,
                          color: colors.text,
                          borderColor: colors.border,
                          writingDirection: 'ltr',
                          textAlign: 'left',
                          marginTop: spacing.md,
                        },
                      ]}
                    />
                  ) : null}
                </>
              )}
              <Pressable
                onPress={() => removeContentBlock(idx)}
                accessibilityRole="button"
                style={[styles.deleteItemBtn, { backgroundColor: colors.urgentBg, borderColor: colors.urgent }]}
              >
                <Text style={[typography.captionBold, { color: colors.urgent }]}>{t('custom.deleteContentBlock')}</Text>
              </Pressable>
            </View>
          ))}
          <Pressable
            onPress={addContentBlock}
            style={[styles.addBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
          >
            <Text style={[typography.bodyBold, { color: colors.text }]}>+ {t('custom.addContentBlock')}</Text>
          </Pressable>
        </View>

        {error ? (
          <Text style={[typography.captionBold, { color: colors.urgent, marginTop: spacing.lg, textAlign: 'center' }]}>
            {error}
          </Text>
        ) : null}

        <Pressable onPress={onSave} style={[styles.primaryBtn, { backgroundColor: colors.gold }]}>
          <Text style={[typography.bodyBold, { color: colors.onGold }]}>{t('custom.save')}</Text>
        </Pressable>

        {editingId ? (
          <Pressable
            onPress={() => setDeleteVisible(true)}
            style={[styles.dangerBtn, { backgroundColor: colors.urgentBg, borderColor: colors.urgent }]}
          >
            <Text style={[typography.bodyBold, { color: colors.urgent }]}>{t('custom.delete')}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <BottomSheet
        visible={pickingBlockIndex !== null}
        title={t('custom.pickSiddurText')}
        onClose={() => setPickingBlockIndex(null)}
      >
        <ScrollView ref={pickerRef} style={styles.sheetList}>
          {SIDDUR_CHOICES.map((id) => {
            const selected = id === pickedTextId;
            return (
              <SheetAction
                key={id}
                label={siddurTextName(id, language) ?? ''}
                selected={selected}
                onLayout={
                  selected
                    ? (event) =>
                        pickerRef.current?.scrollTo({
                          y: Math.max(0, event.nativeEvent.layout.y - 96),
                          animated: false,
                        })
                    : undefined
                }
                onPress={() => pickSiddurText(id)}
              />
            );
          })}
        </ScrollView>
      </BottomSheet>
      <ConfirmDialog
        visible={deleteVisible}
        title={t('custom.deleteConfirmTitle')}
        body={t('custom.deleteConfirmBody')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={onDelete}
        onCancel={() => setDeleteVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  section: { marginTop: spacing.xl },
  label: { marginBottom: spacing.sm },
  hint: { marginTop: spacing.sm },
  tightHint: { marginTop: spacing.xs },
  headingHint: { marginTop: spacing.xs, marginBottom: spacing.md },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  multiInput: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-end' },
  timeField: { flex: 1 },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  anchor: { flex: 1 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  reminderCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  reminderRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  offsetInput: { width: 72, textAlign: 'center' },
  offsetWord: { flexShrink: 0 },
  reminderNote: { marginTop: spacing.sm },
  addBtn: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  editorSection: {
    borderTopWidth: 1,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
  },
  contentEditorCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  deleteItemBtn: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  primaryBtn: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  dangerBtn: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  sheetList: {
    maxHeight: 420,
  },
});
