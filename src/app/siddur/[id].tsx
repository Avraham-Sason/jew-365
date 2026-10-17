import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  FlatList,
  I18nManager,
  LayoutChangeEvent,
  Linking,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import Animated, {
  AnimatedRef,
  FrameInfo,
  runOnJS,
  scrollTo,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { DateTime } from 'luxon';
import Svg, { Path } from 'react-native-svg';
import { findAnyMitzvah } from '@/data/customMitzvotAdapter';
import { CHOK_TEXT_ID, chokAsset, hasChokContent } from '@/data/chok';
import {
  SIDDUR_TEXTS,
  STANDALONE_TEXTS,
  customSiddurText,
  hasSiddurText,
  hasStandaloneText,
  mitzvahTextId,
  siddurPlace,
  standaloneTextDay,
  standaloneTextId,
} from '@/data/siddur';
import { useDayModel } from '@/hooks/useDayModel';
import { useNow } from '@/hooks/useNow';
import { HDate } from '@hebcal/core';
import { loadChokParasha, loadSiddurText } from '@/services/SiddurService';
import { HebcalService } from '@/services/HebcalService';
import { useCompletionsStore, dateKey } from '@/stores/useCompletionsStore';
import { selectActive, useMitzvotStore } from '@/stores/useMitzvotStore';
import {
  PrayerMode,
  SIDDUR_FONT_SIZES,
  SIDDUR_SCROLL_SPEEDS,
  scrollSpeedLevel,
  useUserStore,
} from '@/stores/useUserStore';
import { useTheme } from '@/theme/ThemeProvider';
import { BottomSheet, SheetAction } from '@/components/BottomSheet';
import { ChokWeekControls } from '@/components/ChokWeekControls';
import { MitzvahIcon } from '@/components/MitzvahIcon';
import { HEADER_PILL_BG, ScreenHeader } from '@/components/ScreenHeader';
import { ScrollSpeedStepper } from '@/components/ScrollSpeedStepper';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useQuietBlock } from '@/components/ShabbatScreen';
import { shadowPresets, shadowStyle } from '@/theme/shadowStyle';
import { radius, spacing } from '@/theme/tokens';
import { fontFamilies, typography } from '@/theme/typography';
import { ChokAsset, ChokDoubleChoice, ChokSectionKind, ChokSlot, HaftarahVariant } from '@/types/chok';
import { PassageLabel, Run, SiddurSection, SiddurSegment, SiddurText } from '@/types/siddur';
import {
  OptionalBlock,
  SectionFolds,
  aloneFolds,
  autoScrollPixelsPerSecond,
  dayFeatures,
  forMaritalStatus,
  liturgicalDay,
  pickerEntries,
  pickerEntryAt,
  resolveSiddurText,
  siddurLineHeight,
} from '@/utils/siddur';
import {
  CHOK_SECTION_KINDS,
  CHOK_SLOTS,
  ChokMakeUpFold,
  HAFTARAH_VARIANT,
  chokDoneDay,
  chokOpenMakeUps,
  chokParashaName,
  chokReaderPortion,
  chokSlotDay,
  chokSlotsOf,
  chokText,
  chokToday,
  chokWeekName,
} from '@/utils/chok';
import { currentOrNextWindow } from '@/utils/buildDayTimeline';
import { calendarDay } from '@/utils/checkIn';
import { appDay } from '@/utils/locationDay';
import { translate, useI18n } from '@/i18n';

const KEEP_AWAKE_TAG = 'siddur-reader';
// Native RN swaps physical left/right under RTL (Android and iOS); react-native-web keeps them literal.
const RIGHT_EDGE = I18nManager.isRTL ? ('left' as const) : ('right' as const);
const LEFT_EDGE = I18nManager.isRTL ? ('right' as const) : ('left' as const);
const SECTION_VIEWABILITY = { viewAreaCoveragePercentThreshold: 2 };
const JUMP_RETRY_MS = 50;
const JUMP_TIMEOUT_MS = 5000;
const AUTO_SCROLL_START_MS = 1000;
const AUTO_SCROLL_RESUME_MS = 700;
const AUTO_SCROLL_DRIFT_PX = 24;
const AUTO_SCROLL_MAX_FRAME_MS = 100;
const DONE_ICON_SIZE = 18;
const PIXEL_RATIO = PixelRatio.get();
const PILL_BORDER = 'rgba(255,255,255,0.18)';
const PLAY_PATH = 'M8 5v14l11-7z';
const PAUSE_PATH = 'M6.5 5h4v14h-4zM13.5 5h4v14h-4z';
const PRAYER_MODES = ['minyan', 'alone'] as const;
const CHOK_KIND_NAMES = Object.fromEntries(
  CHOK_SECTION_KINDS.map((kind) => [kind, translate(`chok.kind.${kind}`, undefined, 'en')]),
) as Record<ChokSectionKind, string>;
const CHOK_VARIANT_NAMES: Record<HaftarahVariant, string> = {
  sephardi: translate('chok.haftarahVariant.sephardi', undefined, 'en'),
  ashkenazi: translate('chok.haftarahVariant.ashkenazi', undefined, 'en'),
};
// iOS reports every non-animated scrollTo as the end of a fling, and the JS ScrollView then counts
// itself as animating and swallows the next tap. Moving the contentOffset prop scrolls without that.
const SCROLLS_BY_PROP = Platform.OS === 'ios';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; text: SiddurText }
  | { status: 'chok'; assets: readonly ChokAsset[] }
  | { status: 'error' };

