import 'expo-dev-client';
// eslint-disable-next-line import/no-duplicates -- must run before anything else; the named import below is the second use
import 'react-native-gesture-handler';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  DevSettings,
  I18nManager,
  View,
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import * as Sentry from '@sentry/react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// eslint-disable-next-line import/no-duplicates
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  Heebo_400Regular,
  Heebo_600SemiBold,
  Heebo_700Bold,
  Heebo_800ExtraBold,
  Heebo_900Black,
} from '@expo-google-fonts/heebo';
import { NotoSerifHebrew_400Regular, NotoSerifHebrew_700Bold } from '@expo-google-fonts/noto-serif-hebrew';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { BRAND, T_LIGHT } from '@/theme/colors';
import { radius, spacing } from '@/theme/tokens';
import { fontFamilies } from '@/theme/typography';
import { useUserStore } from '@/stores/useUserStore';
import { initNotificationHandlers } from '@/services/NotificationScheduler';
import { captureException } from '@/services/crashReporting';
import {
  initNotificationResponseHandler,
  consumePendingNotificationRoute,
  openLaunchNotificationResponse,
} from '@/services/notificationResponseHandler';
import { setLocale, t } from '@/i18n';
import { StorageService } from '@/services/StorageService';
import { HebcalService } from '@/services/HebcalService';
import { QuietBlockContext, ShabbatScreen } from '@/components/ShabbatScreen';
import { UpdateBanner } from '@/components/UpdateBanner';
import { nextQuietBoundary, quietBlockAt } from '@/utils/skipRules';
import { CHECK_IN_PROMPTED_KEY, latestCheckIn } from '@/utils/checkIn';
import { getAllMitzvot } from '@/data/customMitzvotAdapter';
import { enabledSinceOf, useMitzvotStore } from '@/stores/useMitzvotStore';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { HolyBlock, Location } from '@/types/zmanim';

function syncDocumentDirection(language: 'he' | 'en') {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const dir = language === 'he' ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', language);
  document.body?.setAttribute('dir', dir);
}

async function reloadApp() {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.location.reload();
    return;
  }
  try {
    await Updates.reloadAsync();
  } catch {
    if (__DEV__ && DevSettings && typeof DevSettings.reload === 'function') {
      DevSettings.reload();
    }
  }
}

const RTL_BOOTSTRAP_KEY = 'layout:rtl-bootstrapped';

function syncLayoutDirection(language: 'he' | 'en', allowReload = false) {
  const wantRTL = language === 'he';
  setLocale(language);
  syncDocumentDirection(language);
  I18nManager.allowRTL(wantRTL);
  if (I18nManager.isRTL !== wantRTL) {
    I18nManager.forceRTL(wantRTL);
    if (allowReload && Platform.OS !== 'web') {
      reloadApp();
    }
  }
}

// `I18nManager.isRTL` is snapshotted at JS load and `forceRTL` only takes effect on the NEXT
// process start, so a fresh install on a non-RTL device renders the whole first session LTR — the
// root `direction: 'rtl'` style is iOS-only, so Android gets nothing. Reload once, guarded by a
// persisted flag so a reload that does not take cannot become a boot loop.
const initialLanguage = useUserStore.getState().language;
const needsRtlBootstrap =
  Platform.OS !== 'web' &&
  I18nManager.isRTL !== (initialLanguage === 'he') &&
  !StorageService.get<boolean>(RTL_BOOTSTRAP_KEY);
if (needsRtlBootstrap) StorageService.set(RTL_BOOTSTRAP_KEY, true);
syncLayoutDirection(initialLanguage, needsRtlBootstrap);

SplashScreen.preventAutoHideAsync().catch(() => {});

const QUIET_RECHECK_MS = 60 * 60_000;

// The Shabbat / Yom Tov block the app is inside right now, re-read the moment candle lighting or
// tzeit passes while the app is open, and on every return to the foreground — JS timers do not run
// while the app is in the background. Before onboarding the location is only a default guess, so
// it cannot decide that the user is inside Shabbat.
function useCurrentQuietBlock(location: Location, enabled: boolean): { block: HolyBlock | null; now: number } {
  const [now, setNow] = useState(() => Date.now());
  const block = useMemo(() => (enabled ? quietBlockAt(new Date(now), location) : null), [now, location, enabled]);

  useEffect(() => {
    const boundary = nextQuietBoundary(new Date(now), location);
    const untilBoundary = boundary ? boundary.getTime() - Date.now() + 1000 : QUIET_RECHECK_MS;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1000, Math.min(untilBoundary, QUIET_RECHECK_MS)));
    return () => clearTimeout(timer);
  }, [now, location]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  return { block, now };
}

