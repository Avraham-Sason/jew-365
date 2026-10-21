import React, { useEffect } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';
import { MitzvahIcon } from './MitzvahIcon';

const TICK_ICON_SIZE = 16;
const TICK_ICON_STROKE = 2.2;
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
    <Animated.View style={[styles.row, animStyle]}>
      <View style={[styles.tick, { backgroundColor: colors.gold }]}>
        <MitzvahIcon name="check" size={TICK_ICON_SIZE} color={colors.onGold} strokeWidth={TICK_ICON_STROKE} />
      </View>
      <Text style={[typography.body, styles.name, { color: colors.text }]}>{name}</Text>
      <Text style={[typography.caption, { color: colors.textSub }]}>{time}</Text>
      {onUndo ? (
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel={undoLabel ?? t('home.undo')}
          hitSlop={8}
          style={[styles.undoPill, { backgroundColor: colors.goldLight }]}
        >
          {undoLabel ? (
            <Text style={[typography.captionBold, { color: colors.goldText }]}>{undoLabel}</Text>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  tick: { width: 28, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1 },
  undoPill: {
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
});
