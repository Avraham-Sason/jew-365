import React, { useEffect, useMemo, useState } from 'react';
import { InteractionManager, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { MitzvahIcon } from '@/components/MitzvahIcon';
import { HeaderPill, ScreenHeader } from '@/components/ScreenHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { getLocationName } from '@/data/cities';
import { useDayModel } from '@/hooks/useDayModel';
import { HebcalService } from '@/services/HebcalService';
import { Completions, useCompletionsStore } from '@/stores/useCompletionsStore';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { fontFamilies, typography } from '@/theme/typography';
import { buildDayTimeline } from '@/utils/buildDayTimeline';
import { latestCheckIn, pendingCheckInIds } from '@/utils/checkIn';
import { clockOf } from '@/utils/clock';
import { useI18n } from '@/i18n';

const VIEW_MODES = ['day', 'week', 'month'] as const;
type ViewMode = (typeof VIEW_MODES)[number];

const EMPTY_COMPLETIONS = Object.freeze({}) as Completions;

export default function ScheduleScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { enabled, location, language, settings, checkInInput } = useDayModel();
  const router = useRouter();
  const completions = useCompletionsStore((s) => s.completions);
  const [view, setView] = useState<ViewMode>('day');
  const [cursor, setCursor] = useState(DateTime.now());
  const today = DateTime.now().startOf('day');
  const cursorDay = cursor.startOf('day');
  const isSelectedToday = cursorDay.hasSame(today, 'day');
  const isSelectedPast = cursorDay < today;
  const isSelectedFuture = cursorDay > today;
  const dayCompletions = isSelectedFuture ? EMPTY_COMPLETIONS : completions;

  const dayItems = useMemo(() => {
    if (view !== 'day') return [];
    const date = cursor.startOf('day').toJSDate();
    return buildDayTimeline(date, enabled, dayCompletions, location, settings, language, t);
  }, [view, enabled, dayCompletions, cursor, location, settings, language, t]);

  const checkIns = useCompletionsStore((s) => s.checkIns);
  const skipped = useCompletionsStore((s) => s.skipped);
  const pendingIds = useMemo(() => {
    if (view !== 'day') return new Set<string>();
    return pendingCheckInIds(latestCheckIn(checkInInput()), cursor.toISODate() ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- completions, skipped and checkIns re-run the memo on purpose; checkInInput() reads them from the store
  }, [view, checkInInput, completions, skipped, checkIns, cursor]);

  const weekDays = useMemo(() => {
    if (view !== 'week') return [];
    // Luxon's startOf('week') is ISO (Monday). The month grid and the weekday header are Sunday-first,
    // and a Hebrew calendar week must end on Shabbat.
    const start = cursor.startOf('day').minus({ days: cursor.weekday % 7 });
    return Array.from({ length: 7 }, (_, index) => {
      const day = start.plus({ days: index });
      const items = buildDayTimeline(day.toJSDate(), enabled, completions, location, settings, language, t).filter(
        (item) => item.type === 'mitzvah',
      );
      const count = items.length;
      const holidays = HebcalService.getHolidays(day.toJSDate(), location);
      return { day, count, holidays, items: items.slice(0, 4) };
    });
  }, [view, enabled, completions, cursor, location, settings, language, t]);

  // 42 cells × (hebcal calendar + zmanim + every window) on the render thread. Deferred behind
  // InteractionManager the way the history screen already does, so switching to the month is not a freeze.
  const [monthReady, setMonthReady] = useState(false);
  useEffect(() => {
    if (view !== 'month') {
      setMonthReady(false);
      return undefined;
    }
    const task = InteractionManager.runAfterInteractions(() => setMonthReady(true));
    return () => task.cancel?.();
  }, [view]);

  const monthGrid = useMemo(() => {
    if (view !== 'month' || !monthReady) return [];
    const monthStart = cursor.startOf('month');
    const gridStart = monthStart.minus({ days: monthStart.weekday % 7 });
    return Array.from({ length: 42 }, (_, index) => {
      const day = gridStart.plus({ days: index });
      const holidays = HebcalService.getHolidays(day.toJSDate(), location);
      const hebrew = HebcalService.getHebrewDate(day.toJSDate());
      const openCount = buildDayTimeline(day.toJSDate(), enabled, completions, location, settings, language, t).filter(
        (item) => item.type === 'mitzvah' && !item.done,
      ).length;
      return {
        day,
        inMonth: day.month === cursor.month,
        holidays,
        hebrewDay: hebrew.day,
        openCount,
      };
    });
  }, [view, monthReady, cursor, enabled, completions, location, settings, language, t]);

  const monthWeeks = useMemo(
    () => Array.from({ length: monthGrid.length / 7 }, (_, row) => monthGrid.slice(row * 7, row * 7 + 7)),
    [monthGrid],
  );

  const highlightIndex = useMemo(() => {
    if (!isSelectedToday) return -1;
    const nowMs = Date.now();
    return dayItems.findIndex((item, index) => {
      const next = dayItems[index + 1];
      return nowMs >= item.time.getTime() && (!next || nowMs < next.time.getTime());
    });
  }, [isSelectedToday, dayItems]);

  const subtitle = `${cursor.setLocale(language).toFormat(language === 'he' ? 'd LLLL yyyy' : 'LLL d, yyyy')} · ${getLocationName(location, language)}`;
  const prevArrow = language === 'he' ? '→' : '←';
  const nextArrow = language === 'he' ? '←' : '→';
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={t('schedule.title')} subtitle={subtitle} onBack={goBack}>
        <SegmentedControl
          tone="header"
          options={VIEW_MODES.map((value) => ({ value, label: t(`schedule.${value}`) }))}
          value={view}
          onChange={setView}
          style={styles.viewToggle}
        />
        <View style={styles.navRow}>
          <HeaderPill
            label={prevArrow}
            onPress={() => setCursor((prev) => shift(prev, view, -1))}
            accessibilityLabel={t('common.previous')}
          />
          <Text style={[typography.captionBold, { color: colors.headerText }]}>
            {view === 'month'
              ? t(`month.${cursor.month - 1}`)
              : cursor.setLocale(language).toFormat(language === 'he' ? 'cccc d LLL' : 'ccc LLL d')}
          </Text>
          <HeaderPill
            label={nextArrow}
            onPress={() => setCursor((prev) => shift(prev, view, 1))}
            accessibilityLabel={t('common.next')}
          />
        </View>
      </ScreenHeader>

      {view === 'day' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {dayItems.map((item, index) => {
            const highlight = index === highlightIndex;
            const waiting =
              item.type === 'mitzvah' && !item.done && Boolean(item.mitzvahId && pendingIds.has(item.mitzvahId));
            const missed = isSelectedPast && item.type === 'mitzvah' && !item.done && !waiting;
            const rowUrgent = missed || (isSelectedToday && item.urgent);
            const statusText =
              item.type === 'mitzvah'
                ? waiting
                  ? t('checkin.pending')
                  : missed
                    ? t('day.missed')
                    : isSelectedPast && item.done
                      ? t('state.completed')
                      : isSelectedFuture
                        ? t('day.scheduled')
                        : undefined
                : undefined;
            const statusColor = missed ? colors.urgent : item.done ? colors.safe : colors.textMuted;
            return (
              <Pressable
                key={item.id}
                onPress={() =>
                  item.mitzvahId &&
                  router.push(
                    item.mitzvahId.startsWith('custom_')
                      ? { pathname: '/custom-mitzvah', params: { id: item.mitzvahId } }
                      : `/mitzvah/${item.mitzvahId}`,
                  )
                }
                disabled={!item.mitzvahId}
                style={[
                  styles.timelineRow,
                  {
                    backgroundColor: highlight ? `${colors.gold}09` : colors.surface,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                {highlight ? <View style={[styles.nowLine, { backgroundColor: colors.urgent }]} /> : null}
                <Text style={[typography.small, styles.timeCol, { color: colors.textMuted }]}>
                  {clockOf(item.time)}
                </Text>
                <View style={styles.dotCol}>
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: item.done
                          ? colors.gold
                          : rowUrgent
                            ? colors.urgent
                            : item.type === 'zman'
                              ? 'transparent'
                              : colors.textMuted,
                        borderColor: item.done
                          ? colors.gold
                          : rowUrgent
                            ? colors.urgent
                            : item.type === 'zman'
                              ? colors.border
                              : colors.textSub,
                      },
                    ]}
                  />
                </View>
                <View style={styles.rowMeta}>
                  <Text
                    style={[
                      typography.body,
                      {
                        color: item.done
                          ? colors.textMuted
                          : rowUrgent
                            ? colors.urgent
                            : item.type === 'zman'
                              ? colors.textSub
                              : colors.text,
                        fontFamily: item.type === 'mitzvah' ? fontFamilies.heebo.semibold : fontFamilies.heebo.regular,
                        textDecorationLine: item.done ? 'line-through' : 'none',
                      },
                    ]}
                  >
                    {item.name}
                  </Text>
                  {statusText ? (
                    <Text
                      style={[
                        typography.micro,
                        styles.statusText,
                        { color: statusColor, fontFamily: fontFamilies.heebo.semibold },
                      ]}
                    >
                      {statusText}
                    </Text>
                  ) : null}
                </View>
                {item.type === 'mitzvah' && (isSelectedToday || item.done) ? (
                  <View
                    style={[
                      styles.trailing,
                      {
                        backgroundColor: item.done ? colors.gold : 'transparent',
                        borderColor: item.done ? colors.gold : rowUrgent ? colors.urgent : colors.border,
                      },
                    ]}
                  >
                    {item.done ? <MitzvahIcon name="check" size={12} color={colors.onGold} /> : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
          {!dayItems.length ? (
            <Text style={[typography.body, styles.emptyText, { color: colors.textSub }]}>{t('schedule.noItems')}</Text>
          ) : null}
        </ScrollView>
      ) : null}

      {view === 'week' ? (
        <ScrollView horizontal contentContainerStyle={styles.weekWrap} showsHorizontalScrollIndicator={false}>
          {weekDays.map(({ day, count, holidays, items }) => (
            <Pressable
              key={day.toISODate()}
              onPress={() => router.push({ pathname: '/day/[date]', params: { date: day.toISODate() ?? '' } })}
              style={[
                styles.weekCard,
                {
                  backgroundColor: day.hasSame(DateTime.now(), 'day') ? colors.goldLight : colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[typography.captionBold, { color: colors.text }]}>
                {t(`weekday.short.${day.weekday % 7}`)}
              </Text>
              <Text style={[typography.title, styles.weekDayNumber, { color: colors.text }]}>{day.day}</Text>
              <Text style={[typography.small, styles.weekCount, { color: colors.textMuted }]}>
                {t('schedule.weekCount', { count })}
              </Text>
              <View style={styles.weekDots}>
                {Array.from({ length: Math.min(4, count) }).map((_, index) => (
                  <View key={index} style={[styles.weekDot, { backgroundColor: colors.gold }]} />
                ))}
              </View>
              {items.length ? (
                <View style={styles.weekPreview}>
                  {items.map((item) => (
                    <Text
                      key={item.id}
                      style={[typography.micro, styles.weekPreviewText, { color: colors.textSub }]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                  ))}
                </View>
              ) : null}
              {holidays.length ? (
                <Text style={[typography.micro, styles.weekHoliday, { color: colors.urgent }]} numberOfLines={2}>
                  {holidays[0]}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {view === 'month' ? (
        <ScrollView contentContainerStyle={styles.monthWrap}>
          <View style={styles.monthRow}>
            {Array.from({ length: 7 }).map((_, index) => (
              <Text key={index} style={[typography.micro, styles.monthHeaderCell, { color: colors.textMuted }]}>
                {t(`weekday.short.${index}`)}
              </Text>
            ))}
          </View>
          {monthWeeks.map((week) => (
            <View key={week[0].day.toISODate()} style={styles.monthRow}>
              {week.map((cell) => (
                <Pressable
                  key={cell.day.toISODate()}
                  onPress={() => router.push({ pathname: '/day/[date]', params: { date: cell.day.toISODate() ?? '' } })}
                  style={[
                    styles.monthCell,
                    {
                      backgroundColor: cell.day.hasSame(DateTime.now(), 'day') ? `${colors.gold}18` : colors.surface,
                      borderColor: colors.border,
                      opacity: cell.inMonth ? 1 : 0.45,
                    },
                  ]}
                >
                  <View style={styles.monthBadgeRow}>
                    {cell.openCount > 0 ? (
                      <View style={[styles.monthBadge, { backgroundColor: colors.gold }]}>
                        <Text style={[typography.micro, { color: colors.onGold, fontFamily: fontFamilies.heebo.bold }]}>
                          {cell.openCount}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[typography.captionBold, { color: colors.text }]}>{cell.day.day}</Text>
                  <Text style={[typography.micro, { color: colors.textMuted }]}>{cell.hebrewDay}</Text>
                  {cell.holidays.length ? <View style={[styles.ping, { backgroundColor: colors.urgent }]} /> : null}
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function shift(value: DateTime, mode: ViewMode, amount: number) {
  if (mode === 'month') return value.plus({ months: amount });
  if (mode === 'week') return value.plus({ weeks: amount });
  return value.plus({ days: amount });
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  viewToggle: {
    marginBottom: spacing.md,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  nowLine: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 2,
  },
  timeCol: {
    width: 40,
  },
  dotCol: {
    width: 14,
    alignItems: 'center',
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  rowMeta: {
    flex: 1,
  },
  statusText: {
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    paddingTop: spacing.xxl,
  },
  trailing: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  weekCard: {
    width: 120,
    minHeight: 160,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
  },
  weekDayNumber: {
    marginTop: spacing.sm,
  },
  weekCount: {
    marginTop: spacing.sm,
  },
  weekHoliday: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  weekDots: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  weekDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  weekPreview: {
    width: '100%',
    marginTop: spacing.md,
    gap: 2,
  },
  weekPreviewText: {
    textAlign: 'center',
  },
  monthWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  monthRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  monthHeaderCell: {
    flex: 1,
    textAlign: 'center',
  },
  monthCell: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.xs,
  },
  monthBadgeRow: {
    height: 16,
    alignItems: 'flex-end',
  },
  monthBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  ping: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    marginTop: 'auto',
  },
});
