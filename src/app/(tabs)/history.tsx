import React, { useEffect, useMemo, useState } from 'react';
import { InteractionManager, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { NavBar } from '@/components/NavBar';
import { HeaderPill } from '@/components/ScreenHeader';
import { SectionLabel } from '@/components/SectionLabel';
import { useDayModel } from '@/hooks/useDayModel';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { enabledSinceOf, useMitzvotStore } from '@/stores/useMitzvotStore';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { fontFamilies, typography } from '@/theme/typography';
import { computeStats } from '@/utils/historyStats';
import { useI18n } from '@/i18n';

const EMPTY_STATS = {
  streak: 0,
  daily: [] as { date: string; doneCount: number; totalCount: number; pendingCount: number }[],
  perMitzvah: {} as Record<string, { done: number; eligible: number; percent: number }>,
  missedYesterday: [] as string[],
};

function alphaFor(percent: number) {
  if (percent <= 0) return '1A';
  if (percent < 35) return '44';
  if (percent < 70) return '88';
  return 'DD';
}

export default function HistoryScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
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
      const next = computeStats(enabled, completions, location, settings, 30, new Date(), {
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
        .map((mitzvah) => ({
          mitzvah,
          stat: stats.perMitzvah[mitzvah.id] ?? { done: 0, eligible: 0, percent: 0 },
        }))
        .sort((a, b) => a.stat.percent - b.stat.percent),
    [enabled, stats.perMitzvah],
  );

  const nameForId = (id: string) => {
    const mitzvah = enabled.find((item) => item.id === id);
    return mitzvah ? nameFor(mitzvah) : id;
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <NavBar
        title={t('history.title')}
        subtitle={t('history.gridTitle')}
        actions={
          <HeaderPill
            label={t('report.open')}
            accessibilityLabel={t('report.open')}
            onPress={() => router.push('/report')}
          />
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.streakCard, { backgroundColor: colors.headerBg }]}>
          <Text style={[styles.streakNumber, { color: colors.headerAccent }]}>{stats.streak}</Text>
          <Text style={[typography.subheading, { color: colors.headerText }]}>
            {t('history.streak', { count: stats.streak })}
          </Text>
        </View>

        <SectionLabel text={t('history.gridTitle')} />
        <View style={styles.grid}>
          {statsReady
            ? stats.daily.map((day) => {
                const decided = day.totalCount - day.pendingCount;
                const percent = decided > 0 ? Math.round((day.doneCount / decided) * 100) : 0;
                const date = DateTime.fromISO(day.date);
                return (
                  <Pressable
                    key={day.date}
                    onPress={() => router.push({ pathname: '/day/[date]', params: { date: day.date } })}
                    style={[
                      styles.gridCell,
                      {
                        backgroundColor: decided ? `${colors.gold}${alphaFor(percent)}` : colors.surface2,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[typography.micro, { color: percent > 65 ? colors.onGold : colors.textSub }]}>
                      {date.isValid ? date.day : ''}
                    </Text>
                  </Pressable>
                );
              })
            : Array.from({ length: 30 }, (_, index) => (
                <View
                  key={index}
                  style={[styles.gridCell, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                />
              ))}
        </View>

        <SectionLabel text={t('history.perMitzvah')} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {byMitzvah.map(({ mitzvah, stat }) => (
            <Pressable
              key={mitzvah.id}
              onPress={() => router.push({ pathname: '/mitzvah/[id]', params: { id: mitzvah.id } })}
              style={[styles.statRow, { borderBottomColor: colors.border }]}
            >
              <Text style={[typography.bodyBold, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                {nameFor(mitzvah)}
              </Text>
              <Text style={[typography.captionBold, { color: colors.goldText }]}>
                {t('history.percent', { percent: stat.percent })}
              </Text>
            </Pressable>
          ))}
          {!byMitzvah.length ? (
            <Text style={[typography.body, styles.emptyText, { color: colors.textMuted }]}>{t('history.empty')}</Text>
          ) : null}
        </View>

        <SectionLabel text={t('history.missedYesterday')} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {stats.missedYesterday.map((id) => (
            <Pressable
              key={id}
              onPress={() => router.push({ pathname: '/mitzvah/[id]', params: { id } })}
              style={[styles.statRow, { borderBottomColor: colors.border }]}
            >
              <Text style={[typography.bodyBold, { color: colors.text }]}>{nameForId(id)}</Text>
            </Pressable>
          ))}
          {!stats.missedYesterday.length ? (
            <Text style={[typography.body, styles.emptyText, { color: colors.textMuted }]}>
              {t('history.noMissedYesterday')}
            </Text>
          ) : null}
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
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  streakCard: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  streakNumber: {
    fontSize: 54,
    fontFamily: fontFamilies.heebo.black,
    lineHeight: 62,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridCell: {
    width: '15%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  emptyText: {
    padding: spacing.lg,
  },
  statRow: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
});
