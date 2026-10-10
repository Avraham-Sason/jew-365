import React, { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { downloadNewUpdate, reloadIntoUpdate } from '@/services/appUpdates';
import { useTheme } from '@/theme/ThemeProvider';
import { shadowPresets, shadowStyle } from '@/theme/shadowStyle';
import { radius, spacing } from '@/theme/tokens';
import { useI18n } from '@/i18n';
import { Banner } from './Banner';
import { useQuietBlock } from './ShabbatScreen';

// Floats over every screen once an update is downloaded (the user's call, 2026-10-10), until a tap
// reloads into it. It also owns the foreground check for a new update, so the check runs whatever
// screen the app comes back to.
export function UpdateBanner() {
  const { isUpdatePending } = Updates.useUpdates();
  const quiet = useQuietBlock() !== null;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useI18n();

  useEffect(() => {
    downloadNewUpdate().catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') downloadNewUpdate().catch(() => {});
    });
    return () => sub.remove();
  }, []);

  if (!isUpdatePending || quiet) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface },
          shadowStyle(colors.shadowStrong, shadowPresets.raised),
        ]}
      >
        <Banner tone="safe" text={t('home.updateReady')} onPress={() => reloadIntoUpdate()} style={styles.banner} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    start: 0,
    end: 0,
    paddingHorizontal: spacing.lg,
    zIndex: 900,
    elevation: 900,
  },
  card: {
    borderRadius: radius.lg,
  },
  banner: {
    marginBottom: 0,
  },
});