function parseSlotParam(value: string | undefined): ChokSlot | null {
  return CHOK_SLOTS.find((slot) => slot === value) ?? null;
}

function parseDateParam(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = DateTime.fromISO(value);
  return parsed.isValid ? parsed.toJSDate() : null;
}

// A segment is "added today" when its condition names a flag (required, or one of several) that the
// section's other segments do not all share.
function flagsOf(segment: SiddurSegment): string[] {
  return [...(segment.when?.all ?? []), ...(segment.when?.any ?? [])];
}

function isAddedForToday(segment: SiddurSegment, section: SiddurSection): boolean {
  if (segment.when?.omerDay !== undefined) return true;
  const sharedFlags = section.segments
    .map(flagsOf)
    .reduce((shared, flags) => shared.filter((flag) => flags.includes(flag)));
  return flagsOf(segment).some((flag) => !sharedFlags.includes(flag));
}

// Scrolls on the UI thread, so the pace holds while the JS thread renders more sections. A drag, a
// fling or any scroll it did not make itself pauses it, and it resumes from wherever the text was left.
function useAutoScroll(
  listRef: AnimatedRef<FlatList<SiddurSection>>,
  running: boolean,
  pixelsPerSecond: number,
  onDragStart: () => void,
) {
  const speed = useSharedValue(pixelsPerSecond);
  const offset = useSharedValue(0);
  const end = useSharedValue(0);
  const position = useSharedValue(-1);
  const sentPixel = useSharedValue(-1);
  const propOffset = useSharedValue(-1);
  const holdMs = useSharedValue(0);
  const pressed = useSharedValue(false);
  const dragging = useSharedValue(false);
  const flinging = useSharedValue(false);
  const sizes = useRef({ content: 0, viewport: 0 });

  const advance = useCallback(
    (frame: FrameInfo) => {
      'worklet';
      const elapsed = Math.min(frame.timeSincePreviousFrame ?? 0, AUTO_SCROLL_MAX_FRAME_MS);
      if (position.value >= 0 && Math.abs(offset.value - position.value) > AUTO_SCROLL_DRIFT_PX) {
        holdMs.value = Math.max(holdMs.value, AUTO_SCROLL_RESUME_MS);
      }
      const held = pressed.value || dragging.value || flinging.value;
      if (held || holdMs.value > 0) {
        if (!held) holdMs.value -= elapsed;
        position.value = -1;
        return;
      }
      if (position.value < 0) position.value = offset.value;
      if (position.value >= end.value) return;
      position.value = Math.min(end.value, position.value + (speed.value * elapsed) / 1000);
      const pixel = Math.round(position.value * PIXEL_RATIO);
      if (pixel === sentPixel.value) return;
      sentPixel.value = pixel;
      if (SCROLLS_BY_PROP) propOffset.value = pixel / PIXEL_RATIO;
      else scrollTo(listRef, 0, pixel / PIXEL_RATIO, false);
    },
    [listRef, speed, offset, end, position, sentPixel, propOffset, holdMs, pressed, dragging, flinging],
  );
  const frame = useFrameCallback(advance, false);
  const animatedProps = useAnimatedProps<{ contentOffset: { x: number; y: number } }>(() =>
    propOffset.value < 0 ? {} : { contentOffset: { x: 0, y: propOffset.value } },
  );

  useEffect(() => {
    speed.value = pixelsPerSecond;
  }, [speed, pixelsPerSecond]);

  useEffect(() => {
    if (!running) return undefined;
    holdMs.value = AUTO_SCROLL_START_MS;
    position.value = -1;
    frame.setActive(true);
    // Leaving the app mid-touch (the system back or home gesture starts on the list) delivers a drag
    // or fling start with no end, which held the scroll until the next manual drag. Coming back clears
    // every hold and restarts the frame loop.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      pressed.value = false;
      dragging.value = false;
      flinging.value = false;
      holdMs.value = AUTO_SCROLL_START_MS;
      position.value = -1;
      frame.setActive(false);
      frame.setActive(true);
    });
    return () => {
      subscription.remove();
      frame.setActive(false);
    };
  }, [running, frame, holdMs, position, pressed, dragging, flinging]);

  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        offset.value = event.contentOffset.y;
        end.value = Math.max(0, event.contentSize.height - event.layoutMeasurement.height);
      },
      onBeginDrag: () => {
        dragging.value = true;
        flinging.value = false;
        runOnJS(onDragStart)();
      },
      onEndDrag: () => {
        dragging.value = false;
        holdMs.value = AUTO_SCROLL_RESUME_MS;
      },
      onMomentumBegin: () => {
        flinging.value = true;
      },
      // iOS also reports a momentum end after every programmatic scroll, with no begin before it.
      onMomentumEnd: () => {
        if (!flinging.value) return;
        flinging.value = false;
        holdMs.value = AUTO_SCROLL_RESUME_MS;
      },
    },
    [onDragStart],
  );
  const updateEnd = () => {
    end.value = Math.max(0, sizes.current.content - sizes.current.viewport);
  };
  const release = () => {
    pressed.value = false;
    holdMs.value = AUTO_SCROLL_RESUME_MS;
  };
  // react-native-web sends no drag or momentum events, so a touch or a wheel pauses it instead.
  const webInput =
    Platform.OS === 'web'
      ? {
          onWheel: () => {
            holdMs.value = AUTO_SCROLL_RESUME_MS;
          },
          onTouchStart: () => {
            pressed.value = true;
            onDragStart();
          },
          onTouchEnd: release,
          onTouchCancel: release,
        }
      : {};
  return {
    scrollHandler,
    animatedProps: SCROLLS_BY_PROP ? animatedProps : undefined,
    webInput,
    hold: (ms: number) => {
      holdMs.value = ms;
    },
    onLayout: (event: LayoutChangeEvent) => {
      sizes.current.viewport = event.nativeEvent.layout.height;
      updateEnd();
    },
    onContentSizeChange: (_width: number, height: number) => {
      sizes.current.content = height;
      updateEnd();
    },
  };
}

