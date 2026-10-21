import React, { useEffect, useMemo, useState } from 'react';
import { InteractionManager, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { Card } from '@/components/Card';
import { Landscape } from '@/components/Landscape';
import { NavBar } from '@/components/NavBar';
import { HeaderPill } from '@/components/ScreenHeader';
import { SectionLabel } from '@/components/SectionLabel';
import { StreakRing } from '@/components/StreakRing';
import { useDayModel } from '@/hooks/useDayModel';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { enabledSinceOf, useMitzvotStore } from '@/stores/useMitzvotStore';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { computeStats, HistoryStats, isTrackedInRange } from '@/utils/historyStats';
import { nextStreakGoal } from '@/utils/streakGoal';
import { useI18n } from '@/i18n';

const HISTORY_DAYS = 30;
const GRID_COLUMNS = 5;
const GRID_CELL_HEIGHT = 40;
const HERO_HEIGHT = 320;
const RING_SIZE = 220;
const BAR_HEIGHT = 6;

const EMPTY_STATS: HistoryStats = {
  streak: 0,
  daily: [],
  perMitzvah: {},
  missedYesterday: [],
};

type DayStat = HistoryStats['daily'][number];

export default function HistoryScreen() {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { enabled, location, settings, nameFor } = useDayModel();
  const router = useRouter();
  const activeMap = useMitzvotStore((s) => s.activeMitzvot);
  const completions = useCompletionsStore((s) => s.completions);
  const checkIns = useCompletionsStore((s) => s.checkIns);
  const archivedDays = useCompletionsStore((s) => s.archivedDays);
  const skipped = useCompletionsStore((s) => s.skipped);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [statsReady, setStatsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatsReady(false);
    const task = InteractionManager.runAfterInteractions(() => {
      const next = computeStats(enabled, completions, location, settings, HISTORY_DAYS, new Date(), {
        checkIns,
        archivedDays,
        skipped,
        enabledSince: enabledSinceOf(activeMap),
      });
      if (!cancelled) {
        setStats(next);
        setStatsReady(true);
      }
    });
    return () => {
      cancelled = true;
      task.cancel?.();
    };
  }, [enabled, completions, checkIns, archivedDays, skipped, activeMap, location, settings]);

  const byMitzvah = useMemo(
    () =>
      enabled
        .flatMap((mitzvah) => {
          const stat = stats.perMitzvah[mitzvah.id];
          return stat && isTrackedInRange(stat) ? [{ mitzvah, stat }] : [];
        })
        .sort((a, b) => a.stat.percent - b.stat.percent),
    [enabled, stats.perMitzvah],
  );

  const nameForId = (id: string) => {
    const mitzvah = enabled.find((item) => item.id === id);
    return mitzvah ? nameFor(mitzvah) : id;
  };

  const goal = nextStreakGoal(stats.streak);
  const remaining = goal - stats.streak;
  const goalCaption = t(remaining === 1 ? 'history.goalCaption.once' : 'history.goalCaption', {
    count: remaining,
    goal,
  });

  const cells: (DayStat | null)[] = statsReady ? stats.daily : Array.from({ length: HISTORY_DAYS }, () => null);
  const rows = Array.from({ length: Math.ceil(cells.length / GRID_COLUMNS) }, (_, row) =>
    cells.slice(row * GRID_COLUMNS, row * GRID_COLUMNS + GRID_COLUMNS),
  );
  const todayKey = stats.daily[stats.daily.length - 1]?.date;

  const renderCell = (day: DayStat | null, index: number) => {
    if (!day) {
      return <View key={index} style={[styles.gridCell, { backgroundColor: colors.surface2 }]} />;
    }
    const decided = day.totalCount - day.pendingCount;
    const percent = decided > 0 ? Math.round((day.doneCount / decided) * 100) : 0;
    const date = DateTime.fromISO(day.date);
    const dateLabel = date.setLocale(language).toFormat(language === 'he' ? 'cccc d LLLL' : 'cccc, LLL d');
    const level = decided <= 0 || day.doneCount <= 0 ? 'none' : day.doneCount >= decided ? 'full' : 'partial';
    const fill = level === 'full' ? colors.gold : level === 'partial' ? colors.goldLight : colors.surface2;
    const ink = level === 'full' ? colors.onGold : level === 'partial' ? colors.goldText : colors.textSub;
    return (
      <Pressable
        key={day.date}
        testID={`history-day-${day.date}`}
        accessibilityRole="button"
        accessibilityLabel={decided > 0 ? `${dateLabel} · ${t('history.percent', { percent })}` : dateLabel}
        onPress={() => router.push({ pathname: '/day/[date]', params: { date: day.date } })}
        style={[
          styles.gridCell,
          { backgroundColor: fill },
          day.date === todayKey && { borderWidth: 1.5, borderColor: colors.gold },
        ]}
      >
        <Text style={[typography.captionBold, { color: ink }]}>{date.isValid ? date.day : ''}</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <NavBar
        title={t('history.title')}
        actions={
          <HeaderPill
            label={t('report.open')}
            accessibilityLabel={t('report.open')}
            onPress={() => router.push('/report')}
          />
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Landscape height={HERO_HEIGHT} />
          </View>
          <StreakRing streak={stats.streak} size={RING_SIZE} />
          {statsReady ? (
            <Text style={[typography.subheading, styles.goalCaption, { color: colors.text }]}>{goalCaption}</Text>
          ) : null}
        </View>

        <View style={styles.body}>
          <SectionLabel text={t('history.gridTitle')} />
          <View testID="history-grid" style={styles.grid}>
            {rows.map((row, index) => (
              <View key={index} style={styles.gridRow}>
                {row.map(renderCell)}
              </View>
            ))}
          </View>

          <SectionLabel text={t('history.perMitzvah')} />
          <Card divided>
            {byMitzvah.map(({ mitzvah, stat }) => (
              <Pressable
                key={mitzvah.id}
                accessibilityRole="button"
                accessibilityLabel={`${nameFor(mitzvah)}, ${t('history.percent', { percent: stat.percent })}`}
                onPress={() => router.push({ pathname: '/mitzvah/[id]', params: { id: mitzvah.id } })}
                style={styles.statRow}
              >
                <View style={styles.statTop}>
                  <Text style={[typography.bodyBold, styles.statName, { color: colors.text }]} numberOfLines={1}>
                    {nameFor(mitzvah)}
                  </Text>
                  <Text style={[typography.captionBold, { color: colors.goldText }]}>
                    {t('history.percent', { percent: stat.percent })}
                  </Text>
                </View>
                <View style={[styles.barTrack, { backgroundColor: colors.surface2 }]}>
                  <View
                    testID={`history-bar-${mitzvah.id}`}
                    style={[styles.barFill, { width: `${stat.percent}%`, backgroundColor: colors.gold }]}
                  />
                </View>
              </Pressable>
            ))}
            {statsReady && !byMitzvah.length ? (
              <Text style={[typography.body, styles.emptyText, { color: colors.textMuted }]}>{t('history.empty')}</Text>
            ) : null}
          </Card>

          <SectionLabel text={t('history.missedYesterday')} />
          <Card divided>
            {stats.missedYesterday.map((id) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/mitzvah/[id]', params: { id } })}
                style={styles.missRow}
              >
                <Text style={[typography.bodyBold, { color: colors.text }]}>{nameForId(id)}</Text>
              </Pressable>
            ))}
            {!stats.missedYesterday.length ? (
              <Text style={[typography.body, styles.emptyText, { color: colors.textMuted }]}>
                {t('history.noMissedYesterday')}
              </Text>
            ) : null}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  hero: {
    height: HERO_HEIGHT,
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  goalCaption: {
    marginTop: spacing.md,
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: spacing.lg,
  },
  grid: {
    gap: spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  gridCell: {
    flex: 1,
    height: GRID_CELL_HEIGHT,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    padding: spacing.lg,
  },
  statRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statName: {
    flex: 1,
  },
  barTrack: {
    height: BAR_HEIGHT,
    borderRadius: radius.full,
    overflow: 'hidden',
    alignItems: 'flex-start',
  },
  barFill: {
    height: BAR_HEIGHT,
    borderRadius: radius.full,
  },
  missRow: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: 'center',
  },
});
