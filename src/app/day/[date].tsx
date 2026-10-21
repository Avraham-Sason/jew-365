import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { Banner } from '@/components/Banner';
import { backIcon, forwardIcon, iconFor } from '@/components/MitzvahIcon';
import { MitzvahCard } from '@/components/MitzvahCard';
import { CounterPill, HeaderPill, ScreenHeader } from '@/components/ScreenHeader';
import { useDayModel } from '@/hooks/useDayModel';
import { Completions, RETENTION_DAYS, useCompletionsStore } from '@/stores/useCompletionsStore';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { buildDayTimeline } from '@/utils/buildDayTimeline';
import { latestCheckIn, pendingCheckInIds } from '@/utils/checkIn';
import { clockRange, formatRemaining } from '@/utils/clock';
import { appDay } from '@/utils/locationDay';
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

  const routeDate = typeof params.date === 'string' ? params.date : '';
  const [dateParam, setDateParam] = useState(routeDate);
  useEffect(() => setDateParam(routeDate), [routeDate]);
  const parsed = useMemo(() => DateTime.fromISO(dateParam).startOf('day'), [dateParam]);
  const valid = Boolean(dateParam.match(/^\d{4}-\d{2}-\d{2}$/)) && parsed.isValid;
  const today = DateTime.fromJSDate(appDay(new Date(), location)).startOf('day');
  const oldest = today.minus({ days: RETENTION_DAYS });
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
  const previousDay = parsed.minus({ days: 1 });
  const nextDay = parsed.plus({ days: 1 });
  const dayLabel = (day: DateTime) =>
    day.setLocale(language).toFormat(language === 'he' ? 'cccc d LLLL' : 'cccc, LLL d');
  const doneCount = items.filter((item) => item.done).length;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={title}
        subtitle={isToday ? t('day.title') : undefined}
        onBack={goBack}
        actions={
          valid ? (
            <>
              <HeaderPill
                icon={backIcon(language)}
                accessibilityLabel={t('day.previous', { date: dayLabel(previousDay) })}
                disabled={previousDay < oldest}
                onPress={() => setDateParam(previousDay.toISODate() ?? dateParam)}
              />
              <HeaderPill
                icon={forwardIcon(language)}
                accessibilityLabel={t('day.next', { date: dayLabel(nextDay) })}
                onPress={() => setDateParam(nextDay.toISODate() ?? dateParam)}
              />
              {items.length ? (
                <CounterPill
                  label={`${doneCount}/${items.length}`}
                  accessibilityLabel={t('common.doneOf', { done: doneCount, total: items.length })}
                />
              ) : null}
            </>
          ) : undefined
        }
      />
      {!valid ? (
        <Text style={[typography.body, { color: colors.urgent, padding: spacing.xl, textAlign: 'center' }]}>
          {t('day.invalid')}
        </Text>
      ) : (
        <ScrollView key={dateParam} contentContainerStyle={styles.content}>
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
                icon={iconFor(enabled.find((mitzvah) => mitzvah.id === item.mitzvahId)?.icon ?? 'custom')}
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
