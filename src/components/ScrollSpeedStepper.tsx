import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MitzvahIcon, type IconName } from '@/components/MitzvahIcon';
import { SIDDUR_SCROLL_SPEEDS, scrollSpeedLevel } from '@/stores/useUserStore';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';

const STEP_ICON_SIZE = 16;
const STEP_ICON_STROKE = 2.8;
const STEP_HEIGHT = 30;

type Props = {
  level: number;
  onChange: (level: number) => void;
  compact?: boolean;
};

export function ScrollSpeedStepper({ level, onChange, compact = false }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const current = scrollSpeedLevel(level);
  const max = SIDDUR_SCROLL_SPEEDS.length;
  const textColor = colors.text;
  const step = (icon: IconName, accessibilityLabel: string, next: number) => {
    const disabled = next < 1 || next > max;
    return (
      <Pressable
        onPress={() => onChange(next)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        hitSlop={4}
        style={({ pressed }) => [
          styles.step,
          compact && styles.stepCompact,
          { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
        ]}
      >
        <MitzvahIcon name={icon} size={STEP_ICON_SIZE} color={textColor} strokeWidth={STEP_ICON_STROKE} />
      </Pressable>
    );
  };
  return (
    <View style={[styles.group, { backgroundColor: colors.surface2 }]}>
      {step('minus', t('siddur.scrollSlower'), current - 1)}
      <Text
        style={[typography.captionBold, styles.level, compact && styles.levelCompact, { color: textColor }]}
        accessibilityLabel={t('siddur.scrollSpeed', { level: current, max })}
      >
        {current}
      </Text>
      {step('plus', t('siddur.scrollFaster'), current + 1)}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
  },
  step: {
    minWidth: 32,
    minHeight: STEP_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCompact: {
    minWidth: 26,
  },
  level: {
    minWidth: 18,
    textAlign: 'center',
  },
  levelCompact: {
    minWidth: 16,
  },
});
