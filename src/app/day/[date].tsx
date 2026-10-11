import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { Banner } from '@/components/Banner';
import { MitzvahCard } from '@/components/MitzvahCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useDayModel } from '@/hooks/useDayModel';
import { Completions, useCompletionsStore } from '@/stores/useCompletionsStore';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { buildDayTimeline } from '@/utils/buildDayTimeline';
import { latestCheckIn, pendingCheckInIds } from '@/utils/checkIn';
import { clockRange, formatRemaining } from '@/utils/clock';
import { useI18n } from '@/i18n';

const EMPTY_COMPLETIONS = Object.freeze({}) as Completions;

export default function DayRoute() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { enabled, location, language, settings, checkInInput } = useDayModel();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const completions = useCompletionsStore((s) => s.completions);
  const markDone = useCompletionsStore((s) => s.markDone);

  const dateParam = typeof params.date === 'string' ? params.date : '';
  const parsed = useMemo(() => DateTime.fromISO(dateParam).startOf('day'), [dateParam]);
  const valid = Boolean(dateParam.match(/^\d{4}-\d{2}-\d{2}$/)) && parsed.isValid;
  const today = DateTime.now().startOf('day');
  const isToday = valid && parsed.hasSame(today, 'day');
  const isPast = valid && parsed < today;
  const isFuture = valid && parsed > today;
  const readOnly = valid && !isToday;

  const date = useMemo(() => (valid ? parsed.toJSDate() : new Date()), [valid, parsed]);
  const displayCompletions = isFuture ? EMPTY_COMPLETIONS : completions;
  const items = useMemo(
    () =>
      valid
        ? buildDayTimeline(date, enabled, displayCompletions, location, settings, language, t).filter(
            (item) => item.type === 'mitzvah',
          )
        : [],
    [valid, date, enabled, displayCompletions, location, settings, language, t],
  );

  const checkIns = useCompletionsStore((s) => s.checkIns);
  const skipped = useCompletionsStore((s) => s.skipped);
  // A Shabbat / Yom Tov day is marked in its check-in, never here: past days stay read-only.
  const pending = useMemo(() => {
    if (!valid) return new Set<string>();
    return pendingCheckInIds(latestCheckIn(checkInInput()), dateParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- completions, skipped and checkIns re-run the memo on purpose; checkInInput() reads them from the store
  }, [valid, checkInInput, completions, skipped, checkIns, dateParam]);

  const title = valid
    ? parsed.setLocale(language).toFormat(language === 'he' ? 'cccc d LLLL yyyy' : 'cccc, LLL d yyyy')
    : t('day.title');
  const bannerText = isPast ? t('day.readOnlyBanner') : isFuture ? t('day.futureReadOnlyBanner') : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={title} subtitle={isToday ? t('day.title') : undefined} onBack={() => router.back()} />
      {!valid ? (
        <Text style={[typography.body, { color: colors.urgent, padding: spacing.xl, textAlign: 'center' }]}>
          {t('day.invalid')}
        </Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {pending.size ? (
            <Banner tone="accent" text={t('day.pendingBanner')} onPress={() => router.push('/checkin')} />
          ) : bannerText ? (
            <Banner tone="info" text={bannerText} />
          ) : null}
          {items.map((item) => {
            const totalMs = item.windowEnd ? item.windowEnd.getTime() - item.time.getTime() : 1;
            const remainingMs = item.windowEnd ? item.windowEnd.getTime() - Date.now() : 0;
            const pct = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
            const timeRange = clockRange(item.time, item.windowEnd ?? item.time, t);
            const waiting = !item.done && Boolean(item.mitzvahId && pending.has(item.mitzvahId));
            const missed = isPast && !item.done && !waiting;
            const statusText = waiting
              ? t('checkin.pending')
              : missed
                ? t('day.missed')
                : isFuture
                  ? timeRange
                  : undefined;
            return (
              <MitzvahCard
                key={item.id}
                name={item.name}
                timeLeft={missed ? t('day.missed') : isFuture ? timeRange : formatRemaining(remainingMs, t)}
                pct={missed ? 0 : pct}
                urgent={missed || (isToday && item.urgent)}
                done={item.done}
                readOnly={readOnly}
                statusText={statusText}
                statusTone={missed ? 'urgent' : 'muted'}
                hideProgress={!isToday}
                onComplete={isToday ? () => item.mitzvahId && markDone(item.mitzvahId, date) : undefined}
                onPress={() =>
                  item.mitzvahId && router.push({ pathname: '/mitzvah/[id]', params: { id: item.mitzvahId } })
                }
              />
            );
          })}
          {!items.length ? (
            <Text style={[typography.body, { color: colors.textSub, textAlign: 'center', paddingTop: spacing.xxl }]}>
              {t('day.noItems')}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
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
});
