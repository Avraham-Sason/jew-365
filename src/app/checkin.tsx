import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CompletedRow } from '@/components/CompletedRow';
import { iconFor } from '@/components/MitzvahIcon';
import { MitzvahCard } from '@/components/MitzvahCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionLabel } from '@/components/SectionLabel';
import { useDayModel } from '@/hooks/useDayModel';
import { StorageService } from '@/services/StorageService';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { HolyBlock } from '@/types/zmanim';
import { CHECK_IN_PROMPTED_KEY, checkInFor, checkInLastDay, checkInPhraseKey, latestCheckIn } from '@/utils/checkIn';
import { clockOf } from '@/utils/clock';
import { useI18n } from '@/i18n';

// Marks for the days of a Shabbat / Yom Tov block, written after it ends. The one route allowed to
// write a past day: those days could not be marked while they happened.
export default function CheckInRoute() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { language, nameFor, checkInInput } = useDayModel();
  const router = useRouter();
  const completions = useCompletionsStore((s) => s.completions);
  const skipped = useCompletionsStore((s) => s.skipped);
  const markDone = useCompletionsStore((s) => s.markDone);
  const unmark = useCompletionsStore((s) => s.unmark);
  const finishCheckIn = useCompletionsStore((s) => s.finishCheckIn);

  // The block whose check-in was open on arrival. It stays on screen after the last mark, which
  // finishes the check-in, so the user sees the list complete rather than an empty page.
  const [block] = useState<HolyBlock | null>(() => {
    const open = latestCheckIn(checkInInput());
    return open?.open ? open.block : null;
  });
  const checkIn = useMemo(
    () => (block ? checkInFor(block, { ...checkInInput(), checkIns: {} }, new Date()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- completions and skipped re-run the memo on purpose; checkInInput() reads them from the store
    [block, checkInInput, completions, skipped],
  );

  const checkInId = checkIn?.id;
  useEffect(() => {
    if (checkInId) StorageService.set(CHECK_IN_PROMPTED_KEY, checkInId);
  }, [checkInId]);

  // Leaving with everything marked is the same as "done": nothing is left to remind about.
  const allMarked = Boolean(checkIn?.days.every((day) => day.items.every((item) => item.done)));
  const leaveState = useRef({ id: checkIn?.id, allMarked });
  leaveState.current = { id: checkIn?.id, allMarked };
  useEffect(
    () => () => {
      const { id, allMarked: marked } = leaveState.current;
      if (id && marked) finishCheckIn(id);
    },
    [finishCheckIn],
  );

  // Past the deadline a mark would rewrite a day that is already decided — and revive a broken streak.
  const mark = (id: string, date: Date) => {
    if (!checkIn || Date.now() >= checkIn.deadline.getTime()) {
      close();
      return;
    }
    markDone(id, date);
  };

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  const finish = () => {
    if (checkIn) finishCheckIn(checkIn.id);
    close();
  };

  const title = checkIn ? t('checkin.title', { in: t(checkInPhraseKey(checkIn.block)) }) : t('checkin.empty');
  const deadline = checkIn
    ? t('checkin.deadline', {
        day: DateTime.fromJSDate(checkInLastDay(checkIn.block)).setLocale(language).toFormat('cccc'),
      })
    : '';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={title} subtitle={checkIn ? t('checkin.subtitle', { deadline }) : undefined} onBack={close} />
      {checkIn ? (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            {checkIn.days.map((day) => (
              <View key={day.key} style={styles.day}>
                <SectionLabel
                  text={DateTime.fromJSDate(day.date)
                    .setLocale(language)
                    .toFormat(language === 'he' ? 'cccc · d LLLL' : 'cccc · LLL d')}
                />
                <View style={styles.list}>
                  {day.items
                    .filter((item) => !item.done)
                    .map((item) => (
                      <MitzvahCard
                        key={item.mitzvah.id}
                        icon={iconFor(item.mitzvah.icon)}
                        name={nameFor(item.mitzvah)}
                        timeLeft=""
                        pct={0}
                        hideProgress
                        statusText={t('checkin.pending')}
                        onPress={() => mark(item.mitzvah.id, day.date)}
                        onComplete={() => mark(item.mitzvah.id, day.date)}
                      />
                    ))}
                </View>
                {day.items.some((item) => item.done) ? (
                  <Card divided style={styles.doneGap}>
                    {day.items
                      .filter((item) => item.done)
                      .map((item) => (
                        <CompletedRow
                          key={item.mitzvah.id}
                          name={nameFor(item.mitzvah)}
                          time={clockOf(item.window.start)}
                          onUndo={() => unmark(item.mitzvah.id, day.date)}
                          undoLabel={t('home.undo')}
                        />
                      ))}
                  </Card>
                ) : null}
              </View>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <Button label={t('checkin.finish')} onPress={finish} />
          </View>
        </>
      ) : (
        <Text style={[typography.body, { color: colors.textSub, textAlign: 'center', paddingTop: spacing.xxl }]}>
          {t('checkin.empty')}
        </Text>
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
  day: {
    marginBottom: spacing.lg,
  },
  list: {
    gap: spacing.sm,
  },
  doneGap: {
    marginTop: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
});
