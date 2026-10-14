import React, { useCallback, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { appVersionLabel } from '@/services/appUpdates';
import { LocationService } from '@/services/LocationService';
import {
  NotificationScheduler,
  requestNotificationPermissions,
  syncNotificationPermissionStatus,
} from '@/services/NotificationScheduler';
import { AppResetService } from '@/services/AppResetService';
import {
  backupDateLabel,
  backupFailureKey,
  exportBackup,
  pickBackup,
  restoreBackup,
  type Backup,
} from '@/services/BackupService';
import { reportError } from '@/services/errors';
import { openBatteryOptimizationSettings, supportsBatteryOptimizationSettings } from '@/services/deviceSettings';
import {
  chooseGender,
  chooseMaritalStatus,
  chooseNusach,
  setTaharahTracking,
  taharahOffered,
} from '@/stores/taharahOptIn';
import { useMitzvotStore, type ActiveMitzvahState } from '@/stores/useMitzvotStore';
import { useUserStore, type PrayerMode } from '@/stores/useUserStore';
import { useShallow } from 'zustand/react/shallow';
import { BRAND } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { ChipRow } from '@/components/ChipRow';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ListRow } from '@/components/ListRow';
import { NavBar } from '@/components/NavBar';
import { SectionLabel } from '@/components/SectionLabel';
import { ThemeSwatchRow } from '@/components/ThemeSwatchRow';
import { SettingsSection } from '@/components/SettingsSection';
import { ScrollSpeedStepper } from '@/components/ScrollSpeedStepper';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';
import { CITIES, cityOf, getLocationName } from '@/data/cities';
import { Nusach } from '@/types/mitzvah';

const NUSACHAOT: Nusach[] = ['ashkenaz', 'sefard', 'edot_hamizrach', 'chabad'];
const LANGS = ['he', 'en'] as const;
const OPINIONS = ['GRA', 'MA'] as const;
const GENDERS = ['male', 'female'] as const;
const MARITAL_STATUSES = ['married', 'single'] as const;
const PRAYER_MODES: readonly PrayerMode[] = ['minyan', 'alone'];
const CITY_INDEXES = CITIES.map((_, index) => index);

type SectionKey = 'profile' | 'prayer' | 'device';

