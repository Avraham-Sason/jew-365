import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, PressableStateCallbackType, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import Animated, { FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipRow } from '@/components/ChipRow';
import { ONBOARDING_STEPS, OnboardingDots } from '@/components/OnboardingDots';
import { LocationService } from '@/services/LocationService';
import { reportError } from '@/services/errors';
import { requestNotificationPermissions, syncNotificationPermissionStatus } from '@/services/NotificationScheduler';
import { useUserStore } from '@/stores/useUserStore';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';
import { CITIES, findCityByName, getLocationName } from '@/data/cities';

const CITY_NAMES = CITIES.map((city) => city.name);

export default function OnboardingLocationScreen() {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const [busy, setBusy] = useState(false);
  const [requesting, setRequesting] = useState(false);
  // Only an answer to this screen's own request counts as "blocked": the stored status reads
  // 'denied' for a permission never asked yet.
  const [refused, setRefused] = useState(false);
  const notificationsGranted = user.notificationPermission === 'granted';
  const locationReady = user.locationStatus === 'ready';

  useEffect(() => {
    syncNotificationPermissionStatus().catch((error) => reportError('schedule', error));
  }, []);

  const refreshLocation = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const resolved = await LocationService.getCurrentLocation();
      if (resolved.location) {
        user.setLocationState(resolved.location, resolved.status, resolved.source);
      } else {
        user.setLocationStatus(resolved.status);
      }
    } finally {
      // Without this a rejection left the button reading "..." forever, dead-ending onboarding.
      setBusy(false);
    }
  };

  const allowNotifications = async () => {
    if (requesting) return;
    Haptics.selectionAsync().catch(() => {});
    setRequesting(true);
    try {
      const granted = await requestNotificationPermissions();
      user.setNotificationPermission(granted ? 'granted' : 'denied');
      setRefused(!granted);
    } catch {
      setRefused(true);
    } finally {
      setRequesting(false);
    }
  };

  const pressFeedback = ({ pressed }: PressableStateCallbackType) =>
    pressed ? { opacity: 0.6, transform: [{ scale: 0.97 }] } : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={[typography.title, { color: colors.text }]}>{t('onboarding.locationTitle')}</Text>
      <Text style={[typography.body, { color: colors.textSub, marginTop: spacing.xs }]}>
        {t('onboarding.locationBody')}
      </Text>

      <Card padded style={styles.cardGap}>
        <Text style={[typography.bodyBold, { color: colors.text }]}>{getLocationName(user.location, language)}</Text>
        <Text style={[typography.small, { color: colors.textMuted, marginTop: spacing.xs }]}>
          {t(`settings.locationStatus.${user.locationStatus}`)}
        </Text>
        <Button
          variant="secondary"
          label={busy ? '...' : t('onboarding.locationRefresh')}
          onPress={refreshLocation}
          style={styles.buttonGap}
        />
      </Card>

      <ChipRow
        values={CITY_NAMES}
        selected={user.location.name}
        onSelect={(name) => {
          const city = findCityByName(name);
          if (city) user.setLocationState(city, 'ready', 'manual');
        }}
        renderLabel={(name) => {
          const city = findCityByName(name);
          return city ? getLocationName(city, language) : name;
        }}
        style={styles.cities}
      />

      {notificationsGranted ? null : (
        <Animated.View
          exiting={FadeOut.duration(250)}
          style={[styles.notifyCard, { backgroundColor: colors.goldLight }]}
        >
          <Text style={[typography.subheading, { color: colors.text }]}>{t('onboarding.notificationsTitle')}</Text>
          <Text style={[typography.small, { color: colors.textSub, marginTop: spacing.xs }]}>
            {refused ? t('onboarding.notificationsBlocked') : t('onboarding.notificationsBody')}
          </Text>
          <Pressable
            onPress={refused ? () => Linking.openSettings().catch(() => {}) : allowNotifications}
            disabled={requesting}
            accessibilityRole="button"
            accessibilityState={{ busy: requesting }}
            style={(state) => [styles.notifyBtn, { backgroundColor: colors.surface }, pressFeedback(state)]}
          >
            {requesting ? (
              <ActivityIndicator color={colors.gold} />
            ) : (
              <Text style={[typography.bodyBold, { color: colors.goldText }]}>
                {refused ? t('onboarding.notificationsOpenSettings') : t('onboarding.notificationsAction')}
              </Text>
            )}
          </Pressable>
        </Animated.View>
      )}

      <OnboardingDots step={3} total={ONBOARDING_STEPS} style={styles.dots} />
      <Button label={t('common.continue')} onPress={() => router.push('/onboarding/ready')} disabled={!locationReady} />
      {locationReady ? null : (
        <Text style={[typography.small, styles.locationHint, { color: colors.textMuted }]}>
          {t('onboarding.locationRequired')}
        </Text>
      )}
      <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.backBtn}>
        <Text style={[typography.small, { color: colors.textSub }]}>{t('common.back')}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    padding: spacing.xl,
  },
  cardGap: {
    marginTop: spacing.xl,
  },
  buttonGap: {
    marginTop: spacing.md,
  },
  notifyCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  notifyBtn: {
    minHeight: 48,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  cities: {
    marginTop: spacing.lg,
  },
  dots: {
    marginTop: 'auto',
    marginBottom: spacing.md,
  },
  locationHint: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  backBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
});