export default function SiddurScreen() {
  const { colors } = useTheme();
  const quiet = useQuietBlock() !== null;
  const { language, t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; date?: string; slot?: string }>();
  const chok = params.id === CHOK_TEXT_ID;
  const mitzvah = useMemo(() => (chok ? undefined : findAnyMitzvah(params.id)), [chok, params.id]);
  const nusach = useUserStore((s) => s.nusach);
  const location = useUserStore((s) => s.location);
  const inIsrael = useUserStore((s) => s.inIsrael);
  const fontSize = useUserStore((s) => s.siddurFontSize);
  const setFontSize = useUserStore((s) => s.setSiddurFontSize);
  const autoScrollOn = useUserStore((s) => s.siddurAutoScroll);
  const setAutoScroll = useUserStore((s) => s.setSiddurAutoScroll);
  const scrollSpeed = useUserStore((s) => s.siddurScrollSpeed);
  const setScrollSpeed = useUserStore((s) => s.setSiddurScrollSpeed);
  const prayerMode = useUserStore((s) => s.prayerMode);
  const setPrayerMode = useUserStore((s) => s.setPrayerMode);
  const maritalStatus = useUserStore((s) => s.maritalStatus);
  const doubleChoice = useUserStore((s) => s.chokDoubleChoice);
  const setDoubleChoice = useUserStore((s) => s.setChokDoubleChoice);
  const standalone = mitzvah || chok ? null : standaloneTextId(params.id);
  const requestedDate = useMemo(() => parseDateParam(params.date), [params.date]);
  const { settings } = useDayModel();
  const windowDate = useMemo(
    () =>
      requestedDate ??
      (mitzvah && currentOrNextWindow(mitzvah, location, settings)?.date) ??
      appDay(new Date(), location),
    [requestedDate, mitzvah, location, settings],
  );
  const mitzvahText = mitzvah && !mitzvah.isCustom ? mitzvahTextId(mitzvah.id) : null;
  const textId = mitzvahText ?? standalone;
  const evening = mitzvahText
    ? SIDDUR_TEXTS[mitzvahText].evening
    : Boolean(standalone && STANDALONE_TEXTS[standalone].evening);
  // A standalone text with no date follows the clock (`standaloneTextDay()`). Keyed by the day
  // number so the 30-second tick re-resolves the text only when the day turns.
  const now = useNow();
  const todayAbs = standalone && !requestedDate ? standaloneTextDay(standalone, now, location).abs() : null;
  const hebrewDay = useMemo(
    () => (todayAbs !== null ? new HDate(todayAbs) : liturgicalDay(windowDate, evening)),
    [todayAbs, windowDate, evening],
  );
  const [chokSlot, setChokSlot] = useState<ChokSlot | null>(() => parseSlotParam(params.slot));
  const chokPortion = useMemo(
    () => (chok ? chokReaderPortion({ now, date: requestedDate, slot: chokSlot }, location, inIsrael) : null),
    [chok, now, requestedDate, chokSlot, location, inIsrael],
  );
  const chokWeekKey = chokPortion ? chokPortion.parashiyot.join('|') : '';
  const chokWeek = useMemo(() => (chokWeekKey ? chokWeekKey.split('|') : []), [chokWeekKey]);
  const shownSlot = chokPortion?.slot ?? null;
  const [asking, setAsking] = useState(false);
  const asked = useRef(false);
  const place = useMemo(() => siddurPlace(location, inIsrael), [location, inIsrael]);
  const features = useMemo(() => dayFeatures(hebrewDay, place), [hebrewDay, place]);
  const available = chok
    ? hasChokContent() && chokWeek.length > 0 && chokWeek.every((parasha) => chokAsset(parasha) !== undefined)
    : standalone
      ? hasStandaloneText(standalone, nusach, features)
      : Boolean(mitzvah && hasSiddurText(mitzvah, nusach, windowDate, place));
  const done = useCompletionsStore((s) => Boolean(mitzvah && s.completions[dateKey(windowDate)]?.[mitzvah.id]));
  const markDone = useCompletionsStore((s) => s.markDone);
  const chokActive = useMitzvotStore(selectActive(CHOK_TEXT_ID));
  const chokMarks = useCompletionsStore((s) => (chok ? s.completions : null));
  const chokTodayKey = useMemo(
    () => (chok ? dateKey(chokToday(now, location, inIsrael)) : ''),
    [chok, now, location, inIsrael],
  );
  const chokTodayDate = useMemo(() => (chokTodayKey ? calendarDay(chokTodayKey) : null), [chokTodayKey]);
  const chokDoneDate =
    chokPortion && chokTodayDate && chokActive.enabled ? chokDoneDay(chokPortion, chokTodayDate) : null;
  const showMakeUps = chokActive.enabled && chokPortion !== null && dateKey(chokSlotDay(chokPortion)) === chokTodayKey;
  const makeUpFolds = useMemo(
    (): ChokMakeUpFold[] =>
      showMakeUps && chokTodayDate && chokMarks
        ? chokOpenMakeUps(chokTodayDate, location, inIsrael, chokMarks, chokActive.enabledAt).map((makeUp) => ({
            dateKey: makeUp.dateKey,
            slot: makeUp.slot,
            label: {
              he: translate('chok.makeUp', { day: translate(`chok.slot.${makeUp.slot}`, undefined, 'he') }, 'he'),
              en: translate('chok.makeUp', { day: translate(`chok.slot.${makeUp.slot}`, undefined, 'en') }, 'en'),
            },
          }))
        : [],
    [showMakeUps, chokTodayDate, chokMarks, location, inIsrael, chokActive.enabledAt],
  );
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const listRef = useAnimatedRef<FlatList<SiddurSection>>();
  const pickerRef = useRef<ScrollView>(null);
  const [shownSection, setShownSection] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [renderingAll, setRenderingAll] = useState(false);
  const jumpMissed = useRef(false);
  const jumpTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Keys of the blocks the reader flipped away from their default (closed, or open for a passage said
  // alone), so a mode switch clears it and every default applies again.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set());
  const toggleBlock = (key: string) =>
    setToggled((flipped) => {
      const next = new Set(flipped);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const isOpen = (key: string, openByDefault = false) => openByDefault !== toggled.has(key);
  const changePrayerMode = (mode: PrayerMode) => {
    setPrayerMode(mode);
    setToggled(new Set());
  };
  const cancelJump = useCallback(() => {
    clearTimeout(jumpTimer.current);
    setRenderingAll(false);
  }, []);
  const onViewableSectionsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<SiddurSection>[] }) => {
    const top = viewableItems[0]?.index;
    if (top != null) setShownSection(top);
  }).current;

  const [focused, setFocused] = useState(true);
  const [screenReader, setScreenReader] = useState(false);

  useEffect(() => {
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
      clearTimeout(jumpTimer.current);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // A screen reader scrolls by page, which a running auto-scroll would cut short. react-native-web
  // always answers that one is on, so only native asks.
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    AccessibilityInfo.isScreenReaderEnabled()
      .then(setScreenReader)
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!available) return undefined;
    if (chok) {
      let active = true;
      setLoad({ status: 'loading' });
      Promise.all(chokWeek.map(loadChokParasha))
        .then((assets) => active && setLoad({ status: 'chok', assets }))
        .catch(() => active && setLoad({ status: 'error' }));
      return () => {
        active = false;
      };
    }
    if (mitzvah?.isCustom) {
      const text = customSiddurText(mitzvah, nusach);
      setLoad(text ? { status: 'ready', text } : { status: 'error' });
      return undefined;
    }
    if (!textId) return undefined;
    let active = true;
    setLoad({ status: 'loading' });
    loadSiddurText(nusach, textId)
      .then((text) => active && setLoad({ status: 'ready', text }))
      .catch(() => active && setLoad({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [mitzvah, available, nusach, textId, attempt, chok, chokWeek]);

  useEffect(() => {
    if (chokWeek.length < 2 || doubleChoice !== null || asked.current) return;
    asked.current = true;
    setAsking(true);
  }, [chokWeek, doubleChoice]);

  const readyText = useMemo(() => {
    if (load.status === 'ready') return load.text;
    if (load.status !== 'chok' || !shownSlot) return null;
    return chokText(load.assets, {
      slot: shownSlot,
      choice: doubleChoice ?? 'first',
      variant: HAFTARAH_VARIANT[nusach],
      kindNames: CHOK_KIND_NAMES,
      variantNames: CHOK_VARIANT_NAMES,
      makeUps: makeUpFolds,
    });
  }, [load, shownSlot, doubleChoice, nusach, makeUpFolds]);

  const sections = useMemo(
    () => (readyText ? forMaritalStatus(resolveSiddurText(readyText, features), maritalStatus) : []),
    [readyText, features, maritalStatus],
  );

  useEffect(() => {
    if (!chok) return;
    setToggled(new Set());
    setShownSection(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [chok, chokWeekKey, shownSlot, doubleChoice, listRef]);

  const hasMinyanPassages = useMemo(
    () => sections.some((section) => section.minyanOnly || section.segments.some((segment) => segment.minyan)),
    [sections],
  );

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'));
  // Done ends the session with the text: mark it, then land on home whatever opened the reader (a
  // home card, the mitzvah screen, a notification on a cold start).
  const finish = (mitzvahId: string, date: Date = windowDate) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    markDone(mitzvahId, date);
    if (router.canDismiss()) {
      router.dismissAll();
      router.navigate('/(tabs)/home');
    } else {
      router.replace('/(tabs)/home');
    }
  };
  const finishMakeUp = (makeUp: ChokMakeUpFold) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    markDone(CHOK_TEXT_ID, calendarDay(makeUp.dateKey));
  };
  const doneTarget = mitzvah
    ? { id: mitzvah.id, date: windowDate, done }
    : chokDoneDate
      ? { id: CHOK_TEXT_ID, date: chokDoneDate, done: Boolean(chokMarks?.[dateKey(chokDoneDate)]?.[CHOK_TEXT_ID]) }
      : null;
  const nameOf = (entry: { he: string; en?: string }) => (language === 'en' && entry.en ? entry.en : entry.he);
  const name = chok
    ? t('chok.title')
    : mitzvah
      ? nameOf(mitzvah.name)
      : standalone
        ? nameOf(STANDALONE_TEXTS[standalone].name)
        : '';
  const hebrewDateLabel = language === 'he' ? hebrewDay.renderGematriya() : hebrewDay.render('en');
  const occasions = HebcalService.getHolidays(hebrewDay.greg(), location, language);
  const subtitle = chokPortion
    ? `${t('chok.parashaOf', { name: chokWeekName(chokPortion.parashiyot, language) })} · ${t(`chok.slot.${chokPortion.slot}`)}`
    : [t(`nusach.${nusach}`), hebrewDateLabel, ...occasions].join(' · ');
  const chooseDouble = (choice: ChokDoubleChoice) => {
    setDoubleChoice(choice);
    setAsking(false);
  };
  const listExtraData = useMemo(
    () => ({ fontSize, language, colors, toggled, prayerMode }),
    [fontSize, language, colors, toggled, prayerMode],
  );
  const titleOf = (titled: { title: { he: string; en: string } }) =>
    language === 'en' ? titled.title.en : titled.title.he;
  const labelOf = (label: PassageLabel) => (language === 'en' ? label.en : label.he);
  const labeledEdge = (language === 'he') === I18nManager.isRTL ? styles.labeledLeftEdge : styles.labeledRightEdge;
  const segmentViews = (section: SiddurSection, segments: SiddurSegment[], start: number, color: string) => {
    const runs: { added: boolean; start: number; segments: SiddurSegment[] }[] = [];
    segments.forEach((segment, offset) => {
      const added = isAddedForToday(segment, section);
      const previous = runs[runs.length - 1];
      if (previous?.added === added) previous.segments.push(segment);
      else runs.push({ added, start: start + offset, segments: [segment] });
    });
    return runs.flatMap((run) => {
      const views = run.segments.map((segment, offset) => (
        <SegmentView
          key={run.start + offset}
          segment={segment}
          fontSize={fontSize}
          showEnglish={language === 'en'}
          color={color}
        />
      ));
      if (!run.added) return views;
      return [
        <View
          key={`added#${run.start}`}
          style={[styles.addedToday, { backgroundColor: colors.goldLight, borderColor: colors.gold }]}
        >
          <Text style={[typography.micro, styles.addedTodayLabel, { color: colors.goldText }]}>
            {t('siddur.addedToday')}
          </Text>
          {views}
        </View>,
      ];
    });
  };
  const minyanViews = (section: SiddurSection, block: OptionalBlock, color: string) =>
    block.minyanBlocks.flatMap((inner) => {
      if (!inner.label) return segmentViews(section, inner.segments, inner.start, color);
      const minyanText = () => segmentViews(section, inner.segments, inner.start, colors.minyan);
      if (!inner.folded) {
        return [
          <View key={`minyan#${inner.start}`} style={[styles.labeledBody, labeledEdge, { borderColor: colors.minyan }]}>
            <Text style={[typography.captionBold, styles.minyanLabel, { color: colors.minyan }]}>
              {labelOf(inner.label)}
            </Text>
            {minyanText()}
          </View>,
        ];
      }
      const key = `minyan:${section.title.he}#${inner.start}`;
      const expanded = isOpen(key);
      return [
        <View key={key}>
          <OptionalToggle
            tone="minyan"
            label={labelOf(inner.label)}
            expanded={expanded}
            onPress={() => toggleBlock(key)}
          />
          {expanded ? (
            <View style={[styles.labeledBody, labeledEdge, { borderColor: colors.minyan }]}>{minyanText()}</View>
          ) : null}
        </View>,
      ];
    });
  const sectionBody = (section: SiddurSection, folds: SectionFolds, color: string) =>
    folds.blocks.flatMap((block) => {
      if (!block.label) return minyanViews(section, block, color);
      const key = `${section.title.he}#${block.start}`;
      const expanded = isOpen(key, block.openByDefault);
      return [
        <View key={key}>
          <OptionalToggle label={labelOf(block.label)} expanded={expanded} onPress={() => toggleBlock(key)} />
          {expanded ? (
            <View style={[styles.labeledBody, labeledEdge, { borderColor: colors.optional }]}>
              {minyanViews(section, block, colors.optional)}
            </View>
          ) : null}
        </View>,
      ];
    });
  const makeUpDone = (section: SiddurSection) => {
    const makeUp = makeUpFolds.find((fold) => fold.label.he === section.title.he);
    if (!makeUp) return null;
    return (
      <Pressable
        onPress={() => finishMakeUp(makeUp)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.doneBtn, { backgroundColor: colors.gold, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={[typography.heading, { color: colors.onGold }]}>
          {t('chok.makeUpDone', { day: t(`chok.slot.${makeUp.slot}`) })}
        </Text>
      </Pressable>
    );
  };
  const optionalSection = (
    section: SiddurSection,
    optional: PassageLabel,
    folds: SectionFolds,
    footer: React.ReactNode = null,
  ) => {
    const expanded = isOpen(section.title.he, folds.optionalOpen);
    return (
      <>
        <OptionalToggle
          large
          label={labelOf(optional)}
          expanded={expanded}
          onPress={() => toggleBlock(section.title.he)}
        />
        {expanded ? (
          <View style={[styles.labeledBody, labeledEdge, { borderColor: colors.optional }]}>
            {sectionBody(section, folds, colors.optional)}
            {footer}
          </View>
        ) : null}
      </>
    );
  };
  const sectionCard = (section: SiddurSection) => {
    const folds = aloneFolds(section, prayerMode);
    if (folds.minyanFolded) {
      const key = `minyan:${section.title.he}`;
      const expanded = isOpen(key);
      return (
        <>
          <OptionalToggle
            large
            tone="minyan"
            label={titleOf(section)}
            caption={t('siddur.minyanOnly')}
            expanded={expanded}
            onPress={() => toggleBlock(key)}
          />
          {expanded ? (
            <View style={[styles.labeledBody, labeledEdge, { borderColor: colors.minyan }]}>
              {section.optional
                ? optionalSection(section, section.optional, folds)
                : sectionBody(section, folds, colors.minyan)}
            </View>
          ) : null}
        </>
      );
    }
    if (section.optional) return optionalSection(section, section.optional, folds, makeUpDone(section));
    return (
      <>
        <Text style={[typography.heading, { color: colors.goldText, marginBottom: spacing.sm }]}>
          {titleOf(section)}
        </Text>
        {sectionBody(section, folds, colors.text)}
      </>
    );
  };
  const picker = useMemo(() => pickerEntries(sections), [sections]);
  const currentEntry = pickerEntryAt(picker, sections, Math.min(shownSection, sections.length - 1));
  const jumpTo = (index: number, deadline = Date.now() + JUMP_TIMEOUT_MS) => {
    const list = listRef.current;
    clearTimeout(jumpTimer.current);
    if (!list) return;
    autoScroll.hold(AUTO_SCROLL_RESUME_MS);
    jumpMissed.current = false;
    list.scrollToIndex({ index, animated: false });
    if (!jumpMissed.current) {
      setShownSection(index);
      setRenderingAll(false);
    } else if (Date.now() < deadline) {
      setRenderingAll(true);
      jumpTimer.current = setTimeout(() => jumpTo(index, deadline), JUMP_RETRY_MS);
    } else {
      setRenderingAll(false);
    }
  };
  const toggleAutoScroll = () => {
    Haptics.selectionAsync().catch(() => {});
    setAutoScroll(!autoScrollOn);
  };
  const sizeIndex = SIDDUR_FONT_SIZES.findIndex((size) => size >= fontSize);
  const currentIndex = sizeIndex === -1 ? SIDDUR_FONT_SIZES.length - 1 : sizeIndex;

  const body = (() => {
    if (!mitzvah && !standalone && !chok) return <Message text={t('errors.generic')} />;
    if (!available) return <Message text={t('siddur.unavailable')} />;
    if (load.status === 'loading') {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
          <Text style={[typography.body, { color: colors.textSub, marginTop: spacing.md }]}>{t('siddur.loading')}</Text>
        </View>
      );
    }
    if (load.status === 'error') {
      return (
        <View style={styles.center}>
          <Text style={[typography.body, { color: colors.textSub }]}>{t('siddur.error')}</Text>
          <Pressable
            onPress={() => setAttempt((value) => value + 1)}
            accessibilityRole="button"
            style={[styles.pill, { backgroundColor: colors.gold, marginTop: spacing.md }]}
          >
            <Text style={[typography.bodyBold, { color: colors.onGold }]}>{t('errors.retry')}</Text>
          </Pressable>
        </View>
      );
    }
    if (!sections.length) return <Message text={t('siddur.unavailable')} />;
    return null;
  })();
  const autoScroll = useAutoScroll(
    listRef,
    autoScrollOn && focused && !screenReader && !body && !pickerOpen && !quiet,
    autoScrollPixelsPerSecond(SIDDUR_SCROLL_SPEEDS[scrollSpeedLevel(scrollSpeed) - 1], fontSize),
    cancelJump,
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={name} subtitle={subtitle} onBack={goBack}>
        <View style={styles.toolbarStack}>
          {chokPortion && available ? (
            <ChokWeekControls
              slots={chokSlotsOf(chokPortion.parashiyot[0])}
              slot={chokPortion.slot}
              onSlot={setChokSlot}
              names={chokPortion.parashiyot.map((parasha) => chokParashaName(parasha, language))}
              choice={doubleChoice ?? 'first'}
              onChoice={chooseDouble}
              asking={asking}
              onAskClose={() => setAsking(false)}
            />
          ) : null}
          {picker.length > 1 && currentEntry ? (
            <Pressable
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`${t('siddur.pickSection')}: ${titleOf(currentEntry)}`}
              style={({ pressed }) => [
                styles.picker,
                { backgroundColor: pressed ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)' },
              ]}
            >
              <Text style={[typography.bodyBold, styles.pickerLabel, { color: colors.headerText }]} numberOfLines={1}>
                {titleOf(currentEntry)}
              </Text>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M6 9l6 6 6-6"
                  stroke={colors.headerText}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Pressable>
          ) : null}
          <View style={styles.toolbar}>
            <PlayToggle on={autoScrollOn} onPress={toggleAutoScroll} accessibilityLabel={t('siddur.autoScroll')} />
            <ScrollSpeedStepper compact tone="header" level={scrollSpeed} onChange={setScrollSpeed} />
            <SizeButton
              label="A−"
              accessibilityLabel={t('siddur.smaller')}
              disabled={currentIndex === 0}
              onPress={() => setFontSize(SIDDUR_FONT_SIZES[Math.max(0, currentIndex - 1)])}
            />
            <SizeButton
              label="A+"
              accessibilityLabel={t('siddur.larger')}
              disabled={currentIndex === SIDDUR_FONT_SIZES.length - 1}
              onPress={() => setFontSize(SIDDUR_FONT_SIZES[Math.min(SIDDUR_FONT_SIZES.length - 1, currentIndex + 1)])}
            />
            {hasMinyanPassages ? (
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel={t('settings.prayerMode')}
                style={styles.prayerMode}
              >
                <SegmentedControl
                  tone="header"
                  options={PRAYER_MODES.map((mode) => ({ value: mode, label: t(`prayerMode.${mode}`) }))}
                  value={prayerMode}
                  onChange={changePrayerMode}
                />
              </View>
            ) : null}
          </View>
        </View>
      </ScreenHeader>

      {body ?? (
        <Animated.FlatList
          ref={listRef}
          data={sections}
          extraData={listExtraData}
          keyExtractor={(section) => section.title.he}
          initialNumToRender={4}
          windowSize={renderingAll ? Number.POSITIVE_INFINITY : undefined}
          maxToRenderPerBatch={renderingAll ? sections.length : undefined}
          viewabilityConfig={SECTION_VIEWABILITY}
          onViewableItemsChanged={onViewableSectionsChanged}
          contentContainerStyle={styles.content}
          onScrollToIndexFailed={() => {
            jumpMissed.current = true;
          }}
          onScroll={autoScroll.scrollHandler}
          animatedProps={autoScroll.animatedProps}
          {...autoScroll.webInput}
          scrollEventThrottle={16}
          onLayout={autoScroll.onLayout}
          onContentSizeChange={autoScroll.onContentSizeChange}
          renderItem={({ item: section }) => (
            <>
              {section.headings?.map((heading) => (
                <Text
                  key={heading.he}
                  accessibilityRole="header"
                  style={[
                    heading.level === 1 ? typography.title : typography.heading,
                    styles.sectionHeading,
                    { color: colors.goldText },
                  ]}
                >
                  {nameOf(heading)}
                </Text>
              ))}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.surface },
                  shadowStyle(colors.shadow, shadowPresets.cardSoft),
                ]}
              >
                {sectionCard(section)}
              </View>
            </>
          )}
          ListFooterComponent={
            <>
              {doneTarget ? (
                doneTarget.done ? (
                  <View style={styles.doneRow}>
                    <MitzvahIcon name="check" size={DONE_ICON_SIZE} color={colors.safe} />
                    <Text style={[typography.bodyBold, { color: colors.safe }]}>{t('siddur.doneAlready')}</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => finish(doneTarget.id, doneTarget.date)}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.doneBtn,
                      { backgroundColor: colors.gold, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Text style={[typography.heading, { color: colors.onGold }]}>{t('siddur.done')}</Text>
                  </Pressable>
                )
              ) : null}

              {readyText?.dedication ? (
                <Text style={[typography.caption, styles.dedication, { color: colors.textSub }]}>
                  {readyText.dedication}
                </Text>
              ) : null}

              {readyText?.credits.length ? (
                <View style={styles.credits}>
                  <Text style={[typography.captionBold, { color: colors.textSub }]}>{t('siddur.sources')}</Text>
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                    {t('siddur.adapted')}
                  </Text>
                  {readyText.credits.map((credit) => (
                    <Pressable
                      key={credit.title}
                      onPress={() => Linking.openURL(credit.url).catch(() => {})}
                      accessibilityRole="link"
                    >
                      <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
                        {credit.title} · {credit.license}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          }
        />
      )}

      <BottomSheet visible={pickerOpen} title={t('siddur.pickSection')} onClose={() => setPickerOpen(false)}>
        <ScrollView ref={pickerRef} style={styles.sheetList}>
          {picker.map((entry) => {
            const selected = entry.index === currentEntry?.index;
            return (
              <SheetAction
                key={entry.index}
                label={titleOf(entry)}
                selected={selected}
                onLayout={
                  selected
                    ? (event) =>
                        pickerRef.current?.scrollTo({
                          y: Math.max(0, event.nativeEvent.layout.y - 96),
                          animated: false,
                        })
                    : undefined
                }
                onPress={() => {
                  setPickerOpen(false);
                  jumpTo(entry.index);
                }}
              />
            );
          })}
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

function Message({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <Text style={[typography.body, { color: colors.textSub, textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

function SizeButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={[styles.sizeBtn, { backgroundColor: HEADER_PILL_BG, opacity: disabled ? 0.4 : 1 }]}
    >
      <Text style={[typography.captionBold, { color: colors.headerText }]}>{label}</Text>
    </Pressable>
  );
}

function PlayToggle({
  on,
  onPress,
  accessibilityLabel,
}: {
  on: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: on }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.roundBtn,
        on
          ? { backgroundColor: colors.gold, borderColor: colors.gold }
          : { backgroundColor: HEADER_PILL_BG, borderColor: PILL_BORDER },
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Svg width={14} height={14} viewBox="0 0 24 24">
        <Path d={on ? PAUSE_PATH : PLAY_PATH} fill={on ? colors.onGold : colors.headerText} />
      </Svg>
    </Pressable>
  );
}

function OptionalToggle({
  label,
  caption,
  expanded,
  onPress,
  large = false,
  tone = 'optional',
}: {
  label: string;
  caption?: string;
  expanded: boolean;
  onPress: () => void;
  large?: boolean;
  tone?: 'optional' | 'minyan';
}) {
  const { colors } = useTheme();
  const accent = tone === 'minyan' ? colors.minyan : colors.optional;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      aria-expanded={expanded}
      style={({ pressed }) => [
        styles.optionalToggle,
        { backgroundColor: tone === 'minyan' ? colors.surface2 : colors.optionalBg, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <View style={styles.optionalLabel}>
        <Text style={[large ? typography.heading : typography.bodyBold, { color: accent }]}>{label}</Text>
        {caption ? <Text style={[typography.caption, { color: accent }]}>{caption}</Text> : null}
      </View>
      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
        <Path
          d={expanded ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}
          stroke={accent}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

function SegmentView({
  segment,
  fontSize,
  showEnglish,
  color,
}: {
  segment: SiddurSegment;
  fontSize: number;
  showEnglish: boolean;
  color: string;
}) {
  const { colors } = useTheme();
  const runStyle = (run: Run) => {
    if (run.s === 'n') {
      return { fontFamily: fontFamilies.heebo.regular, fontSize: Math.round(fontSize * 0.62), color: colors.textMuted };
    }
    if (run.s === 'b') return { fontFamily: fontFamilies.siddur.bold };
    if (run.s === 't') return { fontSize: Math.round(fontSize * 0.82), color: colors.textSub };
    return null;
  };
  return (
    <View style={styles.segment}>
      {segment.he.map((runs, index) => (
        <Text
          key={index}
          style={[
            styles.hebrew,
            { fontFamily: fontFamilies.siddur.regular, fontSize, lineHeight: siddurLineHeight(fontSize), color },
          ]}
        >
          {runs.map((run, runIndex) => (
            <Text key={runIndex} style={runStyle(run)}>
              {run.t}
            </Text>
          ))}
        </Text>
      ))}
      {showEnglish && segment.en ? (
        <Text
          style={[
            styles.english,
            { fontSize: Math.round(fontSize * 0.68), lineHeight: Math.round(fontSize * 1.05), color: colors.textSub },
          ]}
        >
          {segment.en}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  roundBtn: {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeBtn: {
    flexShrink: 0,
    minWidth: 34,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  toolbarStack: {
    gap: spacing.sm,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  prayerMode: {
    flex: 1,
    minWidth: 104,
  },
  picker: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  pickerLabel: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionHeading: {
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  segment: {
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  addedToday: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  addedTodayLabel: {
    textAlign: RIGHT_EDGE,
    paddingHorizontal: spacing.sm,
    marginBottom: 2,
  },
  optionalToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  optionalLabel: {
    flex: 1,
  },
  labeledBody: {
    marginBottom: spacing.sm,
  },
  labeledLeftEdge: {
    borderLeftWidth: 2,
    paddingLeft: spacing.xs,
  },
  labeledRightEdge: {
    borderRightWidth: 2,
    paddingRight: spacing.xs,
  },
  minyanLabel: {
    paddingHorizontal: spacing.sm,
    marginBottom: 2,
  },
  hebrew: {
    textAlign: RIGHT_EDGE,
    writingDirection: 'rtl',
  },
  english: {
    fontFamily: fontFamilies.heebo.regular,
    textAlign: LEFT_EDGE,
    writingDirection: 'ltr',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  pill: {
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  doneBtn: {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    marginTop: spacing.xs,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  dedication: {
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  credits: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
  sheetList: {
    maxHeight: 420,
  },
});