// Returns a number, so the subscription re-renders only when the count itself changes.
const selectEnabledCount = (state: { activeMitzvot: Record<string, ActiveMitzvahState> }): number =>
  Object.values(state.activeMitzvot).filter((active) => active.enabled).length;

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();
  // One shallow slice: subscribing to the whole store re-rendered every section on each permission
  // sync, font-size tap or scroll-speed step.
  const user = useUserStore(
    useShallow((s) => ({
      profileName: s.profileName,
      profilePhone: s.profilePhone,
      gender: s.gender,
      maritalStatus: s.maritalStatus,
      notificationsEnabled: s.notificationsEnabled,
      notificationPermission: s.notificationPermission,
      nusach: s.nusach,
      siddurAutoScroll: s.siddurAutoScroll,
      siddurScrollSpeed: s.siddurScrollSpeed,
      prayerMode: s.prayerMode,
      taharahEnabled: s.taharahEnabled,
      weeklyReportEnabled: s.weeklyReportEnabled,
      location: s.location,
      locationStatus: s.locationStatus,
      theme: s.theme,
      language: s.language,
      halachicOpinions: s.halachicOpinions,
      setLocationState: s.setLocationState,
      setLocationStatus: s.setLocationStatus,
      setNotificationsEnabled: s.setNotificationsEnabled,
      setProfileName: s.setProfileName,
      setProfilePhone: s.setProfilePhone,
      setSiddurAutoScroll: s.setSiddurAutoScroll,
      setSiddurScrollSpeed: s.setSiddurScrollSpeed,
      setPrayerMode: s.setPrayerMode,
      setWeeklyReportEnabled: s.setWeeklyReportEnabled,
      setTheme: s.setTheme,
      setLanguage: s.setLanguage,
      setKsOpinion: s.setKsOpinion,
    })),
  );
  const enabledMitzvotCount = useMitzvotStore(selectEnabledCount);
  const savedCityId = cityOf(user.location)?.cityId;
  // Held locally and committed on blur. Bound straight to the store, every keystroke serialised
  // the whole user store to MMKV and re-rendered the entire settings tree.
  const [nameDraft, setNameDraft] = useState(user.profileName);
  const [phoneDraft, setPhoneDraft] = useState(user.profilePhone);
  const [statusText, setStatusText] = useState('');
  const [resetVisible, setResetVisible] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<Backup | null>(null);
  const [backupStatus, setBackupStatus] = useState<{ text: string; failed: boolean } | null>(null);
  const [open, setOpen] = useState<ReadonlySet<SectionKey>>(() => new Set());

  useFocusEffect(
    useCallback(() => {
      setOpen(new Set());
      syncNotificationPermissionStatus().catch((error) => reportError('schedule', error));
    }, []),
  );

  const commitProfileDrafts = () => {
    user.setProfileName(nameDraft.trim());
    user.setProfilePhone(phoneDraft.trim());
  };

  const toggle = (key: SectionKey) => {
    if (key === 'profile' && open.has(key)) commitProfileDrafts();
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  const collapsible = (key: SectionKey) => ({
    collapsible: true,
    expanded: open.has(key),
    onToggle: () => toggle(key),
  });

  const performReset = async () => {
    setResetting(true);
    try {
      await AppResetService.reset();
      setResetVisible(false);
      router.replace('/onboarding');
    } finally {
      setResetting(false);
    }
  };

  const runBackupStep = async (step: () => Promise<void>) => {
    if (backupBusy) return;
    setBackupBusy(true);
    setBackupStatus(null);
    try {
      await step();
    } catch (error) {
      setPendingBackup(null);
      setBackupStatus({ text: t(backupFailureKey(error)), failed: true });
    } finally {
      setBackupBusy(false);
    }
  };

  const exportBackupFile = () =>
    runBackupStep(async () => {
      commitProfileDrafts();
      await exportBackup();
    });

  const chooseBackupFile = () =>
    runBackupStep(async () => {
      setPendingBackup(await pickBackup());
    });

  const confirmRestore = () =>
    runBackupStep(async () => {
      if (!pendingBackup) return;
      await restoreBackup(pendingBackup);
      const restored = useUserStore.getState();
      setNameDraft(restored.profileName);
      setPhoneDraft(restored.profilePhone);
      setPendingBackup(null);
      setBackupStatus({ text: t('settings.backupRestored'), failed: false });
    });

  const [locating, setLocating] = useState(false);

  const refreshLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const resolved = await LocationService.getCurrentLocation();
      // Only commit a location the lookup actually produced. A failed refresh must keep the city
      // the user chose, not silently move them to the default.
      if (resolved.location) {
        user.setLocationState(resolved.location, resolved.status, resolved.source);
      } else {
        user.setLocationStatus(resolved.status);
      }
      setStatusText(resolved.location ? t('settings.gpsUpdated') : t('settings.gpsFallback'));
    } finally {
      setLocating(false);
    }
  };

  const openOsSettings = () => {
    Linking.openSettings().catch(() => {});
  };

  const onToggleNotifications = async (next: boolean) => {
    if (next) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        user.setNotificationsEnabled(false);
        openOsSettings();
        return;
      }
      user.setNotificationsEnabled(true);
      NotificationScheduler.rebuild().catch((error) => reportError('schedule', error));
    } else {
      user.setNotificationsEnabled(false);
      NotificationScheduler.cancelAll().catch((error) => reportError('schedule', error));
    }
  };

  const permGranted = user.notificationPermission === 'granted';
  const notifActive = user.notificationsEnabled && permGranted;
  const subHeadingTone = { color: colors.goldText, borderTopColor: colors.border };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <NavBar title={t('settings.title')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.mitzvotCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ListRow
            icon="custom"
            title={t('settings.mitzvot')}
            caption={t('settings.mitzvotCaption', { count: enabledMitzvotCount })}
            onPress={() => router.push('/mitzvot')}
            chevron
            style={styles.mitzvotRow}
          />
        </View>

        <SettingsSection title={t('settings.profile')} {...collapsible('profile')}>
          <SectionLabel text={t('settings.profileName')} style={styles.firstFieldLabel} />
          <TextInput
            value={nameDraft}
            onChangeText={setNameDraft}
            onBlur={commitProfileDrafts}
            placeholder={t('settings.profileNamePlaceholder')}
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              {
                backgroundColor: colors.surface2,
                color: colors.text,
                borderColor: colors.border,
                writingDirection: language === 'he' ? 'rtl' : 'ltr',
              },
            ]}
            autoCapitalize="words"
          />
          <SectionLabel text={t('settings.profilePhone')} style={styles.fieldLabel} />
          <TextInput
            value={phoneDraft}
            onChangeText={setPhoneDraft}
            onBlur={commitProfileDrafts}
            placeholder={t('settings.profilePhonePlaceholder')}
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            style={[
              styles.input,
              {
                backgroundColor: colors.surface2,
                color: colors.text,
                borderColor: colors.border,
                writingDirection: language === 'he' ? 'rtl' : 'ltr',
              },
            ]}
          />
          <SectionLabel text={t('profile.gender')} style={styles.fieldLabel} />
          <ChipRow
            values={GENDERS}
            selected={user.gender}
            onSelect={chooseGender}
            renderLabel={(value) => t(`profile.gender.${value}`)}
          />
          <SectionLabel text={t('profile.maritalStatus')} style={styles.fieldLabel} />
          <ChipRow
            values={MARITAL_STATUSES}
            selected={user.maritalStatus}
            onSelect={chooseMaritalStatus}
            renderLabel={(value) => t(`profile.maritalStatus.${value}.${user.gender ?? 'neutral'}`)}
          />

          {taharahOffered(user) ? (
            <>
              <SectionLabel text={t('settings.taharah')} style={styles.fieldLabel} />
              <SwitchRow
                label={t('settings.taharahEnabled')}
                hint={t(user.gender === 'female' ? 'taharah.optIn.woman.body' : 'taharah.optIn.husband.body')}
                value={user.taharahEnabled}
                onValueChange={setTaharahTracking}
              />
              {user.taharahEnabled ? (
                <PrimaryButton label={t('settings.taharahOpen')} onPress={() => router.push('/taharah/settings')} />
              ) : null}
              <Text style={[typography.small, styles.note, { color: colors.textMuted }]}>
                {t('taharah.disclaimer')}
              </Text>
            </>
          ) : null}
        </SettingsSection>

        <SettingsSection title={t('settings.prayer')} {...collapsible('prayer')}>
          <SectionLabel text={t('settings.nusach')} style={styles.firstFieldLabel} />
          <ChipRow
            values={NUSACHAOT}
            selected={user.nusach}
            onSelect={chooseNusach}
            renderLabel={(value) => t(`nusach.${value}`)}
          />
          <SectionLabel text={t('settings.prayerMode')} style={styles.fieldLabel} />
          <ChipRow
            values={PRAYER_MODES}
            selected={user.prayerMode}
            onSelect={user.setPrayerMode}
            renderLabel={(value) => t(`prayerMode.${value}`)}
          />
          <Text style={[typography.small, styles.note, { color: colors.textMuted }]}>
            {t('settings.prayerModeHint')}
          </Text>
          <SectionLabel text={t('settings.reading')} style={styles.fieldLabel} />
          <SwitchRow
            label={t('settings.autoScroll')}
            hint={t('settings.autoScrollHint')}
            value={user.siddurAutoScroll}
            onValueChange={user.setSiddurAutoScroll}
          />
          <View style={[styles.row, styles.speedRow]}>
            <Text style={[typography.bodyBold, { color: colors.text }]}>{t('settings.autoScrollSpeed')}</Text>
            <ScrollSpeedStepper tone="surface" level={user.siddurScrollSpeed} onChange={user.setSiddurScrollSpeed} />
          </View>
        </SettingsSection>

        <SettingsSection title={t('settings.device')} {...collapsible('device')}>
          <SectionLabel
            text={t('settings.zmanim')}
            style={[styles.subHeading, styles.firstSubHeading, subHeadingTone]}
          />
          <Text style={[typography.bodyBold, { color: colors.text }]}>{getLocationName(user.location, language)}</Text>
          <Text style={[typography.small, styles.hint, { color: colors.textMuted }]}>
            {t(`settings.locationStatus.${user.locationStatus}`)}
          </Text>
          <PrimaryButton label={t('settings.useCurrentLocation')} onPress={refreshLocation} />
          {statusText ? (
            <Text style={[typography.small, styles.note, { color: colors.textMuted }]}>{statusText}</Text>
          ) : null}
          <SectionLabel text={t('settings.pickCity')} style={styles.fieldLabel} />
          <ChipRow
            values={CITY_INDEXES}
            selected={CITIES.findIndex((city) => city.cityId === savedCityId)}
            onSelect={(index) => user.setLocationState(CITIES[index], 'ready', 'manual')}
            renderLabel={(index) => getLocationName(CITIES[index], language)}
          />
          <SectionLabel text={t('settings.opinion')} style={styles.fieldLabel} />
          <ChipRow
            values={OPINIONS}
            selected={user.halachicOpinions.ksSofZman}
            onSelect={(value) => user.setKsOpinion(value)}
            renderLabel={(value) => t(`settings.opinion.${value}`)}
          />

          <SectionLabel text={t('settings.notifications')} style={[styles.subHeading, subHeadingTone]} />
          <SwitchRow
            label={t('settings.notificationsToggle')}
            hint={
              notifActive
                ? t('settings.notificationsActiveHint')
                : user.notificationsEnabled && !permGranted
                  ? t('settings.notificationsBlockedHint')
                  : t('settings.notificationsOffHint')
            }
            value={user.notificationsEnabled}
            onValueChange={onToggleNotifications}
          />
          <SwitchRow
            label={t('settings.weeklyReport')}
            hint={t('settings.weeklyReportHint')}
            value={user.weeklyReportEnabled}
            onValueChange={user.setWeeklyReportEnabled}
            style={styles.groupGap}
          />
          <Row
            label={t('settings.notificationsOsStatus')}
            value={permGranted ? t('settings.notificationsGranted') : t('settings.notificationsDenied')}
          />
          {!permGranted ? <PrimaryButton label={t('settings.openOsSettings')} onPress={openOsSettings} /> : null}
          {/* Exact alarms are declared in the manifest, but OEM battery managers can still defer
              them. Exempting the app is the one part only the user can do. */}
          {supportsBatteryOptimizationSettings() ? (
            <>
              <Text style={[typography.small, styles.groupGap, { color: colors.textMuted }]}>
                {t('settings.batteryHint')}
              </Text>
              <PrimaryButton label={t('settings.batteryAction')} onPress={() => openBatteryOptimizationSettings()} />
            </>
          ) : null}
          <Text style={[typography.small, styles.note, { color: colors.textMuted }]}>
            {Platform.OS === 'ios' ? t('settings.iosHint') : t('settings.androidHint')}
          </Text>

          <SectionLabel text={t('settings.display')} style={[styles.subHeading, subHeadingTone]} />
          <SectionLabel text={t('settings.theme')} style={styles.firstFieldLabel} />
          <ThemeSwatchRow
            selected={user.theme}
            onSelect={(value) => user.setTheme(value)}
            labelFor={(value) => t(`settings.theme.${value}`)}
          />
          <SectionLabel text={t('settings.language')} style={styles.fieldLabel} />
          <ChipRow
            values={LANGS}
            selected={user.language}
            onSelect={(value) => user.setLanguage(value)}
            renderLabel={(value) => t(`settings.language.${value}`)}
          />

          {Platform.OS !== 'web' ? (
            <>
              <SectionLabel text={t('settings.backup')} style={[styles.subHeading, subHeadingTone]} />
              <Text style={[typography.small, { color: colors.textMuted }]}>
                {t(Platform.OS === 'ios' ? 'settings.backupHint.ios' : 'settings.backupHint.android')}
              </Text>
              {user.taharahEnabled ? (
                <Text style={[typography.small, styles.note, { color: colors.textMuted }]}>
                  {t('settings.backupTaharah')}
                </Text>
              ) : null}
              <PrimaryButton label={t('settings.backupExport')} onPress={exportBackupFile} />
              <PrimaryButton label={t('settings.backupImport')} onPress={chooseBackupFile} />
              {backupStatus ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[
                    typography.small,
                    styles.note,
                    { color: backupStatus.failed ? colors.urgent : colors.textMuted },
                  ]}
                >
                  {backupStatus.text}
                </Text>
              ) : null}
            </>
          ) : null}

          <SectionLabel text={t('settings.app')} style={[styles.subHeading, subHeadingTone]} />
          <Pressable
            onPress={() => setResetVisible(true)}
            accessibilityRole="button"
            style={[styles.dangerBtn, { backgroundColor: colors.urgentBg, borderColor: colors.urgent }]}
          >
            <Text style={[typography.bodyBold, { color: colors.urgent }]}>{t('settings.logout')}</Text>
          </Pressable>

          <Text style={[typography.small, styles.versionText, { color: colors.textMuted }]}>
            {t('settings.version', { version: appVersionLabel() })}
          </Text>
        </SettingsSection>
      </ScrollView>

      <ConfirmDialog
        visible={resetVisible}
        title={t('settings.logoutConfirmTitle')}
        body={t('settings.logoutConfirmBody')}
        confirmLabel={t('settings.logoutConfirmAction')}
        destructive
        busy={resetting}
        onConfirm={performReset}
        onCancel={() => setResetVisible(false)}
      />

      <ConfirmDialog
        visible={pendingBackup !== null}
        title={t('settings.backupConfirmTitle')}
        body={pendingBackup ? t('settings.backupConfirmBody', { date: backupDateLabel(pendingBackup, language) }) : ''}
        confirmLabel={t('settings.backupConfirmAction')}
        destructive
        busy={backupBusy}
        onConfirm={confirmRestore}
        onCancel={() => setPendingBackup(null)}
      />
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, styles.statusRow]}>
      <Text style={[typography.bodyBold, { color: colors.text }]}>{label}</Text>
      <Text style={[typography.body, { color: colors.goldText }]}>{value}</Text>
    </View>
  );
}

