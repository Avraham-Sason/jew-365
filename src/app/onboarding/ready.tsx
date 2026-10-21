import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { IconTile } from '@/components/IconTile';
import { ONBOARDING_STEPS, OnboardingDots } from '@/components/OnboardingDots';
import { MITZVOT } from '@/data/mitzvot';
import { NotificationScheduler } from '@/services/NotificationScheduler';
import { reportError } from '@/services/errors';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useUserStore } from '@/stores/useUserStore';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { mitzvahName } from '@/utils/mitzvahName';
import { useI18n } from '@/i18n';

export default function ReadyScreen() {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();
  const setOnboarded = useUserStore((s) => s.setOnboarded);
  const active = useMitzvotStore((s) => s.activeMitzvot);

  const enabledNames = useMemo(
    () =>
      MITZVOT.filter((mitzvah) => active[mitzvah.id]?.enabled)
        .map((mitzvah) => mitzvahName(mitzvah, language))
        .join(' · '),
    [active, language],
  );

  const editMitzvot = () => router.push('/mitzvot');

  const finish = async () => {
    setOnboarded(true);
    await NotificationScheduler.rebuild().catch((error) => reportError('schedule', error));
    router.replace('/(tabs)/home');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.center}>
        <IconTile name="check" tone="accent" size={64} />
        <Text style={[typography.title, { color: colors.text, marginTop: spacing.lg }]}>
          {t('onboarding.readyTitle')}
        </Text>
        <Text style={[typography.body, { color: colors.textSub, textAlign: 'center', marginTop: spacing.sm }]}>
          {t('onboarding.readyBody')}
        </Text>
        <Text style={[typography.captionBold, { color: colors.textSub, marginTop: spacing.xl }]}>
          {t('onboarding.readyList')}
        </Text>
        <Text style={[typography.body, { color: colors.text, textAlign: 'center', marginTop: spacing.xs }]}>
          {enabledNames}
        </Text>
        <Pressable onPress={editMitzvot} accessibilityRole="link" hitSlop={8} style={styles.editLink}>
          <Text style={[typography.bodyBold, { color: colors.goldText }]}>{t('onboarding.readyEdit')}</Text>
        </Pressable>
        <OnboardingDots step={4} total={ONBOARDING_STEPS} style={styles.dots} />
      </ScrollView>
      <Button label={t('onboarding.finish')} onPress={finish} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    padding: spacing.xl,
  },
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  editLink: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  dots: {
    marginTop: spacing.xl,
  },
});
