import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { AppLogo } from '@/components/AppLogo';
import { ONBOARDING_STEPS, OnboardingDots } from '@/components/OnboardingDots';
import { useUserStore } from '@/stores/useUserStore';
import { backupFailureKey, pickBackup, restoreBackup } from '@/services/BackupService';
import { NotificationScheduler, requestNotificationPermissions } from '@/services/NotificationScheduler';
import { reportError } from '@/services/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';

export default function WelcomeScreen() {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();
  const profileName = useUserStore((s) => s.profileName);
  const profilePhone = useUserStore((s) => s.profilePhone);
  const setProfileName = useUserStore((s) => s.setProfileName);
  const setProfilePhone = useUserStore((s) => s.setProfilePhone);
  const [name, setName] = useState(profileName);
  const [phone, setPhone] = useState(profilePhone);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState('');

  // Name and phone are stored locally and used by no feature, so nothing is gained by blocking
  // onboarding on them.
  const submit = () => {
    setProfileName(name.trim());
    setProfilePhone(phone.trim());
    router.push('/onboarding/profile');
  };

  // A new phone with a backup file skips the questions: the restored profile is already onboarded,
  // so the root layout's guard moves on to home once the stores hold it.
  const restore = async () => {
    if (restoring) return;
    setRestoring(true);
    setRestoreError('');
    try {
      const backup = await pickBackup();
      if (!backup) return;
      await restoreBackup(backup);
      if (await requestNotificationPermissions()) {
        await NotificationScheduler.rebuild().catch((rebuildError) => reportError('schedule', rebuildError));
      }
    } catch (restoreFailure) {
      setRestoreError(t(backupFailureKey(restoreFailure)));
    } finally {
      setRestoring(false);
    }
  };

  const inputStyle = {
    backgroundColor: colors.surface2,
    color: colors.text,
    borderColor: colors.border,
    writingDirection: language === 'he' ? 'rtl' : 'ltr',
  } as const;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <AppLogo size={64} />
            <Text style={[typography.display, { color: colors.text, marginTop: spacing.md }]}>
              {t('onboarding.welcomeTitle')}
            </Text>
            <Text style={[typography.body, styles.body, { color: colors.textSub }]}>{t('onboarding.welcomeBody')}</Text>
          </View>

          <View style={styles.form}>
            <Text style={[typography.heading, { color: colors.text }]}>{t('onboarding.registerTitle')}</Text>
            <Text style={[typography.body, styles.registerBody, { color: colors.textSub }]}>
              {t('onboarding.registerBody')}
            </Text>
            <Text style={[typography.captionBold, { color: colors.textSub, marginBottom: spacing.sm }]}>
              {t('settings.profileName')}
            </Text>
            <TextInput
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (error) setError('');
              }}
              placeholder={t('settings.profileNamePlaceholder')}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              style={[styles.input, inputStyle, error ? { borderColor: colors.urgent } : null]}
            />
            {error ? (
              <Text style={[typography.small, { color: colors.urgent, marginTop: spacing.xs }]}>{error}</Text>
            ) : null}

            <Text
              style={[
                typography.captionBold,
                { color: colors.textSub, marginTop: spacing.lg, marginBottom: spacing.sm },
              ]}
            >
              {t('settings.profilePhone')}
            </Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder={t('settings.profilePhonePlaceholder')}
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              style={[styles.input, inputStyle]}
            />
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <OnboardingDots step={0} total={ONBOARDING_STEPS} />
          <Pressable onPress={submit} accessibilityRole="button" style={[styles.cta, { backgroundColor: colors.gold }]}>
            <Text style={[typography.bodyBold, { color: colors.onGold }]}>{t('common.continue')}</Text>
          </Pressable>
          {Platform.OS !== 'web' ? (
            <Pressable
              onPress={restore}
              disabled={restoring}
              accessibilityRole="button"
              accessibilityState={{ disabled: restoring, busy: restoring }}
              style={styles.restore}
            >
              <Text style={[typography.bodyBold, { color: colors.goldText }]}>{t('onboarding.restore')}</Text>
            </Pressable>
          ) : null}
          {restoreError ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[typography.small, styles.restoreError, { color: colors.urgent }]}
            >
              {restoreError}
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    padding: spacing.xl,
  },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingBottom: spacing.lg,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  body: {
    textAlign: 'center',
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  registerBody: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  form: {
    paddingHorizontal: spacing.xs,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  footer: {
    gap: spacing.md,
  },
  restore: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  restoreError: {
    textAlign: 'center',
  },
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
});
