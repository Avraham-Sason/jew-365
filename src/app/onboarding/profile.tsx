import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChoiceRow } from '@/components/ChoiceRow';
import { ONBOARDING_STEPS, OnboardingDots } from '@/components/OnboardingDots';
import { SectionLabel } from '@/components/SectionLabel';
import { chooseGender, chooseMaritalStatus, setTaharahTracking, taharahOffered } from '@/stores/taharahOptIn';
import { useUserStore } from '@/stores/useUserStore';
import { BRAND } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';

const GENDERS = ['male', 'female'] as const;
const MARITAL_STATUSES = ['married', 'single'] as const;

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const gender = useUserStore((s) => s.gender);
  const maritalStatus = useUserStore((s) => s.maritalStatus);
  const taharahEnabled = useUserStore((s) => s.taharahEnabled);
  const complete = gender !== null && maritalStatus !== null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={[typography.title, { color: colors.text }]}>{t('onboarding.profileTitle')}</Text>
      <Text style={[typography.body, { color: colors.textSub, marginTop: spacing.xs }]}>
        {t('onboarding.profileBody')}
      </Text>
      <ScrollView contentContainerStyle={styles.list}>
        <SectionLabel variant="field" text={t('profile.gender')} style={styles.groupLabel} />
        <View accessibilityRole="radiogroup" accessibilityLabel={t('profile.gender')} style={styles.group}>
          {GENDERS.map((option) => (
            <ChoiceRow
              key={option}
              label={t(`profile.gender.${option}`)}
              selected={gender === option}
              onPress={() => chooseGender(option)}
            />
          ))}
        </View>

        <SectionLabel variant="field" text={t('profile.maritalStatus')} style={[styles.groupLabel, styles.groupGap]} />
        <View accessibilityRole="radiogroup" accessibilityLabel={t('profile.maritalStatus')} style={styles.group}>
          {MARITAL_STATUSES.map((option) => (
            <ChoiceRow
              key={option}
              label={t(`profile.maritalStatus.${option}.${gender ?? 'neutral'}`)}
              selected={maritalStatus === option}
              onPress={() => chooseMaritalStatus(option)}
            />
          ))}
        </View>

        {taharahOffered({ gender, maritalStatus }) ? (
          <Card padded style={[styles.optIn, { backgroundColor: colors.goldLight }]}>
            <Text style={[typography.subheading, { color: colors.text }]}>
              {t(gender === 'female' ? 'taharah.optIn.woman.title' : 'taharah.optIn.husband.title')}
            </Text>
            <Text style={[typography.small, { color: colors.textSub, marginTop: spacing.xs }]}>
              {t(gender === 'female' ? 'taharah.optIn.woman.body' : 'taharah.optIn.husband.body')}
            </Text>
            <View style={styles.switchRow}>
              <Text style={[typography.bodyBold, styles.switchLabel, { color: colors.text }]}>
                {t('taharah.optIn.toggle')}
              </Text>
              <Switch
                value={taharahEnabled}
                onValueChange={setTaharahTracking}
                thumbColor={BRAND.white}
                trackColor={{ false: colors.border, true: colors.gold }}
              />
            </View>
            <Text style={[typography.small, { color: colors.textMuted, marginTop: spacing.md }]}>
              {t('taharah.disclaimer')}
            </Text>
          </Card>
        ) : null}
      </ScrollView>
      <OnboardingDots step={1} total={ONBOARDING_STEPS} style={styles.dots} />
      <Button label={t('common.continue')} onPress={() => router.push('/onboarding/nusach')} disabled={!complete} />
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
    gap: spacing.sm,
    flexGrow: 1,
  },
  group: {
    gap: spacing.sm,
  },
  groupLabel: {
    marginBottom: 0,
  },
  groupGap: {
    marginTop: spacing.md,
  },
  optIn: {
    marginTop: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  switchLabel: {
    flex: 1,
    paddingEnd: spacing.md,
  },
  dots: {
    marginBottom: spacing.md,
  },
  backBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
});
