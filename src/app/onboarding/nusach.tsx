import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { ChoiceRow } from '@/components/ChoiceRow';
import { ONBOARDING_STEPS, OnboardingDots } from '@/components/OnboardingDots';
import { chooseNusach } from '@/stores/taharahOptIn';
import { useUserStore } from '@/stores/useUserStore';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';

const OPTIONS = ['ashkenaz', 'sefard', 'edot_hamizrach', 'chabad'] as const;

export default function NusachScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const selected = useUserStore((s) => s.nusach);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={[typography.title, { color: colors.text }]}>{t('onboarding.nusachTitle')}</Text>
      <Text style={[typography.body, { color: colors.textSub, marginTop: spacing.xs }]}>
        {t('onboarding.nusachBody')}
      </Text>
      <ScrollView contentContainerStyle={styles.list}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('onboarding.nusachTitle')} style={styles.group}>
          {OPTIONS.map((option) => (
            <ChoiceRow
              key={option}
              label={t(`nusach.${option}`)}
              selected={selected === option}
              onPress={() => chooseNusach(option)}
            />
          ))}
        </View>
      </ScrollView>
      <OnboardingDots step={2} total={ONBOARDING_STEPS} style={styles.dots} />
      <Pressable
        onPress={() => router.push('/onboarding/location')}
        accessibilityRole="button"
        style={[styles.cta, { backgroundColor: colors.gold }]}
      >
        <Text style={[typography.bodyBold, { color: colors.onGold }]}>{t('common.continue')}</Text>
      </Pressable>
      <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.backBtn}>
        <Text style={[typography.small, { color: colors.textSub }]}>{t('common.back')}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    padding: spacing.xl,
  },
  list: {
    paddingTop: spacing.lg,
    flexGrow: 1,
  },
  group: {
    gap: spacing.sm,
  },
  dots: {
    marginBottom: spacing.md,
  },
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
});
