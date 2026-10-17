import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { ChipRow } from '@/components/ChipRow';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionLabel } from '@/components/SectionLabel';
import { SettingsSection } from '@/components/SettingsSection';
import { TAHARAH_PRESET_IDS } from '@/data/taharahPresets';
import { markUnlocked } from '@/services/biometricLock';
import { resetTaharahTracking } from '@/stores/taharahOptIn';
import { useTaharahStore } from '@/stores/useTaharahStore';
import { BRAND } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { TaharahRole } from '@/types/taharah';
import { useI18n } from '@/i18n';

const HEFSEK_DAYS = [4, 5] as const;
const MOCH_RULES = ['required', 'recommended', 'optional'] as const;
const ONAH_DAYS: Record<string, number[]> = { '30': [30], '3031': [30, 31] };
const ONAH_DAY_IDS = Object.keys(ONAH_DAYS);
const SPANS = ['onah', 'fullDay'] as const;
const HAFLAGA_METHODS = ['days', 'onot'] as const;
const ROLES: readonly TaharahRole[] = ['woman', 'husband'];
const LEAD_MINUTES: readonly number[] = [30, 60, 90, 120, 180];
const LEAD_FIELDS = [
  { key: 'hefsekLeadMin', label: 'taharah.settings.hefsekLead' },
  { key: 'bedikaEveningLeadMin', label: 'taharah.settings.bedikaLead' },
  { key: 'tevilaPrepLeadMin', label: 'taharah.settings.tevilaLead' },
] as const;

