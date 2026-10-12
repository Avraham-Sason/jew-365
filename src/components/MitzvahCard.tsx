import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { shadowPresets, shadowStyle } from '@/theme/shadowStyle';
import { fontFamilies, typography } from '@/theme/typography';
import { durations, radius, spacing } from '@/theme/tokens';
import { IconTile } from './IconTile';
import { MitzvahIcon, type IconName } from './MitzvahIcon';
import { TimeRibbon } from './TimeRibbon';
import { useI18n } from '@/i18n';

const TILE_SIZE = 38;
const BUTTON_SIZE = 30;
const DONE_LINE_ICON_SIZE = 14;
const URGENT_LINE_ICON_SIZE = 12;
const URGENT_LINE_ICON_STROKE = 2;

type Props = {
  name: string;
  icon?: IconName;
  timeLeft: string;
  pct: number;
  urgent?: boolean;
  done?: boolean;
  stamping?: boolean;
  readOnly?: boolean;
  statusText?: string;
  statusTone?: 'muted' | 'safe' | 'urgent';
  hideProgress?: boolean;
  onComplete?: () => void;
  onLongPress?: () => void;
  onPress?: () => void;
  onOpenText?: () => void;
};

function OpenBook({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 13 13" fill="none">
      <Path
        d="M6.5 3.4C5.3 2.6 3.7 2.2 1.6 2.2v7.7c2.1 0 3.7.4 4.9 1.2 1.2-.8 2.8-1.2 4.9-1.2V2.2c-2.1 0-3.7.4-4.9 1.2zM6.5 3.4v7.7"
        stroke={color}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Checkmark({ color, size = 13, width = 1.8 }: { color: string; size?: number; width?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 13 13" fill="none">
      <Path d="M2 6.5L5 9.5L11 3.5" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function MitzvahCard({
  name,
  icon = 'custom',
  timeLeft,
  pct,
  urgent,
  done,
  stamping,
  readOnly,
  statusText,
  statusTone = 'muted',
  hideProgress,
  onComplete,
  onLongPress,
  onPress,
  onOpenText,
}: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const bg = done ? colors.surface2 : urgent ? colors.urgentBg : colors.surface;
  const bdr = done ? colors.border : urgent ? colors.urgentBorder : colors.border;
  const statusColor = statusTone === 'urgent' ? colors.urgent : statusTone === 'safe' ? colors.safe : colors.textMuted;
  const canComplete = !readOnly && !done && Boolean(onComplete);
  const buttonCount = (onOpenText ? 1 : 0) + (canComplete || done ? 1 : 0);
  const [rowHeight, setRowHeight] = useState(TILE_SIZE);

  const stampOpacity = useSharedValue(0);
  const stampScale = useSharedValue(2.8);
  const stampRotate = useSharedValue(-18);

  useEffect(() => {
    if (stamping) {
      stampOpacity.value = 0;
      stampScale.value = 2.8;
      stampRotate.value = -18;
      stampOpacity.value = withSequence(
        withTiming(1, { duration: durations.stamp * 0.2 }),
        withDelay(durations.stamp * 0.5, withTiming(0, { duration: durations.stamp * 0.3 })),
      );
      stampScale.value = withSequence(
        withTiming(1.06, { duration: durations.stamp * 0.2 }),
        withTiming(1, { duration: durations.stamp * 0.52 }),
        withTiming(0.96, { duration: durations.stamp * 0.28 }),
      );
      stampRotate.value = withTiming(-12, { duration: durations.stamp * 0.2 });
    }
  }, [stamping, stampOpacity, stampScale, stampRotate]);

  const stampStyle = useAnimatedStyle(() => ({
    opacity: stampOpacity.value,
    transform: [{ scale: stampScale.value }, { rotate: `${stampRotate.value}deg` }],
  }));

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: bg, borderColor: bdr, opacity: done ? 0.55 : 1 },
        shadowStyle(colors.shadow, shadowPresets.card),
      ]}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={!onPress && !onLongPress}
        accessible
        accessibilityRole="button"
        accessibilityLabel={[name, statusText, done ? t('state.completed') : timeLeft].filter(Boolean).join(', ')}
        // Without this the long-press menu — the only way to skip a mitzvah for the day without
        // falsely marking it done — is unreachable with a screen reader.
        accessibilityActions={onLongPress ? [{ name: 'longpress', label: t('home.quick.title') }] : undefined}
        onAccessibilityAction={onLongPress ? () => onLongPress() : undefined}
        style={({ pressed }) => [styles.body, { opacity: !done && pressed && onPress ? 0.85 : 1 }]}
      >
        <View
          style={[styles.row, { paddingEnd: buttonCount * (BUTTON_SIZE + spacing.md) }]}
          onLayout={(event) => setRowHeight(event.nativeEvent.layout.height)}
        >
          <IconTile name={icon} tone={done ? 'done' : 'accent'} size={TILE_SIZE} />
          <View style={styles.meta}>
            <Text
              style={[
                typography.bodyBold,
                {
                  color: done ? colors.textSub : colors.text,
                  textDecorationLine: done ? 'line-through' : 'none',
                },
              ]}
              numberOfLines={1}
            >
              {name}
            </Text>
            {done && (
              <View style={styles.iconLine}>
                <MitzvahIcon name="check" size={DONE_LINE_ICON_SIZE} color={colors.safe} />
                <Text style={[typography.micro, { color: colors.safe, fontFamily: fontFamilies.heebo.semibold }]}>
                  {t('state.completed')}
                </Text>
              </View>
            )}
            {!done && statusText ? (
              <Text
                style={[
                  typography.micro,
                  { color: statusColor, fontFamily: fontFamilies.heebo.semibold, marginTop: 2 },
                ]}
              >
                {statusText}
              </Text>
            ) : null}
            {urgent && !done && !statusText && (
              <View style={styles.iconLine}>
                <MitzvahIcon
                  name="warning"
                  size={URGENT_LINE_ICON_SIZE}
                  color={colors.urgent}
                  strokeWidth={URGENT_LINE_ICON_STROKE}
                />
                <Text style={[typography.micro, { color: colors.urgent, fontFamily: fontFamilies.heebo.semibold }]}>
                  {t('state.urgentSoon')}
                </Text>
              </View>
            )}
            {readOnly && !done && !statusText && (
              <Text
                style={[
                  typography.micro,
                  { color: colors.textMuted, fontFamily: fontFamilies.heebo.semibold, marginTop: 2 },
                ]}
              >
                {t('state.readOnly')}
              </Text>
            )}
          </View>
        </View>
        {!done && !hideProgress ? <TimeRibbon pct={pct} timeLeft={timeLeft} /> : null}
      </Pressable>
      {buttonCount > 0 ? (
        // The buttons are siblings of the body, laid over its reserved end padding: a button inside the
        // body's button is invalid DOM on the web and unreachable to a screen reader on native.
        <View pointerEvents="box-none" style={[styles.actions, { height: rowHeight }]}>
          {onOpenText ? (
            <Pressable
              onPress={onOpenText}
              accessibilityRole="button"
              accessibilityLabel={t('siddur.open')}
              hitSlop={8}
              style={[styles.checkBtn, { borderColor: urgent ? colors.urgent : colors.border }]}
            >
              <OpenBook color={urgent ? colors.urgent : colors.textMuted} />
            </Pressable>
          ) : null}
          {canComplete ? (
            <Pressable
              onPress={onComplete}
              onLongPress={onLongPress}
              accessibilityRole="button"
              accessibilityLabel={t('state.completeAction', { name })}
              hitSlop={8}
              style={[
                styles.checkBtn,
                {
                  borderColor: urgent ? colors.urgent : colors.border,
                },
              ]}
            >
              <Checkmark color={urgent ? colors.urgent : colors.textMuted} />
            </Pressable>
          ) : done ? (
            <View
              pointerEvents="none"
              style={[styles.checkBtn, { backgroundColor: colors.gold, borderColor: colors.gold }]}
            >
              <Checkmark color={colors.onGold} />
            </View>
          ) : null}
        </View>
      ) : null}
      {stamping && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={[styles.stampOverlay, { backgroundColor: bg + 'BB' }]}>
            <Animated.View
              style={[
                styles.stamp,
                {
                  borderColor: colors.gold,
                },
                shadowStyle(colors.goldLight, shadowPresets.glow),
                stampStyle,
              ]}
            >
              <Text style={[styles.stampText, { color: colors.gold }]}>{t('state.stamped')}</Text>
            </Animated.View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  body: { padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  meta: { flex: 1, minWidth: 0 },
  iconLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  actions: {
    position: 'absolute',
    top: spacing.lg,
    end: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  checkBtn: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stamp: {
    borderWidth: 3,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.sm,
  },
  stampText: {
    fontSize: 21,
    fontFamily: fontFamilies.heebo.black,
    letterSpacing: 3,
  },
});
