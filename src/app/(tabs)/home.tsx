import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Banner, BannerTone } from '@/components/Banner';
import { BottomSheet, SheetAction } from '@/components/BottomSheet';
import { CompletedRow } from '@/components/CompletedRow';
import { IconTile } from '@/components/IconTile';
import { ListRow } from '@/components/ListRow';
import { iconFor } from '@/components/MitzvahIcon';
import { MitzvahCard } from '@/components/MitzvahCard';
import { NavBar } from '@/components/NavBar';
import { SectionLabel } from '@/components/SectionLabel';
import { useDayModel } from '@/hooks/useDayModel';
import { useNow } from '@/hooks/useNow';
import { getLocationName } from '@/data/cities';
import { hasSiddurText, siddurPlace } from '@/data/siddur';
import { HebcalService } from '@/services/HebcalService';
import { StorageService } from '@/services/StorageService';
import { CompletionService } from '@/services/CompletionService';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { useTaharahStore } from '@/stores/useTaharahStore';
import { useUserStore } from '@/stores/useUserStore';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/theme/ThemeProvider';
import { useQuietBlock } from '@/components/ShabbatScreen';
import { shadowPresets, shadowStyle } from '@/theme/shadowStyle';
import { fontFamilies, typography } from '@/theme/typography';
import { durations, radius, spacing } from '@/theme/tokens';
import { clockOf, formatRemaining } from '@/utils/clock';
import { isSkippedAt } from '@/utils/skipRules';
import { checkInLastDay, checkInPhraseKey, latestCheckIn, overlapsBlock } from '@/utils/checkIn';
import { ComputeContext, Mitzvah, MitzvahWindow, UserSettings } from '@/types/mitzvah';
import { TaharahEvent, TaharahSettings } from '@/types/taharah';
import { Location } from '@/types/zmanim';
import { deriveCycle } from '@/utils/taharah/cycle';
import { currentOnah } from '@/utils/taharah/onot';
import { renderHint, stageHint, visibleStage } from '@/utils/taharah/summary';
import { taharahTasksFor } from '@/utils/taharah/tasks';
import { ZmanimService } from '@/services/ZmanimService';
import {
  NotificationScheduler,
  syncNotificationPermissionStatus,
  dismissCompletedPresentedNotifications,
  refreshSchedulingOnForeground,
} from '@/services/NotificationScheduler';
import { clearLastError, reportError, useLastError } from '@/services/errors';
import { useI18n } from '@/i18n';

type LiveItem = {
  mitzvah: Mitzvah;
  window: Exclude<MitzvahWindow, null>;
  pct: number;
  timeLeft: string;
  urgent: boolean;
  name: string;
  hasText: boolean;
};

const EMPTY_DAY_STATE = Object.freeze({}) as Record<string, number>;
const PROFILE_INTRO_KEY = 'profile:intro-dismissed';

type Translate = (scope: string, options?: Record<string, unknown>) => string;
type BannerSpec = { tone: BannerTone; text: string; onPress?: () => void };
type TaharahCardData = { title: string; caption: string; concealed: boolean };

function taharahCardFor(
  events: readonly TaharahEvent[],
  settings: TaharahSettings,
  location: Location,
  now: Date,
  language: 'he' | 'en',
  t: Translate,
  lockEnabled: boolean,
): TaharahCardData {
  // The session is always locked while home is showing, so the stage and tasks must not leak onto it.
  if (lockEnabled) return { title: t('taharah.home.title'), caption: t('taharah.home.open'), concealed: true };
  const state = deriveCycle(events, settings.rules, location, now);
  const task = taharahTasksFor(now, events, settings, location, now).find((item) => !item.done && item.end > now);
  return {
    concealed: false,
    title: t(`taharah.stage.${visibleStage(state, settings.role, currentOnah(now, location), location)}`),
    caption: task
      ? `${t(`taharah.task.${task.kind}`)} · ${t('taharah.task.until', { time: clockOf(task.end) })}`
      : renderHint(
          stageHint(state, events, settings.rules, settings.role, location, now, {
            date: (civil) => DateTime.fromJSDate(civil).setLocale(language).toFormat('d LLLL'),
            clock: clockOf,
          }),
          t,
        ),
  };
}