function RootInner() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const isOnboarded = useUserStore((s) => s.isOnboarded);
  const language = useUserStore((s) => s.language);
  const location = useUserStore((s) => s.location);
  const { block: quietBlock, now } = useCurrentQuietBlock(location, isOnboarded);
  const quiet = quietBlock !== null;

  // The first time the app is open after a block ends, it opens that block's check-in by itself.
  // Re-checked when the block ends, on every return to the foreground, and once onboarding has
  // handed over to the tabs — a push before that is replaced by the onboarding guard. Only the
  // check-in screen records that it was shown, so a push that never landed is retried.
  const firstSegment = segments[0];
  useEffect(() => {
    if (quiet || !isOnboarded || firstSegment === 'checkin' || firstSegment === 'onboarding') return;
    const user = useUserStore.getState();
    const active = useMitzvotStore.getState().activeMitzvot;
    const { completions, skipped, checkIns } = useCompletionsStore.getState();
    const checkIn = latestCheckIn({
      mitzvot: getAllMitzvot(user.nusach).filter((mitzvah) => active[mitzvah.id]?.enabled),
      completions,
      skipped,
      checkIns,
      enabledSince: enabledSinceOf(active),
      location: user.location,
      settings: { nusach: user.nusach, halachicOpinions: user.halachicOpinions, inIsrael: user.inIsrael },
    });
    if (!checkIn?.open || StorageService.get<string>(CHECK_IN_PROMPTED_KEY) === checkIn.id) return;
    router.push('/checkin');
  }, [quiet, isOnboarded, now, router, firstSegment]);

  // Unwind everything stacked under the Shabbat screen — when the block starts, and again after any
  // navigation inside it — so nothing stale stays mounted for a day, above all the reader, which
  // keeps the screen awake while it is open.
  useEffect(() => {
    if (!quiet) return;
    try {
      if (router.canDismiss()) router.dismissAll();
    } catch {}
  }, [quiet, segments, router]);

  useEffect(() => {
    const first = segments[0];
    const inOnboarding = first === 'onboarding';
    if (!isOnboarded && !inOnboarding) {
      router.replace('/onboarding');
    } else if (isOnboarded && inOnboarding) {
      router.replace('/(tabs)/home');
    }
  }, [isOnboarded, segments, router]);

  const prevLanguageRef = useRef(language);
  useEffect(() => {
    const changed = prevLanguageRef.current !== language;
    syncLayoutDirection(language, changed);
    prevLanguageRef.current = language;
  }, [language]);

  useEffect(() => {
    const sub = initNotificationResponseHandler();
    // Replays a tap that arrived before the router was mounted (cold start from a notification).
    consumePendingNotificationRoute();
    return () => sub.remove();
  }, []);

  const launchResponseChecked = useRef(false);
  useEffect(() => {
    if (launchResponseChecked.current || firstSegment !== '(tabs)') return;
    launchResponseChecked.current = true;
    openLaunchNotificationResponse();
  }, [firstSegment]);

  return (
    <QuietBlockContext.Provider value={quietBlock}>
      <View style={{ flex: 1, direction: language === 'he' ? 'rtl' : 'ltr' }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View
          style={{ flex: 1 }}
          importantForAccessibility={quiet ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={quiet}
        >
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="mitzvah/[id]" options={{ presentation: 'card' }} />
            <Stack.Screen name="siddur/index" options={{ presentation: 'card' }} />
            <Stack.Screen name="siddur/[id]" options={{ presentation: 'card' }} />
            <Stack.Screen name="day/[date]" options={{ presentation: 'card' }} />
            <Stack.Screen name="custom-mitzvah" options={{ presentation: 'card' }} />
            <Stack.Screen name="checkin" options={{ presentation: 'card' }} />
            <Stack.Screen name="hilulot" options={{ presentation: 'card' }} />
            <Stack.Screen name="rosh-chodesh" options={{ presentation: 'card' }} />
            <Stack.Screen name="report" options={{ presentation: 'card' }} />
            <Stack.Screen name="schedule" options={{ presentation: 'card' }} />
            <Stack.Screen name="mitzvot" options={{ presentation: 'card' }} />
            <Stack.Screen name="taharah" options={{ presentation: 'card' }} />
          </Stack>
        </View>
        {isOnboarded ? <UpdateBanner /> : null}
        <ShabbatScreen
          block={quietBlock}
          subtitle={quietBlock ? HebcalService.getHebrewDateAt(new Date(), location).hebrewDateStr : undefined}
        />
      </View>
    </QuietBlockContext.Provider>
  );
}

// Picked up automatically by expo-router. Deliberately self-contained: it must render even when
// ThemeProvider or a store is the thing that failed, so it uses no context; its one hook reports
// the error once.
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => {
    captureException(error, { scope: 'render' });
  }, [error]);

  return (
    <View style={errorStyles.wrap}>
      <Text style={errorStyles.title}>{t('errors.boundaryTitle')}</Text>
      <Text style={errorStyles.body}>{t('errors.boundaryBody')}</Text>
      {__DEV__ ? <Text style={errorStyles.detail}>{error.message}</Text> : null}
      <Pressable onPress={() => retry()} style={errorStyles.button} accessibilityRole="button">
        <Text style={errorStyles.buttonLabel}>{t('errors.retry')}</Text>
      </Pressable>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: BRAND.parchment,
  },
  title: { fontFamily: fontFamilies.heebo.bold, fontSize: 20, color: BRAND.navy, textAlign: 'center' },
  body: {
    fontSize: 15,
    color: T_LIGHT.textSub,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 22,
  },
  detail: { fontSize: 12, color: T_LIGHT.textMuted, textAlign: 'center', marginTop: spacing.lg },
  button: {
    marginTop: spacing.xxl,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxxl,
    backgroundColor: BRAND.gold,
  },
  buttonLabel: { fontFamily: fontFamilies.heebo.bold, fontSize: 16, color: BRAND.onGold },
});

function RootLayout() {
  // A failed font fetch must not brick the app: `loaded` would stay false forever, leaving a bare
  // spinner behind an un-hidden splash with notifications never initialised and no way out.
  const [loaded, fontError] = useFonts({
    Heebo_400Regular,
    Heebo_600SemiBold,
    Heebo_700Bold,
    Heebo_800ExtraBold,
    Heebo_900Black,
    NotoSerifHebrew_400Regular,
    NotoSerifHebrew_700Bold,
  });
  const ready = loaded || Boolean(fontError);

  useEffect(() => {
    if (!ready) return undefined;
    SplashScreen.hideAsync().catch(() => {});
    return initNotificationHandlers();
  }, [ready]);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <RootInner />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
