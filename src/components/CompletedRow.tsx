import React, { useEffect } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { fontFamilies, typography } from '@/theme/typography';
import { useI18n } from '@/i18n';
import { MitzvahIcon } from './MitzvahIcon';

const UNDO_ICON_SIZE = 16;
const UNDO_ICON_STROKE = 2.2;

type Props = {
  name: string;
  time: string;
  onPress?: () => void;
  onUndo?: () => void;
  undoLabel?: string;
};

export function CompletedRow({ name, time, onPress, onUndo, undoLabel }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(7);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 300 });
    translateY.value = withTiming(0, { duration: 300 });
  }, [opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const content = (
    <Animated.View style={[styles.row, { borderBottomColor: colors.border }, animStyle]}>
      <View style={[styles.tick, { backgroundColor: colors.gold }]}>
        <Svg width={11} height={11} viewBox="0 0 11 11" fill="none">
          <Path
            d="M1.5 5.5L4 8L9.5 3"
            stroke={colors.onGold}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
      <Text style={[typography.body, styles.name, { color: colors.textSub, textDecorationLine: 'line-through' }]}>
        {name}
      </Text>
      <Text style={[typography.small, { color: colors.textMuted }]}>{time}</Text>
      {onUndo ? (
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel={undoLabel ?? t('home.undo')}
          hitSlop={8}
          style={[styles.undoBtn, { borderColor: colors.border }]}
        >
          {undoLabel ? (
            <Text style={[typography.small, { color: colors.goldText, fontFamily: fontFamilies.heebo.bold }]}>
              {undoLabel}
            </Text>
          ) : (
            <MitzvahIcon name="undo" size={UNDO_ICON_SIZE} color={colors.goldText} strokeWidth={UNDO_ICON_STROKE} />
          )}
        </Pressable>
      ) : null}
    </Animated.View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} android_ripple={{ color: colors.border }}>
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tick: { width: 24, height: 24, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1 },
  undoBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
});