function buildContext(date: Date, location: Location, settings: UserSettings): ComputeContext | null {
  const zmanim = ZmanimService.getZmanim(date, location);
  if (!zmanim) return null;
  return { date, location, settings, zmanim };
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const quiet = useQuietBlock() !== null;
  const { t } = useI18n();
  const { allMitzvot, enabled, location, nusach, inIsrael, language, settings, nameFor, checkInInput } = useDayModel();
  const router = useRouter();
  const user = useUserStore(
    useShallow((s) => ({
      locationStatus: s.locationStatus,
      notificationPermission: s.notificationPermission,
    })),
  );
  const isOnboarded = useUserStore((s) => s.isOnboarded);
  const gender = useUserStore((s) => s.gender);
  const maritalStatus = useUserStore((s) => s.maritalStatus);
  const taharahEnabled = useUserStore((s) => s.taharahEnabled);
  const taharahEvents = useTaharahStore((s) => s.events);
  const taharahSettings = useTaharahStore((s) => s.settings);
  const taharahLockEnabled = useTaharahStore((s) => s.lockEnabled);
  const todayKey = CompletionService.getDateKey();
  const doneMap = useCompletionsStore((s) => s.completions[todayKey] ?? EMPTY_DAY_STATE);
  const skippedMap = useCompletionsStore((s) => s.skipped[todayKey] ?? EMPTY_DAY_STATE);
  const completions = useCompletionsStore((s) => s.completions);
  const checkIns = useCompletionsStore((s) => s.checkIns);
  const skipped = useCompletionsStore((s) => s.skipped);
  const [tick, setTick] = useState(0);
  // Only a memo dependency: each tick re-runs the memo, which reads the time itself.
  const tickedAt = useNow();
  const [stampingId, setStampingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lastError = useLastError();
  const [introDismissed, setIntroDismissed] = useState(() => StorageService.get<boolean>(PROFILE_INTRO_KEY) === true);
  const stampTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    current,
    missed,
    completed,
    nextUp,
    totalActive,
    doneCount,
    hebrewTitle,
    subtitle,
    zmanimUnavailable,
    checkIn,
    taharahCard,
  } = useMemo(() => {
    const now = new Date();
    const ctx = buildContext(now, location, settings);
    const hebrew = HebcalService.getHebrewDateAt(now, location);
    const greg = DateTime.fromJSDate(now)
      .setLocale(language)
      .toFormat(language === 'he' ? 'cccc · d LLLL' : 'cccc · LLL d');
    const parasha = HebcalService.getParasha(now, location);
    const subtitleText = [greg, getLocationName(location, language), parasha].filter(Boolean).join(' · ');

    const place = siddurPlace(location, inIsrael);
    const found = latestCheckIn(checkInInput(), now);
    const openCheckIn = found?.open ? found : null;
    const currentItems: LiveItem[] = [];
    const upcomingItems: LiveItem[] = [];
    const missedItems: LiveItem[] = [];
    // Done and skipped share the list, so a skip is visible and has the same undo as a completion.
    const completedItems = [
      ...Object.entries(doneMap).map(([id, ts]) => ({ id, ts, wasSkipped: false })),
      ...Object.entries(skippedMap).map(([id, ts]) => ({ id, ts, wasSkipped: true })),
    ]
      .filter(({ id }) => id !== stampingId)
      .flatMap(({ id, ts, wasSkipped }) => {
        const mitzvah = allMitzvot.find((item) => item.id === id);
        if (!mitzvah) return [];
        return [
          {
            id,
            name: nameFor(mitzvah),
            time: wasSkipped ? t('state.skipped') : clockOf(new Date(ts)),
            timestamp: ts,
            wasSkipped,
          },
        ];
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    // Counts what actually applies today: enabled, has a window, and not skipped for Shabbat/Yom
    // Tov. Using `enabled.length` made Shabbat read "5/6" with everything applicable done.
    let applicable = 0;
    for (const mitzvah of enabled) {
      const window = ctx ? mitzvah.computeWindow(ctx) : null;
      if (!window) continue;
      if (isSkippedAt(mitzvah, window.start, location, settings)) continue;
      applicable += 1;
      const totalMs = window.end.getTime() - window.start.getTime();
      const remainingMs = window.end.getTime() - now.getTime();
      const item: LiveItem = {
        mitzvah,
        window,
        pct: totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0,
        timeLeft: formatRemaining(remainingMs, t),
        urgent: remainingMs <= 45 * 60 * 1000,
        name: nameFor(mitzvah),
        hasText: hasSiddurText(mitzvah, nusach, now, place),
      };
      // The card being stamped stays put until its animation ends, even though the completion is
      // already persisted.
      if ((doneMap[mitzvah.id] || skippedMap[mitzvah.id]) && mitzvah.id !== stampingId) {
        continue;
      }
      if (now > window.end) {
        // Waiting in the check-in of the block that just ended, not missed.
        // Judged by the window itself, not by a date key, which differs once the device's zone is not
        // the location's.
        if (!openCheckIn || !overlapsBlock(window, openCheckIn.block)) missedItems.push(item);
      } else if (now >= window.start && now <= window.end) {
        currentItems.push(item);
      } else if (now < window.start) {
        upcomingItems.push(item);
      }
    }

    currentItems.sort((a, b) => a.window.end.getTime() - b.window.end.getTime());
    upcomingItems.sort((a, b) => a.window.start.getTime() - b.window.start.getTime());
    missedItems.sort((a, b) => b.window.end.getTime() - a.window.end.getTime());

    return {
      current: currentItems,
      missed: missedItems,
      completed: completedItems,
      nextUp: upcomingItems[0] ?? null,
      totalActive: applicable,
      doneCount: completedItems.filter((item) => !item.wasSkipped).length,
      hebrewTitle: hebrew.hebrewDateStr,
      subtitle: subtitleText,
      zmanimUnavailable: !ctx,
      checkIn: openCheckIn,
      taharahCard:
        taharahEnabled && !quiet
          ? taharahCardFor(taharahEvents, taharahSettings, location, now, language, t, taharahLockEnabled)
          : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick and tickedAt re-run the memo on purpose, it reads the clock itself; the completion maps are triggers too, checkInInput() reads them from the store
  }, [
    allMitzvot,
    enabled,
    nameFor,
    checkInInput,
    settings,
    doneMap,
    skippedMap,
    completions,
    skipped,
    checkIns,
    language,
    t,
    location,
    tick,
    stampingId,
    nusach,
    inIsrael,
    taharahEnabled,
    taharahEvents,
    taharahSettings,
    taharahLockEnabled,
    quiet,
    tickedAt,
  ]);

  // Persist first — the stamp is decoration. Deferring the write behind the 1.3s animation meant
  // leaving the screen mid-animation silently discarded the completion, and the `stampingId` gate
  // dropped every other card tapped during it. The card is held on screen while it animates.
  const complete = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    CompletionService.markDone(id).catch(() => {});
    setSelectedId(null);
    setStampingId(id);
    if (stampTimeoutRef.current) clearTimeout(stampTimeoutRef.current);
    stampTimeoutRef.current = setTimeout(() => {
      setStampingId((current) => (current === id ? null : current));
      stampTimeoutRef.current = null;
    }, durations.stamp);
  };

  const skipToday = async (id: string) => {
    await CompletionService.markSkipped(id).catch(() => {});
    setSelectedId(null);
  };

  const undoComplete = async (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    await CompletionService.unmark(id).catch(() => {});
  };

  const openProfileIntro = () => {
    StorageService.set(PROFILE_INTRO_KEY, true);
    setIntroDismissed(true);
    router.push('/(tabs)/settings');
  };

  const pickBanner = (): BannerSpec | null => {
    if (zmanimUnavailable) {
      return { tone: 'warning', text: t('home.zmanimUnavailable'), onPress: () => router.push('/(tabs)/settings') };
    }
    if (user.notificationPermission !== 'granted') {
      return {
        tone: 'urgent',
        text: t('home.notificationsDenied'),
        onPress: () => Linking.openSettings().catch(() => {}),
      };
    }
    if (checkIn) {
      return {
        tone: 'accent',
        text: t('checkin.banner', {
          in: t(checkInPhraseKey(checkIn.block)),
          deadline: t('checkin.deadline', {
            day: DateTime.fromJSDate(checkInLastDay(checkIn.block)).setLocale(language).toFormat('cccc'),
          }),
        }),
        onPress: () => router.push('/checkin'),
      };
    }
    if (user.locationStatus === 'missing') {
      return { tone: 'warning', text: t('home.noLocation'), onPress: () => router.push('/(tabs)/settings') };
    }
    if (user.locationStatus === 'timeout') return { tone: 'warning', text: t('home.gpsTimeout') };
    if (isOnboarded && (gender === null || maritalStatus === null) && !introDismissed) {
      return { tone: 'accent', text: t('home.completeProfile'), onPress: openProfileIntro };
    }
    return null;
  };
  const banner = pickBanner();

  const errorScope = lastError?.scope === 'schedule' || lastError?.scope === 'reset' ? lastError.scope : null;
  const retryLastError = () => {
    clearLastError();
    if (errorScope === 'schedule') NotificationScheduler.rebuild().catch((error) => reportError('schedule', error));
  };

  const openText = (item: LiveItem) =>
    item.hasText
      ? () => router.push({ pathname: '/siddur/[id]', params: { id: item.mitzvah.id, date: todayKey } })
      : undefined;

  const openDetail = (id: string) => {
    if (id.startsWith('custom_')) {
      router.push({ pathname: '/custom-mitzvah', params: { id } });
    } else {
      router.push(`/mitzvah/${id}`);
    }
  };

  const selectedMitzvah = selectedId ? allMitzvot.find((item) => item.id === selectedId) : undefined;
  const selectedName = selectedMitzvah ? nameFor(selectedMitzvah) : undefined;

  useEffect(() => {
    return () => {
      if (stampTimeoutRef.current) {
        clearTimeout(stampTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    syncNotificationPermissionStatus().catch((error) => reportError('schedule', error));
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setTick((value) => value + 1);
        syncNotificationPermissionStatus().catch((error) => reportError('schedule', error));
        dismissCompletedPresentedNotifications().catch(() => {});
        refreshSchedulingOnForeground().catch((error) => reportError('schedule', error));
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <NavBar
        title={hebrewTitle}
        subtitle={subtitle}
        actions={
          <View style={[styles.counter, { backgroundColor: `${colors.headerAccent}22` }]}>
            <Text style={[typography.small, { color: colors.headerAccent, fontFamily: fontFamilies.heebo.bold }]}>
              {doneCount}/{Math.max(totalActive, doneCount)}
            </Text>
          </View>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {errorScope ? (
          <Banner
            tone="warning"
            text={t('home.lastError', { what: t(`errors.scope.${errorScope}`) })}
            onPress={retryLastError}
          />
        ) : null}
        {banner ? <Banner tone={banner.tone} text={banner.text} onPress={banner.onPress} /> : null}

        <SectionLabel text={t('home.relevantNow')} />
        <View style={styles.list}>
          {current.length ? (
            current.map((item, index) => (
              <Animated.View key={item.mitzvah.id} entering={FadeInDown.delay(index * 40).duration(280)}>
                <MitzvahCard
                  icon={iconFor(item.mitzvah.icon)}
                  name={item.name}
                  timeLeft={item.timeLeft}
                  pct={item.pct}
                  urgent={item.urgent}
                  stamping={stampingId === item.mitzvah.id}
                  onComplete={() => complete(item.mitzvah.id)}
                  onOpenText={openText(item)}
                  onPress={() => openDetail(item.mitzvah.id)}
                  onLongPress={() => setSelectedId(item.mitzvah.id)}
                />
              </Animated.View>
            ))
          ) : (
            <View style={styles.emptyWrap}>
              <IconTile name="sparkle" tone="accent" size={48} style={styles.emptyIcon} />
              <Text style={[typography.body, { color: colors.textSub, textAlign: 'center' }]}>
                {doneCount >= totalActive && totalActive > 0 ? t('home.allDone') : t('home.noActive')}
              </Text>
            </View>
          )}
        </View>

        {nextUp ? (
          <View
            style={[
              styles.nextUpCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
              shadowStyle(colors.shadow, shadowPresets.cardSoft),
            ]}
          >
            <ListRow
              icon={iconFor(nextUp.mitzvah.icon)}
              iconTone="muted"
              title={t('home.nextUp')}
              caption={t('home.nextAt', { name: nextUp.name, time: clockOf(nextUp.window.start) })}
              onPress={() => openDetail(nextUp.mitzvah.id)}
              onLongPress={() => setSelectedId(nextUp.mitzvah.id)}
              style={styles.nextUpRow}
            />
          </View>
        ) : null}

        {missed.length ? (
          <>
            <SectionLabel text={t('home.missed')} count={missed.length} />
            <View style={styles.list}>
              {missed.map((item, index) => (
                <Animated.View key={item.mitzvah.id} entering={FadeInDown.delay(index * 30).duration(260)}>
                  <MitzvahCard
                    icon={iconFor(item.mitzvah.icon)}
                    name={item.name}
                    timeLeft=""
                    pct={0}
                    urgent
                    hideProgress
                    statusText={t('home.passedAt', { time: clockOf(item.window.end) })}
                    statusTone="urgent"
                    stamping={stampingId === item.mitzvah.id}
                    onComplete={() => complete(item.mitzvah.id)}
                    onOpenText={openText(item)}
                    onPress={() => openDetail(item.mitzvah.id)}
                    onLongPress={() => setSelectedId(item.mitzvah.id)}
                  />
                </Animated.View>
              ))}
            </View>
          </>
        ) : null}

        {completed.length ? (
          <>
            <SectionLabel text={t('home.completed')} count={completed.length} />
            <View style={[styles.completedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {completed.map((item) => (
                <CompletedRow
                  key={item.id}
                  name={item.name}
                  time={item.time}
                  onPress={() => openDetail(item.id)}
                  onUndo={() => undoComplete(item.id)}
                  undoLabel={t('home.undo')}
                />
              ))}
            </View>
          </>
        ) : null}

        {taharahCard ? (
          <Pressable
            onPress={() => router.push('/taharah')}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.taharahCard,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
              shadowStyle(colors.shadow, shadowPresets.cardSoft),
            ]}
          >
            {taharahCard.concealed ? null : (
              <Text style={[typography.captionBold, styles.cardLabel, { color: colors.textSub }]}>
                {t('taharah.home.title')}
              </Text>
            )}
            <Text style={[typography.heading, { color: colors.text }]}>{taharahCard.title}</Text>
            {taharahCard.caption ? (
              <Text style={[typography.caption, styles.cardCaption, { color: colors.textMuted }]}>
                {taharahCard.caption}
              </Text>
            ) : null}
          </Pressable>
        ) : null}
      </ScrollView>

      <BottomSheet
        visible={Boolean(selectedMitzvah)}
        title={t('home.quick.title')}
        caption={selectedName}
        onClose={() => setSelectedId(null)}
      >
        <SheetAction
          label={t('home.quick.details')}
          onPress={() => {
            if (!selectedId) return;
            setSelectedId(null);
            openDetail(selectedId);
          }}
        />
        <SheetAction
          label={t('home.quick.skipToday')}
          onPress={() => {
            if (!selectedId) return;
            skipToday(selectedId);
          }}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  counter: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  taharahCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  cardLabel: {
    marginBottom: spacing.sm,
  },
  cardCaption: {
    marginTop: spacing.xs,
  },
  nextUpCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  nextUpRow: {
    borderBottomWidth: 0,
    borderRadius: radius.lg,
  },
  list: {
    marginBottom: spacing.sm,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyIcon: {
    marginBottom: spacing.md,
  },
  completedCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
