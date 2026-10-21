import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { HDate } from '@hebcal/core';
import { hilulaDateLabel } from '@/data/hilulot';
import { roshChodeshLabel, upcomingRoshChodesh } from '@/data/roshChodesh';
import { Card } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionLabel } from '@/components/SectionLabel';
import { SettingsSection } from '@/components/SettingsSection';
import { useNow } from '@/hooks/useNow';
import { HebcalService } from '@/services/HebcalService';
import { useUserStore } from '@/stores/useUserStore';
import { BRAND } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';

const UPCOMING_COUNT = 6;

export default function RoshChodeshScreen() {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const router = useRouter();
  const location = useUserStore((s) => s.location);
  const enabled = useUserStore((s) => s.roshChodeshEnabled);
  const setEnabled = useUserStore((s) => s.setRoshChodeshEnabled);
  const now = useNow();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'));
  const todayAbs = HebcalService.hebrewDayAt(now, location).abs();
  const upcoming = useMemo(() => upcomingRoshChodesh(new HDate(todayAbs), UPCOMING_COUNT), [todayAbs]);
  const locale = language === 'en' ? 'en' : 'he';

  const whenLabel = (firstAbs: number) => {
    const days = firstAbs - todayAbs;
    if (days <= 0) return t('hilulot.today');
    if (days === 1) return t('hilulot.tomorrow');
    return t('hilulot.inDays', { count: days });
  };

  const dayLabels = (days: HDate[]) => {
    const hebrew = days.map((day) => hilulaDateLabel(day, locale)).join('–');
    const civil = days.map((day) => DateTime.fromJSDate(day.greg()).setLocale(locale).toFormat('ccc d.M')).join('–');
    return `${hebrew} · ${civil}`;
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={t('roshChodesh.title')} subtitle={t('roshChodesh.subtitle')} onBack={goBack} />
      <ScrollView contentContainerStyle={styles.list}>
        <SettingsSection title={t('roshChodesh.notifications')}>
          <View style={styles.switchRow}>
            <Text style={[typography.small, styles.switchHint, { color: colors.textMuted }]}>
              {t('roshChodesh.notificationsHint')}
            </Text>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              accessibilityLabel={t('roshChodesh.notifications')}
              thumbColor={BRAND.white}
              trackColor={{ false: colors.border, true: colors.gold }}
            />
          </View>
        </SettingsSection>
        <SectionLabel text={t('roshChodesh.upcoming')} />
        <Card divided>
          {upcoming.map(({ first, days, month }) => (
            <ListRow
              key={first.abs()}
              icon="moon"
              title={t('roshChodesh.name', { month: roshChodeshLabel(month, language) })}
              caption={dayLabels(days === 2 ? [first, first.next()] : [first])}
              trailing={
                <Text style={[typography.captionBold, { color: colors.goldText }]}>{whenLabel(first.abs())}</Text>
              }
            />
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchHint: {
    flex: 1,
    paddingEnd: spacing.md,
  },
});