export default function TaharahSettingsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const store = useTaharahStore();
  const { rules } = store.settings;
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [resetVisible, setResetVisible] = useState(false);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/settings');
  };

  const toggleLock = (next: boolean) => {
    // Before the store write: TaharahLock reacts to lockEnabled and would cover this very screen.
    if (next) markUnlocked();
    store.setLockEnabled(next);
  };

  const deleteData = () => {
    store.clearEvents();
    setDeleteVisible(false);
    close();
  };

  const resetTracking = () => {
    setResetVisible(false);
    resetTaharahTracking();
    router.replace('/(tabs)/settings');
  };

  const affects = (key: string) => (
    <Text style={[typography.small, styles.affects, { color: colors.textMuted }]}>{t(`taharah.affects.${key}`)}</Text>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={t('taharah.settings.title')} onBack={close} />
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsSection title={t('taharah.settings.preset')}>
          <ChipRow
            values={TAHARAH_PRESET_IDS}
            selected={store.settings.preset}
            onSelect={store.setPreset}
            renderLabel={(value) => t(`taharah.preset.${value}`)}
          />
          <Text style={[typography.small, { color: colors.textMuted, marginTop: spacing.sm }]}>
            {t('taharah.settings.rulesHint')}
          </Text>
          {affects('preset')}
          <SectionLabel text={t('taharah.rule.hefsekEarliestDay')} style={styles.fieldLabel} />
          <ChipRow
            values={HEFSEK_DAYS}
            selected={rules.hefsekEarliestDay}
            onSelect={(value) => store.setRule('hefsekEarliestDay', value)}
            renderLabel={String}
          />
          {affects('hefsekEarliestDay')}
          <SectionLabel text={t('taharah.rule.mochDachuk')} style={styles.fieldLabel} />
          <ChipRow
            values={MOCH_RULES}
            selected={rules.mochDachuk}
            onSelect={(value) => store.setRule('mochDachuk', value)}
            renderLabel={(value) => t(`taharah.moch.${value}`)}
          />
          {affects('mochDachuk')}
          <SectionLabel text={t('taharah.rule.onahBeinonitDays')} style={styles.fieldLabel} />
          <ChipRow
            values={ONAH_DAY_IDS}
            selected={rules.onahBeinonitDays.includes(31) ? '3031' : '30'}
            onSelect={(id) => store.setRule('onahBeinonitDays', [...ONAH_DAYS[id]])}
            renderLabel={(id) => t(`taharah.onahBeinonit.${id}`)}
          />
          {affects('onahBeinonitDays')}
          <SectionLabel text={t('taharah.rule.onahBeinonitSpan')} style={styles.fieldLabel} />
          <ChipRow
            values={SPANS}
            selected={rules.onahBeinonitSpan}
            onSelect={(value) => store.setRule('onahBeinonitSpan', value)}
            renderLabel={(value) => t(`taharah.span.${value}`)}
          />
          {affects('onahBeinonitSpan')}
          <SwitchRow
            label={t('taharah.rule.ohrZarua')}
            hint={t('taharah.affects.ohrZarua')}
            value={rules.ohrZarua}
            onValueChange={(value) => store.setRule('ohrZarua', value)}
          />
          <SectionLabel text={t('taharah.rule.haflagaMethod')} style={styles.fieldLabel} />
          <ChipRow
            values={HAFLAGA_METHODS}
            selected={rules.haflagaMethod}
            onSelect={(value) => store.setRule('haflagaMethod', value)}
            renderLabel={(value) => t(`taharah.haflaga.${value}`)}
          />
          {affects('haflagaMethod')}
        </SettingsSection>

        <SettingsSection title={t('taharah.settings.role')}>
          <ChipRow
            values={ROLES}
            selected={store.settings.role}
            onSelect={store.setRole}
            renderLabel={(value) => t(`taharah.role.${value}`)}
          />
          {affects('role')}
          {store.settings.role === 'husband' ? (
            <Text style={[typography.small, { color: colors.textMuted, marginTop: spacing.sm }]}>
              {t('taharah.husband.hint')}
            </Text>
          ) : null}
        </SettingsSection>

        <SettingsSection title={t('taharah.settings.reminders')}>
          {affects('reminders')}
          <SwitchRow
            label={t('taharah.settings.discreet')}
            hint={t('taharah.settings.discreetHint')}
            value={store.discreetNotifications}
            onValueChange={store.setDiscreetNotifications}
          />
          <SwitchRow
            label={t('taharah.settings.lock')}
            hint={t('taharah.settings.lockHint')}
            value={store.lockEnabled}
            onValueChange={toggleLock}
          />
          {LEAD_FIELDS.map((field) => (
            <React.Fragment key={field.key}>
              <SectionLabel text={t(field.label)} style={styles.fieldLabel} />
              <ChipRow
                values={LEAD_MINUTES}
                selected={store[field.key]}
                onSelect={(minutes) => store.setLeads({ [field.key]: minutes })}
                renderLabel={(minutes) => t('taharah.settings.minutes', { n: minutes })}
              />
            </React.Fragment>
          ))}
        </SettingsSection>

        <Pressable
          onPress={() => router.push('/taharah/calendar')}
          accessibilityRole="button"
          style={[styles.primaryBtn, { backgroundColor: colors.gold }]}
        >
          <Text style={[typography.bodyBold, { color: colors.onGold }]}>{t('taharah.settings.calendar')}</Text>
        </Pressable>

        <Pressable
          onPress={() => setDeleteVisible(true)}
          accessibilityRole="button"
          style={[styles.dangerBtn, { backgroundColor: colors.urgentBg, borderColor: colors.urgent }]}
        >
          <Text style={[typography.bodyBold, { color: colors.urgent }]}>{t('taharah.settings.deleteData')}</Text>
        </Pressable>
        {affects('deleteData')}

        <Pressable
          onPress={() => setResetVisible(true)}
          accessibilityRole="button"
          style={[styles.dangerBtn, { backgroundColor: colors.urgentBg, borderColor: colors.urgent }]}
        >
          <Text style={[typography.bodyBold, { color: colors.urgent }]}>{t('taharah.settings.reset')}</Text>
        </Pressable>
        {affects('reset')}
      </ScrollView>

      <ConfirmDialog
        visible={deleteVisible}
        title={t('taharah.settings.deleteConfirmTitle')}
        body={t('taharah.settings.deleteConfirmBody')}
        confirmLabel={t('taharah.settings.deleteAction')}
        destructive
        onConfirm={deleteData}
        onCancel={() => setDeleteVisible(false)}
      />

      <ConfirmDialog
        visible={resetVisible}
        title={t('taharah.settings.resetConfirmTitle')}
        body={t('taharah.settings.resetConfirmBody')}
        confirmLabel={t('taharah.settings.resetAction')}
        destructive
        onConfirm={resetTracking}
        onCancel={() => setResetVisible(false)}
      />
    </SafeAreaView>
  );
}

function SwitchRow({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchMeta}>
        <Text style={[typography.bodyBold, { color: colors.text }]}>{label}</Text>
        {hint ? (
          <Text style={[typography.small, { color: colors.textMuted, marginTop: spacing.xs }]}>{hint}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        thumbColor={BRAND.white}
        trackColor={{ false: colors.border, true: colors.gold }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  fieldLabel: {
    marginTop: spacing.lg,
  },
  affects: {
    marginTop: spacing.sm,
  },
  primaryBtn: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  switchMeta: {
    flex: 1,
    paddingEnd: spacing.md,
  },
  dangerBtn: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
});