type SwitchRowProps = {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  style?: StyleProp<ViewStyle>;
};

function SwitchRow({ label, hint, value, onValueChange, style }: SwitchRowProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.switchRow, style]}>
      <View style={styles.switchMeta}>
        <Text style={[typography.bodyBold, { color: colors.text }]}>{label}</Text>
        <Text style={[typography.small, styles.hint, { color: colors.textMuted }]}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        thumbColor={BRAND.white}
        trackColor={{ false: colors.border, true: colors.gold }}
      />
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.primaryBtn, { backgroundColor: colors.gold }]}
    >
      <Text style={[typography.bodyBold, { color: colors.onGold }]}>{label}</Text>
    </Pressable>
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
  primaryBtn: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRow: {
    marginTop: spacing.md,
  },
  speedRow: {
    marginTop: spacing.lg,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchMeta: {
    flex: 1,
    paddingEnd: spacing.md,
  },
  hint: {
    marginTop: spacing.xs,
  },
  note: {
    marginTop: spacing.sm,
  },
  groupGap: {
    marginTop: spacing.lg,
  },
  fieldLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: 0,
  },
  firstFieldLabel: {
    marginTop: 0,
    marginBottom: spacing.sm,
    paddingHorizontal: 0,
  },
  subHeading: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    paddingTop: spacing.lg,
    paddingHorizontal: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  firstSubHeading: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  mitzvotCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  mitzvotRow: {
    borderBottomWidth: 0,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  dangerBtn: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionText: {
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
